// 3D 逆向运动学（IK）求解器
// 给定肩部世界位置、腕部目标位置、上臂/前臂长度，
// 计算肩部和肘部的本地欧拉旋转角，使腕部（IK 末端）精确到达目标。
//
// 骨骼本地坐标约定（与 Skeleton3D 一致）：
//   - shoulder 骨骼在旋转为 0 时，local -Y 方向指向 elbow
//   - elbow 骨骼在旋转为 0 时，local -Y 方向指向 wrist
//   - 上臂、前臂都沿 -Y 方向延伸
//   - 肘部为铰链关节，主要绕本地 X 轴弯曲（前臂向前抬起）
//
// 使用 Three.js 四元数进行 3D 向量运算，保证任意方向（前/侧/上）
// 都能得到正确的肩旋转。肘部弯曲用余弦定理求屈曲角。
import * as THREE from 'three';
import type { Vec3 } from '@/types/avatar';
import { logger } from '@/modules/debug/logger';

/** IK 求解结果 */
export interface IKResult {
  /** 肩部旋转（欧拉 XYZ，弧度） */
  shoulderRotation: Vec3;
  /** 肘部旋转（欧拉 XYZ，弧度） */
  elbowRotation: Vec3;
}

// 骨骼本地"指向"方向：rot=0 时子关节在 parent 的 -Y 方向
const BONE_REST_DIR = new THREE.Vector3(0, -1, 0);

/**
 * 2 段 IK 求解
 * @param shoulderPos 肩部世界位置
 * @param wristTargetPos 腕部目标世界位置
 * @param upperArmLength 上臂长（肩→肘）
 * @param forearmLength 前臂长（肘→腕）
 * @param side 'left' | 'right'，决定肘部自然弯曲方向的偏向
 */
