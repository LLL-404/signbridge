// VRM 骨骼重定向模块
// 处理内部骨骼系统（A-pose，双臂下垂）与 VRM 标准模型（T-pose，双臂水平外展）
// 之间的 rest pose 差异校正。
//
// 原理：
//   内部 IK 求解的旋转是基于 A-pose 的本地坐标系。
//   VRM 模型的骨骼 rest pose 是 T-pose（双臂水平外展 90°）。
//   直接复制旋转会导致 VRM 手臂始终偏移约 90°。
//
//   正确做法：对每个骨骼，计算 rest pose 差异四元数 Q_diff，
//   然后应用 Q_final = Q_rest_diff⁻¹ * Q_internal * Q_rest_diff
//   或更简单：Q_final = Q_rest_diff⁻¹ * Q_internal（仅旋转补偿）
//
//   对于肩部：T-pose 时上臂沿 ±X 方向，A-pose 时沿 -Y 方向。
//   差异 = setFromUnitVectors((-Y), (±X))
import * as THREE from 'three';

/** 骨骼名称 → rest pose 差异校正四元数（T-pose → A-pose） */
const REST_DIFF_CACHE = new Map<string, THREE.Quaternion>();

/** 内部骨骼 rest 方向（A-pose）：肩→肘沿 -Y */
const ARM_REST_DIR_A = new THREE.Vector3(0, -1, 0);
/** VRM T-pose 方向：左臂沿 -X，右臂沿 +X */
const LEFT_ARM_REST_DIR_T = new THREE.Vector3(-1, 0, 0);
const RIGHT_ARM_REST_DIR_T = new THREE.Vector3(1, 0, 0);

/** 初始化 rest pose 差异四元数 */
function initRestDifferences(): void {
  if (REST_DIFF_CACHE.size > 0) return;

  // 左肩：从 T-pose(-X) 旋转到 A-pose(-Y)
  REST_DIFF_CACHE.set('leftShoulder',
    new THREE.Quaternion().setFromUnitVectors(LEFT_ARM_REST_DIR_T, ARM_REST_DIR_A));
  // 右肩：从 T-pose(+X) 旋转到 A-pose(-Y)
  REST_DIFF_CACHE.set('rightShoulder',
    new THREE.Quaternion().setFromUnitVectors(RIGHT_ARM_REST_DIR_T, ARM_REST_DIR_A));

  // 肘部在 T-pose 和 A-pose 中都沿 -Y 方向延伸，差异为零（单位四元数）
  REST_DIFF_CACHE.set('leftUpperArm', new THREE.Quaternion());
  REST_DIFF_CACHE.set('rightUpperArm', new THREE.Quaternion());
  REST_DIFF_CACHE.set('leftLowerArm', new THREE.Quaternion());
  REST_DIFF_CACHE.set('rightLowerArm', new THREE.Quaternion());
}

/**
 * 将内部骨骼旋转重定向到 VRM 骨骼旋转
 * @param vrmBoneName VRM 标准骨骼名称
 * @param internalRotation 内部骨骼旋转（欧拉角 XYZ，弧度）
 * @returns VRM 骨骼旋转（欧拉角 XYZ，弧度）
 */
export function retargetRotation(
  vrmBoneName: string,
  internalRotation: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  initRestDifferences();

  const restDiff = REST_DIFF_CACHE.get(vrmBoneName);
  if (!restDiff) {
    // 无需重定向的骨骼（躯干、头、腿等），直接返回
    return { ...internalRotation };
  }

  // 内部旋转 → 四元数
  const qInternal = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(internalRotation.x, internalRotation.y, internalRotation.z, 'XYZ'),
  );

  // 重定向：Q_vrm = Q_rest_diff⁻¹ * Q_internal
  const qRetargeted = restDiff.clone().invert().multiply(qInternal);

  // 转回欧拉角
  const euler = new THREE.Euler().setFromQuaternion(qRetargeted, 'XYZ');
  return { x: euler.x, y: euler.y, z: euler.z };
}

/**
 * 批量重定向 BonePose → VRM 旋转映射
 * @param pose 内部 BonePose
 * @param boneNameMap 内部名称 → VRM 骨骼名称映射
 * @returns Map<vrmBoneName, {rotation: Vec3}>
 */
export function retargetPose(
  pose: Record<string, { rotation: { x: number; y: number; z: number } }>,
  boneNameMap: Record<string, string>,
): Map<string, { x: number; y: number; z: number }> {
  const result = new Map<string, { x: number; y: number; z: number }>();
  for (const [internalName, vrmName] of Object.entries(boneNameMap)) {
    const internalBone = pose[internalName];
    if (!internalBone?.rotation) continue;
    result.set(vrmName, retargetRotation(vrmName, internalBone.rotation));
  }
  return result;
}
