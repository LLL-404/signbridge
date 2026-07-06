// 虚拟人类型定义
import { HandShape, HandLocation, FacialExpression, HeadMovement } from './sign';

/** 3D 向量 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 关节姿态 */
export interface JointPose {
  position: Vec3;
  rotation: Vec3; // 欧拉角（弧度）
}

/** 手部姿态（含手形和位置） */
export interface HandPose {
  shape: HandShape;
  location: HandLocation;
  palm_orientation: string;
  wrist: JointPose;
  fingers: [JointPose, JointPose, JointPose, JointPose, JointPose];
}

/**
 * 完整身体姿态（一帧）
 * @deprecated 旧骨骼姿态结构（17 自创关节名），将被 VRMPose 替代。
 * 保留供双轨过渡期回退使用，新代码请用 VRMPose。
 */
export interface BonePose {
  root: JointPose;
  spine: JointPose;
  chest: JointPose;
  neck: JointPose;
  head: JointPose;
  left_shoulder: JointPose;
  left_elbow: JointPose;
  left_wrist: JointPose;
  right_shoulder: JointPose;
  right_elbow: JointPose;
  right_wrist: JointPose;
  left_hip: JointPose;
  left_knee: JointPose;
  left_ankle: JointPose;
  right_hip: JointPose;
  right_knee: JointPose;
  right_ankle: JointPose;
  left_hand: HandPose;
  right_hand: HandPose;
  expression: FacialExpression;
  head_movement: HeadMovement;
}

/** 动画帧 */
export interface Frame {
  pose: BonePose;
  timestamp: number; // 毫秒
}

/** 骨骼配置 */
export interface SkeletonConfig {
  bone_count: number;
  joints: string[];
  constraints: JointConstraint[];
}

/** 关节约束 */
export interface JointConstraint {
  joint: string;
  min_rotation: Vec3;
  max_rotation: Vec3;
}

/** 动作数据（一个词汇的完整动作） */
export interface MotionData {
  gloss_id: string;
  frames: Frame[];
  duration_ms: number;
  loop: boolean;
}

/** 虚拟人渲染模式 */
export type AvatarMode = '3d' | '2d';

/** 虚拟人状态 */
export interface AvatarState {
  mode: AvatarMode;
  current_pose: BonePose;
  is_playing: boolean;
  playback_speed: number;
}

// ===== 中性姿态定义 =====

/** 创建零向量关节姿态（位置与旋转均为 0） */
const zeroJoint = (): JointPose => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
});

/** 创建指定位置的关节姿态 */
const jointAt = (x: number, y: number, z: number): JointPose => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 },
});

/** 创建中性手部姿态（自然张开 5 指手形，双臂自然下垂） */
const neutralHand = (side: 'left' | 'right'): HandPose => ({
  shape: HandShape.OPEN_5,
  location: HandLocation.NEUTRAL,
  palm_orientation: 'inward',
  wrist: jointAt(side === 'left' ? -0.18 : 0.18, 0.82, 0),
  fingers: [zeroJoint(), zeroJoint(), zeroJoint(), zeroJoint(), zeroJoint()],
});

/**
 * 中性姿态（准备位）
 * 虚拟人直立站姿，双臂自然下垂。坐标与 Skeleton3D 层级 FK 计算严格一致：
 *   hips(root) y=1.0（脚底在 y=0，身高到头顶约 1.71）
 *   spine y=1.20, chest y=1.42, neck y=1.50, head y=1.60
 *   shoulder y=1.40（x=±0.18）, elbow y=1.10, wrist y=0.82
 *   hip x=±0.10, knee y=0.54, ankle y=0.06（脚底接触 y=0）
 */
export const NEUTRAL_POSE: BonePose = {
  root: jointAt(0, 1.0, 0),
  spine: jointAt(0, 1.20, 0),
  chest: jointAt(0, 1.42, 0),
  neck: jointAt(0, 1.50, 0),
  head: jointAt(0, 1.60, 0),
  left_shoulder: jointAt(-0.18, 1.40, 0),
  left_elbow: jointAt(-0.18, 1.10, 0),
  left_wrist: jointAt(-0.18, 0.82, 0),
  right_shoulder: jointAt(0.18, 1.40, 0),
  right_elbow: jointAt(0.18, 1.10, 0),
  right_wrist: jointAt(0.18, 0.82, 0),
  left_hip: jointAt(-0.10, 1.00, 0),
  left_knee: jointAt(-0.10, 0.54, 0),
  left_ankle: jointAt(-0.10, 0.06, 0),
  right_hip: jointAt(0.10, 1.00, 0),
  right_knee: jointAt(0.10, 0.54, 0),
  right_ankle: jointAt(0.10, 0.06, 0),
  left_hand: neutralHand('left'),
  right_hand: neutralHand('right'),
  expression: FacialExpression.NEUTRAL,
  head_movement: HeadMovement.NONE,
};

// ===== VRM Humanoid 标准骨骼（重建后唯一真相源）=====

/** VRM humanoid 标准骨骼名（与 VRM 0.x/1.0 规范一致） */
export type VRMBoneName =
  // 躯干
  | 'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'head'
  // 左臂
  | 'leftShoulder' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  // 右臂
  | 'rightShoulder' | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  // 左腿
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'leftToes'
  // 右腿
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | 'rightToes';

/** 单个骨骼的变换：rotation 为主，position 可选 */
export interface BoneTransform {
  rotation: Vec3;      // 欧拉角弧度，FK 链核心
  position?: Vec3;     // 可选，仅 hips（根位移）和 IK 目标使用
}

/** 一帧完整 VRM 姿态 */
export interface VRMPose {
  bones: Partial<Record<VRMBoneName, BoneTransform>>;
  expression?: FacialExpression;
  headMovement?: HeadMovement;
  /** IK 目标（可选，指定后覆盖 FK 结果） */
  ikTargets?: {
    leftHand?: Vec3;
    rightHand?: Vec3;
    leftFoot?: Vec3;
    rightFoot?: Vec3;
  };
  /** 手形（驱动手指骨骼） */
  handShapes?: { left?: HandShape; right?: HandShape };
}

/** 关键帧（用于动作序列） */
export interface Keyframe {
  time: number;  // 0~1 归一化时间
  pose: VRMPose;
}

/** 一个词汇的动作 = 关键帧序列 */
export interface SignMotion {
  gloss_id: string;
  keyframes: Keyframe[];
  duration_ms: number;
  loop: boolean;
}

/** VRM 中性姿态（T-pose 零旋转，仅 hips 设根位置） */
export const NEUTRAL_VRM_POSE: VRMPose = {
  bones: {
    hips: { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 1.0, z: 0 } },
  },
  expression: FacialExpression.NEUTRAL,
  headMovement: HeadMovement.NONE,
};