export function solve(
  shoulderPos: Vec3,
  wristTargetPos: Vec3,
  upperArmLength: number,
  forearmLength: number,
  side: 'left' | 'right' = 'right',
): IKResult {
  const S = new THREE.Vector3(shoulderPos.x, shoulderPos.y, shoulderPos.z);
  const W = new THREE.Vector3(wristTargetPos.x, wristTargetPos.y, wristTargetPos.z);
  const L1 = upperArmLength;
  const L2 = forearmLength;
  const totalLen = L1 + L2;

  // 肩→腕向量
  const toWrist = new THREE.Vector3().subVectors(W, S);
  let dist = toWrist.length();

  // 限制距离，避免无解
  const minReach = Math.abs(L1 - L2) + 1e-4;
  if (dist < minReach) dist = minReach;
  if (dist > totalLen * 0.999) dist = totalLen * 0.999;

  // 目标方向（归一化）
  const dir = toWrist.clone().normalize();

  // === 1. 肩部抬升角（余弦定理） ===
  // 在肩-肘-腕三角形中（SA=L1, AW=L2, SW=dist），
  // shoulderLift 是上臂 SA 相对 SW 方向需抬起的角度（在肩-肘-腕平面内）
  const cosLift = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const shoulderLift = Math.acos(Math.max(-1, Math.min(1, cosLift)));

  // === 2. 确定肘弯曲平面（swivel / 肘引导方向） ===
  // 我们需要选择一个"肘部自然位置"——肘关节位于以 SW 为轴的圆上。
  // 默认让肘指向身体侧下方：使用一个参考向量（大致指向身体前下侧），
  // 然后投影到垂直于 dir 的平面上作为肘部弯曲方向。
  // 左臂肘弯偏 +X（身体中心方向），右臂肘弯偏 -X。
  // 参考方向：先取 "向下" (0,-1,0)，再加一点"朝身体前方" (+Z)，
  // 然后让左右臂分别偏向身体中线（左臂 +X，右臂 -X）。
  const sideBias = side === 'left' ? 0.6 : -0.6;
  const reference = new THREE.Vector3(sideBias, -1.0, 0.3).normalize();

  // 将参考向量投影到垂直于 dir 的平面上，得到肘弯曲方向
  // 投影：ref_proj = ref - (ref·dir) dir；若与 dir 平行则退化，兜底用 (0,0,±1)
  const refDotDir = reference.dot(dir);
  let elbowDir = reference.clone().sub(dir.clone().multiplyScalar(refDotDir));
  if (elbowDir.lengthSq() < 1e-6) {
    const fallback = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0);
    elbowDir = fallback.sub(dir.clone().multiplyScalar(fallback.dot(dir)));
  }
  elbowDir.normalize();

  // === 3. 计算上臂方向向量（从肩 S 指向肘 A） ===
  // 几何推导：肘部在以 dir 为轴、半径 L1*sin(shoulderLift) 的圆上（圆面垂直 dir），
  // 肘部位置 = S + dir*L1*cos(shoulderLift) + elbowDir*L1*sin(shoulderLift)
  // 因此 upperArmDir = dir*cos(shoulderLift) + elbowDir*sin(shoulderLift)
  //
  // 旧实现用 `dir.applyAxisAngle(elbowDir, -shoulderLift)` 是几何错误：
  // applyAxisAngle 让结果在垂直于 elbowDir 的平面内，永远无 elbowDir 分量；
  // 正确公式含 sin(shoulderLift)*elbowDir 分量。旧公式在 A-pose 下因对称性巧合正确，
  // 在 T-pose（upperRestDir 水平）下产生 X 分量符号反转，手臂伸到身体对侧。
  const upperArmDir = dir.clone().multiplyScalar(Math.cos(shoulderLift))
    .add(elbowDir.clone().multiplyScalar(Math.sin(shoulderLift)));

  // === 4. 肩部本地旋转：把 rest 方向 (0,-1,0) 旋转到 upperArmDir ===
  const shoulderQuat = new THREE.Quaternion().setFromUnitVectors(
    BONE_REST_DIR,
    upperArmDir,
  );
  const shoulderEuler = new THREE.Euler().setFromQuaternion(shoulderQuat, 'XYZ');

  // === 5. 肘部本地旋转 ===
  // 肘在 shoulder 的本地坐标系下，其 -Y 轴在肩旋转后实际指向上臂方向（即从肘到腕的参考方向）。
  // 肘需要把前臂从"延续上臂方向"（即与上臂同一直线，沿 upperArmDir 继续）弯曲到指向 W。
  // 计算从 A 到 W 的方向：
  const elbowPos = S.clone().add(upperArmDir.clone().multiplyScalar(L1));
  const forearmDir = new THREE.Vector3().subVectors(W, elbowPos).normalize();

  // "伸直"时前臂方向在上臂坐标系下就是 -Y（延续上臂方向）。
  // 为求肘本地旋转，需要把"伸直方向"（本地 -Y）旋转到"前臂方向（肘本地坐标）"。
  // 前臂方向在肘父坐标系（shoulder 本地）下 = forearmDir_world rotated by inv(shoulderQuat)
  const invShoulder = shoulderQuat.clone().invert();
  const forearmLocalDir = forearmDir.clone().applyQuaternion(invShoulder);

  // 肘部铰链修正：用点积直接计算弯曲角，避免欧拉分解误差。
  // rest 方向 (0,-1,0) 与 forearmLocalDir 的夹角就是肘部屈曲角，
  // 用 acos(clamp(dot, -1, 1)) 精确求值，符号由叉积 Y 分量决定方向。
  const dot = BONE_REST_DIR.dot(forearmLocalDir);
  const clampedDot = Math.max(-1, Math.min(1, dot));
  let elbowAngle = Math.acos(clampedDot);

  // 叉积判断弯曲方向：叉积 Y > 0 表示正方向弯曲（屈曲），< 0 表示反方向（过伸）
  const cross = new THREE.Vector3().crossVectors(BONE_REST_DIR, forearmLocalDir);
  if (cross.y < 0) elbowAngle = -elbowAngle;

  return {
    shoulderRotation: { x: shoulderEuler.x, y: shoulderEuler.y, z: shoulderEuler.z },
    // 肘部作为铰链只保留 X 轴（主弯曲方向），Y/Z 设 0 以避免异常扭转
    elbowRotation: { x: elbowAngle, y: 0, z: 0 },
  };
}

/** 下肢 IK 求解结果 */
export interface LegIKResult {
  /** 髋旋转（欧拉 XYZ，弧度） */
  hipRotation: Vec3;
  /** 膝旋转（铰链，仅 X） */
  kneeRotation: Vec3;
}

