/**
 * @file JointLimits.ts
 * @description 通用关节角度限制工具函数
 *
 * 提供两类关节约束：
 *   1. clampRotationAngle — 球窝关节（肩、髋）：限制最大旋转角度
 *   2. constrainHingeJoint — 铰链关节（肘、膝）：限制单向弯曲角度范围
 *
 * 铰链轴通过 computeHingeAxis 计算，支持不同关节：
 *   - 手臂：referenceDir = (0,1,0)（UP）
 *   - 腿部：referenceDir = (0,0,1)（前方）
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * 解剖学关节限制常量（弧度）
 * 数据来源：人体测量学常用值（参考 《人体解剖学》教材与 OpenSim 肩肘模型）
 * ROM = Range of Motion
 */

// 肩关节（球窝关节，按运动方向分别限制）
export const SHOULDER_ABDUCTION_MAX_RAD = (120 * Math.PI) / 180;  // 外展：手臂从体侧抬至水平外展最大角度
export const SHOULDER_FLEXION_MAX_RAD = (180 * Math.PI) / 180;    // 前屈：手臂向前抬起最大角度
export const SHOULDER_EXTENSION_MAX_RAD = (60 * Math.PI) / 180;   // 后伸：手臂向后伸出最大角度

// 肘关节
export const ELBOW_FLEXION_MIN_RAD = 0;                           // 屈曲最小（伸直）
export const ELBOW_FLEXION_MAX_RAD = (150 * Math.PI) / 180;       // 屈曲最大
export const ELBOW_PRONATION_MAX_RAD = (80 * Math.PI) / 180;      // 旋前（前臂向内旋转）
export const ELBOW_SUPINATION_MAX_RAD = (80 * Math.PI) / 180;     // 旋后（前臂向外旋转）

// 髋关节与膝关节（暂未使用，预留以便后续扩展）
export const HIP_FLEXION_MAX_RAD = (120 * Math.PI) / 180;
export const KNEE_FLEXION_MAX_RAD = (135 * Math.PI) / 180;

/**
 * 球窝关节角度约束：限制四元数旋转角度不超过最大值
 *
 * 适用于肩关节、髋关节等多自由度关节。当旋转角度超过限制时，
 * 保留旋转轴方向，将角度钳制到最大值。
 *
 * @param quat 原始四元数（不会被修改）
 * @param maxAngleRad 最大旋转角度（弧度）
 * @returns 约束后的四元数（新对象）
 */
export function clampRotationAngle(
  quat: THREE.Quaternion,
  maxAngleRad: number,
): THREE.Quaternion {
  // 提取旋转角度：θ = 2 * acos(|w|)，范围 [0, π]
  const angle = 2 * Math.acos(Math.min(1, Math.abs(quat.w)));
  if (angle <= maxAngleRad) {
    return quat.clone();
  }

  // 提取旋转轴
  const axis = new THREE.Vector3(quat.x, quat.y, quat.z);
  if (axis.lengthSq() < 1e-6) {
    return quat.clone();
  }
  axis.normalize();
  // w < 0 时旋转轴方向需翻转，确保与正角度对应
  if (quat.w < 0) axis.negate();

  return new THREE.Quaternion().setFromAxisAngle(axis, maxAngleRad);
}

/**
 * 肩关节分方向解剖学限制
 *
 * 从 upperQuat（相对 rest pose 的旋转）分解主旋转方向：
 * - 外展（abduction）：上臂向外侧抬起（绕前后轴旋转）
 * - 前屈（flexion）：上臂向前抬起（绕左右轴旋转）
 * - 后伸（extension）：上臂向后伸出（绕左右轴反向旋转）
 *
 * 根据主旋转方向选择对应的限制值：
 * - 外展 ≤ 120°
 * - 前屈 ≤ 180°
 * - 后伸 ≤ 60°
 *
 * 实现思路：
 * 1. 用 upperQuat 把 upperRestDir 旋转得到实际方向 upperArmDir
 * 2. 把 upperArmDir 投影到三个平面分解主方向：
 *    - YZ 平面投影的 Y 分量 > 0 → 主要为外展（手臂上抬）
 *    - XZ 平面投影的 Z 分量 > 0 → 主要为前屈（手臂前伸）
 *    - XZ 平面投影的 Z 分量 < 0 → 主要为后伸（手臂后伸）
 * 3. 计算总旋转角度 = upperRestDir 与 upperArmDir 的夹角
 * 4. 根据主方向选择 maxAngle，调用 clampRotationAngle 钳制
 *
 * @param upperQuat 肩关节旋转四元数（不会被修改）
 * @param upperRestDir 上臂在 T-pose 下的方向（归一化）
 * @returns 约束后的四元数（新对象）
 */
