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

/** 完整身体姿态（一帧） */
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

/** 创建中性手部姿态（自然张开 5 指手形，位于身体两侧中性位置） */
const neutralHand = (side: 'left' | 'right'): HandPose => ({
  shape: HandShape.OPEN_5,
  location: HandLocation.NEUTRAL,
  palm_orientation: 'inward',
  wrist: jointAt(side === 'left' ? -0.25 : 0.25, 0.9, 0),
  fingers: [zeroJoint(), zeroJoint(), zeroJoint(), zeroJoint(), zeroJoint()],
});

/**
 * 中性姿态（准备位）
 * 虚拟人直立站姿：根节点位于原点，脊柱垂直向上，双臂自然下垂
 * 坐标约定：Y 轴向上，Z 轴朝向观察者，X 轴向右
 * P2 修复：调整臂长使 Skeleton3D 与 pose 数据一致
 *   - 肩→肘：上臂长 0.28（Skeleton3D.y=-0.28），无水平偏移
 *   - 肘→腕：前臂长 0（wrist local position = 0，由 applyWristPosition 动态计算）
 */
export const NEUTRAL_POSE: BonePose = {
  root: jointAt(0, 0, 0),
  spine: jointAt(0, 1.0, 0),
  chest: jointAt(0, 1.3, 0),
  neck: jointAt(0, 1.55, 0),
  head: jointAt(0, 1.65, 0),
  // 左臂：肘部在肩正下方（x=0），腕部跟随肘部
  left_shoulder: jointAt(-0.2, 1.45, 0),
  left_elbow: jointAt(-0.2, 1.17, 0),    // y = 1.45 - 0.28 = 1.17
  left_wrist: jointAt(-0.2, 1.17, 0),    // 跟随肘部（applyWristPosition 会修正到正确位置）
  // 右臂
  right_shoulder: jointAt(0.2, 1.45, 0),
  right_elbow: jointAt(0.2, 1.17, 0),
  right_wrist: jointAt(0.2, 1.17, 0),
  left_hand: neutralHand('left'),
  right_hand: neutralHand('right'),
  expression: FacialExpression.NEUTRAL,
  head_movement: HeadMovement.NONE,
};