/**
 * 2 段下肢 IK
 * @param hipPos 髋部世界位置
 * @param ankleTargetPos 脚踝目标世界位置
 * @param thighLength 大腿长（髋→膝）
 * @param shinLength 小腿长（膝→踝）
 * 膝盖为铰链关节。下肢骨骼 rest 方向（沿 -Y 延伸）与上肢一致，
 * 因此膝盖屈曲在本地 X 轴上与肘部屈曲同号，直接复用 solve 的肘部角度。
 */
export function solveLeg(
  hipPos: Vec3,
  ankleTargetPos: Vec3,
  thighLength: number,
  shinLength: number,
): LegIKResult {
  // 复用上肢 solve 的 2 段 IK 几何逻辑
  const armResult = solve(hipPos, ankleTargetPos, thighLength, shinLength, 'right');
  // 下肢与上肢 rest 方向一致（均沿 -Y），膝盖屈曲角与肘部屈曲角同号
  return {
    hipRotation: armResult.shoulderRotation,
    kneeRotation: { x: armResult.elbowRotation.x, y: 0, z: 0 },
  };
}

/** 躯干弯曲方向 */
export type SpineBendDirection = 'forward' | 'backward' | 'left' | 'right';

/** 躯干弯曲结果（spine/chest/upperChest 三段分配） */
export interface SpineIKResult {
  spine: Vec3;
  chest: Vec3;
  upperChest?: Vec3;
}

/**
 * 躯干弯曲：将总弯曲角分配到 spine/chest/upperChest 三段
 * @param direction 弯曲方向
 * @param totalAngle 总弯曲角（弧度）
 * 分配比例：spine 40%, chest 35%, upperChest 25%
 */
export function solveSpine(
  direction: SpineBendDirection,
  totalAngle: number,
): SpineIKResult {
  const spineAngle = totalAngle * 0.4;
  const chestAngle = totalAngle * 0.35;
  const upperChestAngle = totalAngle * 0.25;

  const zero = { x: 0, y: 0, z: 0 };
  const result: SpineIKResult = { spine: { ...zero }, chest: { ...zero }, upperChest: { ...zero } };

  switch (direction) {
    case 'forward':
      result.spine.x = spineAngle;
      result.chest.x = chestAngle;
      result.upperChest!.x = upperChestAngle;
      break;
    case 'backward':
      result.spine.x = -spineAngle;
      result.chest.x = -chestAngle;
      result.upperChest!.x = -upperChestAngle;
      break;
    case 'left':
      result.spine.z = spineAngle;
      result.chest.z = chestAngle;
      result.upperChest!.z = upperChestAngle;
      break;
    case 'right':
      result.spine.z = -spineAngle;
      result.chest.z = -chestAngle;
      result.upperChest!.z = -upperChestAngle;
      break;
  }
  return result;
}

// ==================== FABRIK IK 求解器 ====================
// 基于前后向迭代逼近的逆运动学算法，支持 pole vector（肘引导）约束。
// 失败时自动回退到解析法 solve。

const fabLog = logger.module('IKSolver');

/** 单臂 IK 目标参数（用于多链协同） */
export interface ArmIKTarget {
  shoulderPos: Vec3;
  wristTargetPos: Vec3;
  upperArmLength: number;
  forearmLength: number;
  elbowHint?: THREE.Vector3;
}

/**
 * pole vector 约束：将 elbow 旋转到 shoulder→wrist 轴与 poleDir 方向所构成的平面
 * 保持 elbow 到轴的垂直距离不变（下一轮前后向迭代会修正长度）
 *
 * 退化处理：当 elbow 落在 shoulder-wrist 轴上（radial≈0，如初始或伸直状态），
 * 用余弦定理求三角形高度作为偏移，使肘部获得初始弯曲，避免 FABRIK 退化为伸直。
 *
 * @param joints [shoulder, elbow, wrist]
 * @param poleDir 肘引导方向（世界坐标系方向向量）
 * @param L1 上臂长（退化时计算三角形高度）
 * @param L2 前臂长（退化时计算三角形高度）
 */