export function constrainShoulderByDirection(
  upperQuat: THREE.Quaternion,
  upperRestDir: THREE.Vector3,
): THREE.Quaternion {
  // 1. 用 upperQuat 旋转 upperRestDir，得到上臂实际方向
  const upperArmDir = upperRestDir.clone().applyQuaternion(upperQuat);

  // 2. 计算总旋转角度（rest 方向与实际方向的夹角）
  const totalAngle = upperRestDir.angleTo(upperArmDir);

  // 总角度极小（接近 rest pose）时直接返回克隆，避免无意义计算
  if (totalAngle < 1e-6) {
    return upperQuat.clone();
  }

  // 3. 根据 rest pose 类型选择主方向分解策略
  //    T-pose：手臂水平外展（|rest.y| < 0.5），外展看 Y 分量变化，前屈/后伸看 Z 分量
  //    A-pose：手臂下垂（|rest.y| ≥ 0.5），外展看 |X| 分量变化，前屈/后伸看 Z 分量
  const isTPose = Math.abs(upperRestDir.y) < 0.5;

  let maxAngle: number;

  if (isTPose) {
    // T-pose：rest ≈ ±(1,0,0)，手臂水平
    // - 外展：手臂上抬 → Y 分量绝对值增大
    // - 前屈：手臂前伸 → Z 分量为正
    // - 后伸：手臂后伸 → Z 分量为负
    const yAbs = Math.abs(upperArmDir.y);
    const zAbs = Math.abs(upperArmDir.z);

    if (yAbs > zAbs) {
      // Y 分量主导 → 外展，限制 120°
      maxAngle = SHOULDER_ABDUCTION_MAX_RAD;
    } else if (upperArmDir.z > 0) {
      // Z 分量主导且为正 → 前屈，限制 180°
      maxAngle = SHOULDER_FLEXION_MAX_RAD;
    } else {
      // Z 分量主导且为负 → 后伸，限制 60°
      maxAngle = SHOULDER_EXTENSION_MAX_RAD;
    }
  } else {
    // A-pose：rest ≈ (0,-1,0)，手臂下垂
    // - 外展：手臂向外侧打开 → |X| 分量增大（rest 时 |X|≈0）
    // - 前屈：手臂前伸 → Z 分量为正
    // - 后伸：手臂后伸 → Z 分量为负
    const xAbs = Math.abs(upperArmDir.x);
    const zAbs = Math.abs(upperArmDir.z);

    if (xAbs > zAbs) {
      // X 分量主导 → 外展，限制 120°
      maxAngle = SHOULDER_ABDUCTION_MAX_RAD;
    } else if (upperArmDir.z > 0) {
      // Z 分量主导且为正 → 前屈，限制 180°
      maxAngle = SHOULDER_FLEXION_MAX_RAD;
    } else {
      // Z 分量主导且为负 → 后伸，限制 60°
      maxAngle = SHOULDER_EXTENSION_MAX_RAD;
    }
  }

  // 4. 用所选限制值调用 clampRotationAngle 钳制总旋转角度
  return clampRotationAngle(upperQuat, maxAngle);
}

/**
 * 计算铰链关节的铰链轴
 *
 * 铰链轴 = boneRestDir × referenceDir（归一化），
 * 垂直于骨骼 rest direction 和参考方向构成的平面。
 *
 * 退化处理：当 boneRestDir 与 referenceDir 平行时（如 A-pose 模型手臂下垂，
 * upperRestDir ≈ (0,-1,0) 与 UP=(0,1,0) 平行），叉积为零向量。
 * 此时回退到与 boneRestDir 正交的参考方向重新计算，避免返回零向量。
 *
 * @param boneRestDir 骨骼在 T-pose 下的方向（归一化）
 * @param referenceDir 参考方向（如手臂用 UP=(0,1,0)，腿部用前方=(0,0,1)）
 * @returns 归一化的铰链轴方向（非零）
 */
