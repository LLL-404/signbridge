import type { BonePose, VRMPose, VRMBoneName, BoneTransform } from '@/types/avatar';
import { FacialExpression, HeadMovement } from '@/types/sign';

/** 旧内部名 → VRM 标准骨骼名映射表 */
const BONE_NAME_MAP: Record<keyof BonePose, VRMBoneName> = {
  root: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  left_shoulder: 'leftShoulder',
  left_elbow: 'leftUpperArm',
  left_wrist: 'leftLowerArm',
  right_shoulder: 'rightShoulder',
  right_elbow: 'rightUpperArm',
  right_wrist: 'rightLowerArm',
  left_hip: 'leftUpperLeg',
  left_knee: 'leftLowerLeg',
  left_ankle: 'leftFoot',
  right_hip: 'rightUpperLeg',
  right_knee: 'rightLowerLeg',
  right_ankle: 'rightFoot',
  // hand/expression/head_movement 特殊处理，不在此表
} as unknown as Record<keyof BonePose, VRMBoneName>;

/** 旧 BonePose → 新 VRMPose */
export function bonePoseToVRM(pose: BonePose): VRMPose {
  const bones: Partial<Record<VRMBoneName, BoneTransform>> = {};
  (Object.keys(BONE_NAME_MAP) as (keyof BonePose)[]).forEach((key) => {
    const vrmName = BONE_NAME_MAP[key];
    const joint = pose[key] as { position: any; rotation: any };
    bones[vrmName] = {
      rotation: { ...joint.rotation },
      position: key === 'root' ? { ...joint.position } : undefined,
    };
  });
  return {
    bones,
    expression: pose.expression,
    headMovement: pose.head_movement,
  };
}

/** 新 VRMPose → 旧 BonePose（回退用） */
export function vrmPoseToBone(vrm: VRMPose): BonePose {
  const pose: any = {};
  (Object.keys(BONE_NAME_MAP) as (keyof BonePose)[]).forEach((key) => {
    const vrmName = BONE_NAME_MAP[key];
    const t = vrm.bones[vrmName];
    pose[key] = {
      position: t?.position ? { ...t.position } : { x: 0, y: 0, z: 0 },
      rotation: t?.rotation ? { ...t.rotation } : { x: 0, y: 0, z: 0 },
    };
  });
  // hand/expression/head_movement 填默认值
  pose.left_hand = { shape: 'open_5', location: 'neutral', palm_orientation: 'inward', wrist: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, fingers: [] };
  pose.right_hand = { shape: 'open_5', location: 'neutral', palm_orientation: 'inward', wrist: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, fingers: [] };
  pose.expression = vrm.expression ?? FacialExpression.NEUTRAL;
  pose.head_movement = vrm.headMovement ?? HeadMovement.NONE;
  return pose as BonePose;
}