function applyPoleConstraint(
  joints: THREE.Vector3[],
  poleDir: THREE.Vector3,
  L1: number,
  L2: number,
): void {
  const [shoulder, elbow, wrist] = joints;
  // shoulder→wrist 轴
  const axis = new THREE.Vector3().subVectors(wrist, shoulder);
  const axisLen = axis.length();
  if (axisLen < 1e-9) return; // 退化（肩腕重合），跳过
  axis.divideScalar(axisLen);

  // elbow 在轴上的投影点 pivot
  const se = new THREE.Vector3().subVectors(elbow, shoulder);
  const t = se.dot(axis);
  const pivot = new THREE.Vector3().copy(shoulder).addScaledVector(axis, t);

  // poleDir 投影到垂直于 axis 的平面
  const perp = poleDir.clone().sub(axis.multiplyScalar(poleDir.dot(axis)));
  if (perp.lengthSq() < 1e-12) return; // pole 与轴平行，跳过
  perp.normalize();

  let radial = elbow.distanceTo(pivot);
  // 退化处理：elbow 落在轴上时，用三角形高度作为偏移
  if (radial < 1e-4) {
    const c = axisLen;
    const s = (L1 + L2 + c) / 2;
    const areaSq = s * (s - L1) * (s - L2) * (s - c);
    radial = areaSq > 0 ? (2 * Math.sqrt(areaSq) / Math.max(c, 1e-9)) : L1 * 0.3;
  }
  elbow.copy(pivot).addScaledVector(perp, radial);
}

/**
 * FABRIK（Forward And Backward Reaching IK）2 段求解
 * 通过前后向迭代逼近目标，支持 pole vector（肘引导）约束。
 * 失败（未收敛或输入非法）时回退到解析法 solve。
 *
 * @param shoulderPos 肩部世界位置
 * @param wristTargetPos 腕部目标世界位置
 * @param upperArmLength 上臂长（肩→肘）
 * @param forearmLength 前臂长（肘→腕）
 * @param side 左/右，决定肘部默认引导方向（左臂 +X，右臂 -X）
 * @param elbowHint 肘引导方向（pole vector），缺省按 side 给出
 * @param iterations 迭代次数，默认 10
 * @param restDir 骨骼 rest direction（默认 (0,-1,0)），传入实际 rest direction 可提高 VRM 模型精度
 */