export function computeHingeAxis(
  boneRestDir: THREE.Vector3,
  referenceDir: THREE.Vector3,
): THREE.Vector3 {
  const axis = new THREE.Vector3().crossVectors(boneRestDir, referenceDir);
  // 检测退化：boneRestDir 与 referenceDir 平行时叉积为零
  if (axis.lengthSq() < 1e-6) {
    // 回退：选择与 boneRestDir 正交的参考方向
    // 优先用 (1,0,0)，若 boneRestDir 接近 ±X 则用 (0,0,1)
    const fallback = Math.abs(boneRestDir.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
    axis.crossVectors(boneRestDir, fallback);
  }
  return axis.normalize();
}

/**
 * 铰链关节约束：将旋转投影到铰链轴上并限制弯曲角度范围
 *
 * 适用于肘关节、膝关节等单自由度铰链关节。
 * 从 restDir 到 targetDir 的旋转被分解为铰链轴方向的分量（有效弯曲）
 * 和非铰链轴方向的分量（被剔除），然后弯曲角度被钳制到 [min, max]。
 *
 * @param restDir 骨骼在 T-pose 下的方向（归一化）
 * @param targetDir 目标方向（归一化）
 * @param hingeAxis 铰链轴方向（归一化，由 computeHingeAxis 计算）
 * @param minAngleRad 最小弯曲角度（弧度，通常为 0 表示伸直）
 * @param maxAngleRad 最大弯曲角度（弧度，如肘关节约 150°）
 * @returns 约束后的铰链旋转四元数
 */
export function constrainHingeJoint(
  restDir: THREE.Vector3,
  targetDir: THREE.Vector3,
  hingeAxis: THREE.Vector3,
  minAngleRad: number,
  maxAngleRad: number,
): THREE.Quaternion {
  // 从 restDir 和 targetDir 提取旋转轴和角度
  const dot = THREE.MathUtils.clamp(restDir.dot(targetDir), -1, 1);
  const angle = Math.acos(dot);
  const rotAxis = new THREE.Vector3().crossVectors(restDir, targetDir);

  // 带符号的投影角度：旋转轴在铰链轴方向上的分量 × 角度
  let signedAngle = 0;
  if (rotAxis.lengthSq() > 1e-6) {
    rotAxis.normalize();
    signedAngle = rotAxis.dot(hingeAxis) * angle;
  }

  // 钳制弯曲角度到 [min, max]
  signedAngle = Math.max(minAngleRad, Math.min(maxAngleRad, signedAngle));

  return new THREE.Quaternion().setFromAxisAngle(hingeAxis, signedAngle);
}

/**
 * 前臂旋前/旋后限制（肘关节轴向旋转约束）
 *
 * 肘关节除了铰链弯曲（已由 constrainHingeJoint 处理），还有前臂轴向旋转
 * （旋前 pronation / 旋后 supination），需限制在 ±80° 范围内。
 *
 * 实现思路：
 * 1. 从 lowerQuat 提取轴向旋转分量（绕 hingeAxis 的旋转）
 * 2. 用四元数 → 轴角表示：axis = (x,y,z) 归一化，angle = 2*acos(|w|)
 * 3. 轴向分量 = axis 在 hingeAxis 方向上的投影 × 总角度（带符号）
 * 4. 钳制轴向分量到 [-maxSupination, +maxPronation]
 * 5. 用钳制后的角度重建轴向旋转四元数
 *
 * 注意：本函数仅约束轴向旋转，弯曲由 constrainHingeJoint 单独处理。
 * 调用顺序建议：先 constrainHingeJoint（弯曲），再本函数叠加轴向限制。
 * 但本函数实现为独立的轴向投影，不与弯曲耦合，调用方负责组合。
 *
 * @param lowerQuat 肘关节旋转四元数（不会被修改）
 * @param hingeAxis 铰链轴方向（归一化，由 computeHingeAxis 计算）
 * @param maxPronationRad 旋前最大角度（弧度，默认 80°）
 * @param maxSupinationRad 旋后最大角度（弧度，默认 80°）
 * @returns 约束后的四元数（新对象）
 */
export function constrainForearmRotation(
  lowerQuat: THREE.Quaternion,
  hingeAxis: THREE.Vector3,
  maxPronationRad: number = ELBOW_PRONATION_MAX_RAD,
  maxSupinationRad: number = ELBOW_SUPINATION_MAX_RAD,
): THREE.Quaternion {
  // 1. 四元数转轴角表示：angle = 2 * acos(|w|)，范围 [0, π]
  const angle = 2 * Math.acos(Math.min(1, Math.abs(lowerQuat.w)));

  // 角度极小（接近单位四元数）时直接返回克隆
  if (angle < 1e-6) {
    return lowerQuat.clone();
  }

  // 2. 提取旋转轴 (x, y, z) 并归一化
  //    w < 0 时 (x,y,z) 表示的轴方向与正角度相反，需翻转
  const axis = new THREE.Vector3(lowerQuat.x, lowerQuat.y, lowerQuat.z);
  if (lowerQuat.w < 0) axis.negate();
  axis.normalize();

  // 3. 计算轴向投影分量（带符号）
  //    signedAngle = axis 在 hingeAxis 方向上的投影 × 总角度
  //    正值表示旋前（pronation），负值表示旋后（supination）
  const signedAngle = axis.dot(hingeAxis) * angle;

  // 4. 钳制到 [-maxSupination, +maxPronation]
  const clampedSignedAngle = Math.max(
    -maxSupinationRad,
    Math.min(maxPronationRad, signedAngle),
  );

  // 5. 重建轴向旋转四元数
  //    注意：若传入的 lowerQuat 包含非轴向分量（如未约束的原始旋转），
  //    本函数会丢失这些分量。建议在 constrainHingeJoint 之后调用，
  //    传入约束后的纯铰链旋转四元数。
  return new THREE.Quaternion().setFromAxisAngle(hingeAxis, clampedSignedAngle);
}

// ===== VRMC_node_constraint 适配层 =====

/**
 * VRMC_node_constraint 约束类型
 * 参考 VRM 1.0 规范：https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_node_constraint-1.0.md
 */
export type VRMCConstraintType = 'roll' | 'aim' | 'rotation';

/**
 * 单个节点的 VRMC 约束信息
 * roll: 扭转约束（绕指定轴分布扭转到子骨骼）
 * aim: 朝向约束（让节点指向目标）
 * rotation: 旋转约束（限制旋转角度）
 */
export interface VRMCNodeConstraint {
  /** 约束类型 */
  type: VRMCConstraintType;
  /** roll 约束的扭转轴（如 'x'/'y'/'z'），仅 type='roll' 时有效 */
  rollAxis?: 'x' | 'y' | 'z';
  /** 扭转分布比例 [0, 1]，1 表示全部由子骨骼承担 */
  rollWeight?: number;
  /** 旋转限制最小角度（弧度），仅 type='rotation' 时有效 */
  minRotation?: THREE.Vector3;
  /** 旋转限制最大角度（弧度），仅 type='rotation' 时有效 */
  maxRotation?: THREE.Vector3;
}

/** VRM 模型约束映射表：bone name → constraint */
export type VRMConstraintMap = Map<string, VRMCNodeConstraint>;

/** roll 轴字符 → Euler 顺序（让 roll 轴作为 Euler 分解的第一轴） */
const ROLL_AXIS_TO_EULER_ORDER: Record<'x' | 'y' | 'z', THREE.EulerOrder> = {
  x: 'XYZ',
  y: 'YXZ',
  z: 'ZXY',
};

/** 读取 Euler 指定轴的分量 */
function getEulerAxis(euler: THREE.Euler, axis: 'x' | 'y' | 'z'): number {
  if (axis === 'x') return euler.x;
  if (axis === 'y') return euler.y;
  return euler.z;
}

/** 设置 Euler 指定轴的分量 */
function setEulerAxis(euler: THREE.Euler, axis: 'x' | 'y' | 'z', value: number): void {
  if (axis === 'x') euler.x = value;
  else if (axis === 'y') euler.y = value;
  else euler.z = value;
}

/**
 * 应用 VRMC_node_constraint 约束到上臂/前臂四元数
 *
 * 当前实现仅支持 roll 约束（扭转分布）：
 * - 若 upperArm 含 roll 约束（如 rollWeight=0.5），将 upperArm 绕 rollAxis 的旋转按比例分布到 lowerArm
 * - 避免 upperArm 大幅扭转时 lowerArm 不动导致肘部突变
 *
 * 无约束时直接返回原四元数（回退由调用方决定是否再用 JointLimits 手动约束）
 *
 * @param upperQuat 上臂旋转四元数（不会被修改）
 * @param lowerQuat 前臂旋转四元数（不会被修改）
 * @param upperBoneName 上臂骨骼名（如 'leftUpperArm'/'rightUpperArm'）
 * @param lowerBoneName 前臂骨骼名（如 'leftLowerArm'/'rightLowerArm'）
 * @param constraints VRM 约束映射表
 * @returns 应用约束后的 { upper, lower }（新四元数对象）
 */
export function applyVRMCConstraints(
  upperQuat: THREE.Quaternion,
  lowerQuat: THREE.Quaternion,
  upperBoneName: string,
  lowerBoneName: string,
  constraints: VRMConstraintMap,
): { upper: THREE.Quaternion; lower: THREE.Quaternion; applied: boolean } {
  const upperConstraint = constraints.get(upperBoneName);
  // 仅 roll 约束处理扭转分布；其余类型或无约束直接回退
  if (!upperConstraint || upperConstraint.type !== 'roll' || !upperConstraint.rollAxis) {
    return { upper: upperQuat.clone(), lower: lowerQuat.clone(), applied: false };
  }

  const weight = upperConstraint.rollWeight ?? 0;
  if (weight <= 0) {
    return { upper: upperQuat.clone(), lower: lowerQuat.clone(), applied: false };
  }

  const rollAxis = upperConstraint.rollAxis;
  const order = ROLL_AXIS_TO_EULER_ORDER[rollAxis];

  // 分解 upperQuat 为 roll 分量（绕 rollAxis）+ 剩余分量
  const upperEuler = new THREE.Euler().setFromQuaternion(upperQuat, order);
  const rollAngle = getEulerAxis(upperEuler, rollAxis);
  // upperArm 保留 (1-weight) 比例的 roll；lowerArm 承担 weight 比例
  const upperRoll = rollAngle * (1 - weight);
  const lowerRoll = rollAngle * weight;

  // 重建 upperQuat：保留非 roll 分量，roll 分量改为 upperRoll
  const newUpperEuler = upperEuler.clone();
  setEulerAxis(newUpperEuler, rollAxis, upperRoll);
  const newUpper = new THREE.Quaternion().setFromEuler(newUpperEuler);

  // 重建 lowerQuat：在 lowerQuat 基础上叠加 lowerRoll（绕同一 rollAxis）
  const lowerEuler = new THREE.Euler().setFromQuaternion(lowerQuat, order);
  setEulerAxis(lowerEuler, rollAxis, getEulerAxis(lowerEuler, rollAxis) + lowerRoll);
  const newLower = new THREE.Quaternion().setFromEuler(lowerEuler);

  // lowerBoneName 仅用于未来扩展（如 lowerArm 自身约束），当前不参与计算
  void lowerBoneName;

  return { upper: newUpper, lower: newLower, applied: true };
}

/** VRM 模型约束缓存：VRMModel.tsx 加载时填充，ClipBuilder.ts 解算时读取 */
const VRM_CONSTRAINT_CACHE = new WeakMap<VRM, VRMConstraintMap>();

/** 设置 VRM 约束缓存（由 VRMModel.tsx 在加载阶段调用） */
export function setVRMConstraintCache(vrm: VRM, constraints: VRMConstraintMap): void {
  VRM_CONSTRAINT_CACHE.set(vrm, constraints);
}

/** 获取 VRM 约束缓存（由 ClipBuilder.ts 在 buildClip 时调用），无缓存时返回空 Map */
export function getVRMConstraintCache(vrm: VRM): VRMConstraintMap {
  return VRM_CONSTRAINT_CACHE.get(vrm) ?? new Map();
}

/**
 * 从 VRM 模型提取 VRMC_node_constraint 约束
 *
 * VRM 1.0 模型在 gltf.extensions.VRMC_node_constraint 中导出约束。
 * @pixiv/three-vrm 不直接解析此扩展，需从节点 userData 读取。
 *
 * 兼容性：模型无约束时返回空 Map；提取失败不抛出，回退到 JointLimits 手动约束
 *
 * @param vrm VRM 模型实例
 * @returns bone name → constraint 映射表
 */
export function extractVRMCConstraints(vrm: VRM): VRMConstraintMap {
  const constraintMap: VRMConstraintMap = new Map();
  try {
    // 遍历主要骨骼节点，从 userData 中读取 VRMC_node_constraint 扩展
    const boneNames = [
      'leftUpperArm', 'rightUpperArm',
      'leftLowerArm', 'rightLowerArm',
      'leftUpperLeg', 'rightUpperLeg',
    ];
    for (const boneName of boneNames) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName as never);
      if (!node) continue;
      // 兼容两种存储位置：userData 顶层或 gltfExtensions 子对象
      const ext = node.userData?.VRMC_node_constraint
        ?? node.userData?.gltfExtensions?.VRMC_node_constraint;
      if (!ext) continue;
      // 根据扩展字段判断约束类型
      const constraint: VRMCNodeConstraint = {
        type: ext.roll ? 'roll' : ext.aim ? 'aim' : 'rotation',
        rollAxis: ext.roll?.rollAxis,
        rollWeight: ext.roll?.weight,
      };
      constraintMap.set(boneName, constraint);
    }
  } catch {
    // 约束提取失败不阻塞主流程，回退到 JointLimits 手动约束
    // 调用方通过 getVRMConstraintCache 返回空 Map 自行处理
  }
  return constraintMap;
}
