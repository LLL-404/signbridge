// 骨骼关节名称与约束定义
import type { JointConstraint } from '@/types/avatar';

/** 所有身体关节名称 */
export const JOINT_NAMES = {
  ROOT: 'root',
  SPINE: 'spine',
  CHEST: 'chest',
  NECK: 'neck',
  HEAD: 'head',
  LEFT_SHOULDER: 'left_shoulder',
  LEFT_ELBOW: 'left_elbow',
  LEFT_WRIST: 'left_wrist',
  RIGHT_SHOULDER: 'right_shoulder',
  RIGHT_ELBOW: 'right_elbow',
  RIGHT_WRIST: 'right_wrist',
} as const;

/** 手指关节名称前缀 */
export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export const FINGER_JOINTS = ['mcp', 'pip', 'dip'] as const;

/** 获取某只手所有手指关节名称 */
export function getHandJointNames(side: 'left' | 'right'): string[] {
  const names: string[] = [];
  for (const finger of FINGER_NAMES) {
    for (const joint of FINGER_JOINTS) {
      names.push(`${side}_${finger}_${joint}`);
    }
  }
  return names;
}

/** 所有手部关节名称（双手） */
export const HAND_JOINT_NAMES = [...getHandJointNames('left'), ...getHandJointNames('right')];

/** 所有关节名称列表 */
export const ALL_JOINT_NAMES = [
  ...Object.values(JOINT_NAMES),
  ...HAND_JOINT_NAMES,
];

/** 角度转弧度 */
const deg = (d: number): number => (d * Math.PI) / 180;

/** 关节角度约束（弧度） */
export const JOINT_CONSTRAINTS: JointConstraint[] = [
  // 颈部
  { joint: 'neck', min_rotation: { x: deg(-45), y: deg(-60), z: deg(-30) }, max_rotation: { x: deg(45), y: deg(60), z: deg(30) } },
  // 脊柱
  { joint: 'spine', min_rotation: { x: deg(-30), y: deg(-30), z: deg(-20) }, max_rotation: { x: deg(30), y: deg(30), z: deg(20) } },
  { joint: 'chest', min_rotation: { x: deg(-20), y: deg(-20), z: deg(-15) }, max_rotation: { x: deg(20), y: deg(20), z: deg(15) } },
  // 肩部
  { joint: 'left_shoulder', min_rotation: { x: deg(-180), y: deg(-90), z: deg(-120) }, max_rotation: { x: deg(60), y: deg(90), z: deg(45) } },
  { joint: 'right_shoulder', min_rotation: { x: deg(-180), y: deg(-90), z: deg(-45) }, max_rotation: { x: deg(60), y: deg(90), z: deg(120) } },
  // 肘部（只能屈伸）
  { joint: 'left_elbow', min_rotation: { x: deg(0), y: deg(0), z: deg(0) }, max_rotation: { x: deg(150), y: deg(0), z: deg(0) } },
  { joint: 'right_elbow', min_rotation: { x: deg(0), y: deg(0), z: deg(0) }, max_rotation: { x: deg(150), y: deg(0), z: deg(0) } },
  // 手腕
  { joint: 'left_wrist', min_rotation: { x: deg(-80), y: deg(-20), z: deg(-30) }, max_rotation: { x: deg(80), y: deg(20), z: deg(30) } },
  { joint: 'right_wrist', min_rotation: { x: deg(-80), y: deg(-20), z: deg(-30) }, max_rotation: { x: deg(80), y: deg(20), z: deg(30) } },
];

/** 手指关节约束 */
export function getFingerConstraints(side: 'left' | 'right'): JointConstraint[] {
  const constraints: JointConstraint[] = [];
  for (const finger of FINGER_NAMES) {
    // MCP 关节：屈曲 0-90°
    constraints.push({
      joint: `${side}_${finger}_mcp`,
      min_rotation: { x: deg(0), y: deg(-20), z: deg(-20) },
      max_rotation: { x: deg(90), y: deg(20), z: deg(20) },
    });
    // PIP 关节：屈曲 0-100°
    constraints.push({
      joint: `${side}_${finger}_pip`,
      min_rotation: { x: deg(0), y: deg(0), z: deg(0) },
      max_rotation: { x: deg(100), y: deg(0), z: deg(0) },
    });
    // DIP 关节：屈曲 0-90°
    constraints.push({
      joint: `${side}_${finger}_dip`,
      min_rotation: { x: deg(0), y: deg(0), z: deg(0) },
      max_rotation: { x: deg(90), y: deg(0), z: deg(0) },
    });
  }
  return constraints;
}

/** 所有约束（身体 + 双手手指） */
export const ALL_CONSTRAINTS: JointConstraint[] = [
  ...JOINT_CONSTRAINTS,
  ...getFingerConstraints('left'),
  ...getFingerConstraints('right'),
];