export function solveFABRIK(
  shoulderPos: Vec3,
  wristTargetPos: Vec3,
  upperArmLength: number,
  forearmLength: number,
  side: 'left' | 'right',
  elbowHint?: THREE.Vector3,
  iterations = 10,
  restDir?: THREE.Vector3,
): IKResult {
  const L1 = upperArmLength;
  const L2 = forearmLength;

  // 非法长度：回退解析法
  if (L1 <= 0 || L2 <= 0) {
    fabLog.warn('solveFABRIK 输入长度非正，回退解析法', { L1, L2 });
    return solve(shoulderPos, wristTargetPos, L1, L2, side);
  }

  const totalLen = L1 + L2;
  const shoulder = new THREE.Vector3(shoulderPos.x, shoulderPos.y, shoulderPos.z);
  const target = new THREE.Vector3(wristTargetPos.x, wristTargetPos.y, wristTargetPos.z);

  // 限制目标距离 ≤ totalLen（不可达时钳制到最大伸展方向）
  const toTarget = new THREE.Vector3().subVectors(target, shoulder);
  const targetDist = toTarget.length();
  const clampedTarget = targetDist > totalLen
    ? shoulder.clone().addScaledVector(toTarget.normalize(), totalLen)
    : target;

  // 初始化关节链 [shoulder, elbow, wrist]，elbow 取肩→目标连线按 L1 比例处
  const joints: THREE.Vector3[] = [
    shoulder.clone(),
    new THREE.Vector3().lerpVectors(shoulder, clampedTarget, L1 / totalLen),
    clampedTarget.clone(),
  ];

  // 默认肘引导方向（左 +X，右 -X，略向下偏前，与 solve 的 reference 一致）
  const pole = elbowHint ?? new THREE.Vector3(side === 'left' ? 0.6 : -0.6, -1, 0.3);

  // 复用临时向量，避免迭代内分配
  const back = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  for (let i = 0; i < iterations; i++) {
    // === 后向（wrist→shoulder）===
    joints[2].copy(clampedTarget);
    // elbow 保持距 wrist = L2
    back.subVectors(joints[1], joints[2]).setLength(L2).add(joints[2]);
    joints[1].copy(back);
    // shoulder 保持距 elbow = L1
    back.subVectors(joints[0], joints[1]).setLength(L1).add(joints[1]);
    joints[0].copy(back);

    // === 前向（shoulder→wrist）===
    joints[0].copy(shoulder);
    fwd.subVectors(joints[1], joints[0]).setLength(L1).add(joints[0]);
    joints[1].copy(fwd);
    fwd.subVectors(joints[2], joints[1]).setLength(L2).add(joints[1]);
    joints[2].copy(fwd);

    // === pole vector 约束：拉肘部回到引导平面 ===
    applyPoleConstraint(joints, pole, L1, L2);

    // 收敛检查：wrist 到（钳制）目标距离 < 1e-3 提前退出
    if (joints[2].distanceToSquared(clampedTarget) < 1e-6) break;
  }

  // 最终误差检查（用真实目标，非钳制目标）
  const finalErr = joints[2].distanceTo(target);
  if (finalErr > 1e-2) {
    fabLog.warn('solveFABRIK 未收敛，回退解析法', { finalErr, iterations });
    return solve(shoulderPos, wristTargetPos, L1, L2, side);
  }

  // === 关节方向 → 欧拉角（与 solve 一致的本地坐标约定）===
  // 使用传入的 restDir 或默认 (0,-1,0)
  const effectiveRestDir = restDir ?? BONE_REST_DIR;
  // shoulder：把 rest direction 旋转到 shoulder→elbow 方向
  const upperArmDir = back.subVectors(joints[1], joints[0]).normalize();
  const shoulderQuat = new THREE.Quaternion().setFromUnitVectors(effectiveRestDir, upperArmDir);
  const shoulderEuler = new THREE.Euler().setFromQuaternion(shoulderQuat, 'XYZ');

  // elbow：前臂方向经 inv(shoulder) 转到肩本地，用 setFromUnitVectors 求完整旋转
  // 保留 Y/Z 分量以保证 FK 重建精度（不强制铰链）
  const forearmDir = fwd.subVectors(joints[2], joints[1]);
  if (forearmDir.lengthSq() < 1e-12) forearmDir.copy(effectiveRestDir);
  forearmDir.normalize();
  const forearmLocalDir = forearmDir.applyQuaternion(shoulderQuat.clone().invert());
  const elbowQuat = new THREE.Quaternion().setFromUnitVectors(effectiveRestDir, forearmLocalDir);
  const elbowEuler = new THREE.Euler().setFromQuaternion(elbowQuat, 'XYZ');

  return {
    shoulderRotation: { x: shoulderEuler.x, y: shoulderEuler.y, z: shoulderEuler.z },
    elbowRotation: { x: elbowEuler.x, y: elbowEuler.y, z: elbowEuler.z },
  };
}

/**
 * 多链 FABRIK 求解（左右臂协同）
 *
 * 左右臂物理独立，无需相互约束，分别独立调用 solveFABRIK。
 * 单帧耗时 < 1ms，采用顺序调用即可，无需真正并行。
 *
 * @param targets 左/右臂目标参数
 */
export function solveFABRIKMultiChain(targets: {
  left?: ArmIKTarget;
  right?: ArmIKTarget;
}): { left?: IKResult; right?: IKResult } {
  const result: { left?: IKResult; right?: IKResult } = {};
  if (targets.left) {
    result.left = solveFABRIK(
      targets.left.shoulderPos,
      targets.left.wristTargetPos,
      targets.left.upperArmLength,
      targets.left.forearmLength,
      'left',
      targets.left.elbowHint,
    );
  }
  if (targets.right) {
    result.right = solveFABRIK(
      targets.right.shoulderPos,
      targets.right.wristTargetPos,
      targets.right.upperArmLength,
      targets.right.forearmLength,
      'right',
      targets.right.elbowHint,
    );
  }
  return result;
}
