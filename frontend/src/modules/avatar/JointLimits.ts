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
 * 计算铰链关节的铰链轴
 *
 * 铰链轴 = boneRestDir × referenceDir（归一化），
 * 垂直于骨骼 rest direction 和参考方向构成的平面。
 *
 * @param boneRestDir 骨骼在 T-pose 下的方向（归一化）
 * @param referenceDir 参考方向（如手臂用 UP=(0,1,0)，腿部用前方=(0,0,1)）
 * @returns 归一化的铰链轴方向
 */
export function computeHingeAxis(
  boneRestDir: THREE.Vector3,
  referenceDir: THREE.Vector3,
): THREE.Vector3 {
  return new THREE.Vector3().crossVectors(boneRestDir, referenceDir).normalize();
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
