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
  // 上臂方向 = 绕 elbowDir 将 dir 旋转 -shoulderLift，得到 SA 方向
  // （"伸直"时 SA 沿 SW 方向；弯肘后 SA 向 elbowDir 一侧偏斜，使末端回到 W）
  const upperArmDir = dir.clone().applyAxisAngle(elbowDir, -shoulderLift);

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
