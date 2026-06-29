// 动作过渡引擎
// 提供缓动函数、姿态差异检测、过渡策略（直接插值/中性复位）、关节约束检查与 IK 修正
import type { BonePose, Frame, JointPose, Vec3, HandPose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import { interpolateHandshape } from './HandShape';
import { solve as ikSolve } from './IKSolver';
import { ALL_CONSTRAINTS } from './skeleton/joints';
import type { JointConstraint } from '@/types/avatar';

// ===== 常量 =====

/** 帧间隔（毫秒），60fps */
const FRAME_INTERVAL_MS = 16;

/** 默认过渡时长：直接插值 */
const DEFAULT_DIRECT_DURATION_MS = 300;
/** 默认过渡时长：中性复位 */
const DEFAULT_NEUTRAL_DURATION_MS = 500;

/** 位置差异阈值：超过则使用中性复位策略 */
const POSITION_DISTANCE_THRESHOLD = 0.5;

/** BonePose 中所有身体关节字段（JointPose 类型） */
const BODY_JOINT_KEYS = [
  'root', 'spine', 'chest', 'neck', 'head',
  'left_shoulder', 'left_elbow', 'left_wrist',
  'right_shoulder', 'right_elbow', 'right_wrist',
] as const;

// ===== 缓动函数 =====

/** ease-in-out cubic */
export function easeInOutCubic(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** ease-in quad */
export function easeInQuad(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c;
}

/** ease-out quad */
export function easeOutQuad(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - c) * (1 - c);
}

/** ease-in-out quad */
export function easeInOutQuad(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** ease-out cubic */
export function easeOutCubic(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

// ===== 向量工具 =====

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function lerpJoint(a: JointPose, b: JointPose, t: number): JointPose {
  return {
    position: lerpVec3(a.position, b.position, t),
    rotation: lerpVec3(a.rotation, b.rotation, t),
  };
}

// ===== 姿态差异检测 =====

export interface PoseDistance {
  /** 位置差异均值 */
  position: number;
  /** 旋转差异均值（弧度） */
  rotation: number;
  /** 手形差异（0 或 1） */
  handshape: number;
}

/**
 * 计算两个姿态之间的位置、旋转和手形差异
 * - 位置差异：所有关节位置向量的欧几里得距离均值
 * - 旋转差异：所有关节旋转角度差的均值
 * - 手形差异：手形枚举值不同则返回 1，相同返回 0
 */
export function poseDistance(a: BonePose, b: BonePose): PoseDistance {
  let posSum = 0;
  let rotSum = 0;
  let count = 0;

  // 累加身体关节差异
  for (const key of BODY_JOINT_KEYS) {
    const ja = a[key] as JointPose;
    const jb = b[key] as JointPose;
    posSum += vec3Length(vec3Sub(ja.position, jb.position));
    rotSum += vec3Length(vec3Sub(ja.rotation, jb.rotation));
    count++;
  }

  // 累加手部 wrist 与 fingers 差异
  for (const side of ['left_hand', 'right_hand'] as const) {
    const ha = a[side];
    const hb = b[side];
    posSum += vec3Length(vec3Sub(ha.wrist.position, hb.wrist.position));
    rotSum += vec3Length(vec3Sub(ha.wrist.rotation, hb.wrist.rotation));
    count++;
    for (let i = 0; i < ha.fingers.length; i++) {
      posSum += vec3Length(vec3Sub(ha.fingers[i].position, hb.fingers[i].position));
      rotSum += vec3Length(vec3Sub(ha.fingers[i].rotation, hb.fingers[i].rotation));
      count++;
    }
  }

  // 手形差异：双手任一不同则记为 1
  const handshapeDiff =
    (a.left_hand.shape !== b.left_hand.shape ? 1 : 0) +
    (a.right_hand.shape !== b.right_hand.shape ? 1 : 0);

  return {
    position: count > 0 ? posSum / count : 0,
    rotation: count > 0 ? rotSum / count : 0,
    handshape: handshapeDiff,
  };
}

// ===== 姿态插值 =====

/** 插值 HandPose：手形用 interpolateHandshape，关节用 lerp */
function interpolateHand(a: HandPose, b: HandPose, progress: number): HandPose {
  const t = easeInOutCubic(progress);
  // 手形定义插值（用于驱动手指关节角度）
  const shapeDef = interpolateHandshape(a.shape, b.shape, progress);
  // shape 在中点切换，避免枚举跳变突兀
  const shape = progress >= 0.5 ? b.shape : a.shape;
  // 手指关节角度应用插值后的手形定义（mcp/pip/dip -> rotation.x/y/z）
  const fingers = shapeDef.fingers.map((fp, i) => ({
    position: lerpVec3(a.fingers[i].position, b.fingers[i].position, t),
    rotation: { x: fp.mcp, y: fp.pip, z: fp.dip },
  })) as HandPose['fingers'];

  return {
    shape,
    location: progress >= 0.5 ? b.location : a.location,
    palm_orientation: progress >= 0.5 ? b.palm_orientation : a.palm_orientation,
    wrist: lerpJoint(a.wrist, b.wrist, t),
    fingers,
  };
}

/** 插值完整 BonePose */
function interpolateBonePose(a: BonePose, b: BonePose, progress: number): BonePose {
  const t = easeInOutCubic(progress);
  const pose: Partial<BonePose> = {};
  // 身体关节
  for (const key of BODY_JOINT_KEYS) {
    pose[key] = lerpJoint(a[key] as JointPose, b[key] as JointPose, t);
  }
  // 手部
  pose.left_hand = interpolateHand(a.left_hand, b.left_hand, progress);
  pose.right_hand = interpolateHand(a.right_hand, b.right_hand, progress);
  // 表情与头势在中点切换
  pose.expression = progress >= 0.5 ? b.expression : a.expression;
  pose.head_movement = progress >= 0.5 ? b.head_movement : a.head_movement;
  return pose as BonePose;
}

// ===== 关节角度约束检查 =====

/** 构建 joint -> constraint 索引，避免每次查找都遍历 */
const CONSTRAINT_MAP = new Map<string, JointConstraint>();
ALL_CONSTRAINTS.forEach((c) => CONSTRAINT_MAP.set(c.joint, c));

/** 将数值限制在 [min, max] */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 对关节旋转进行 clamp */
function clampJointRotation(joint: JointPose, constraint: JointConstraint | undefined): JointPose {
  if (!constraint) return joint;
  return {
    position: joint.position,
    rotation: {
      x: clamp(joint.rotation.x, constraint.min_rotation.x, constraint.max_rotation.x),
      y: clamp(joint.rotation.y, constraint.min_rotation.y, constraint.max_rotation.y),
      z: clamp(joint.rotation.z, constraint.min_rotation.z, constraint.max_rotation.z),
    },
  };
}

/**
 * 关节角度约束检查
 * 对每个关节的旋转角度进行 clamp（限制在 min-max 范围内）
 */
export function clampJointAngles(pose: BonePose): BonePose {
  const result: Partial<BonePose> = {};
  // 身体关节按名称查找约束
  for (const key of BODY_JOINT_KEYS) {
    const constraint = CONSTRAINT_MAP.get(key);
    result[key] = clampJointRotation(pose[key] as JointPose, constraint);
  }
  // 手部 wrist 与 fingers 不在 ALL_CONSTRAINTS 中按 BonePose 字段名登记
  // 手指角度由手形定义驱动，已通过 HandShape 定义保证合理范围，这里直接保留
  result.left_hand = pose.left_hand;
  result.right_hand = pose.right_hand;
  result.expression = pose.expression;
  result.head_movement = pose.head_movement;
  return result as BonePose;
}

// ===== IK 修正 =====

/** 从 NEUTRAL_POSE 计算上臂/前臂长度
 *  P2 修复：使用 Skeleton3D 的实际骨骼长度
 *  - 上臂（肩→肘）：0.28（Skeleton3D left_shoulder→left_elbow）
 *  - 前臂（肘→腕）：0.28（与上臂等长，符合人体比例）
 *    注意：Skeleton3D 中 wrist 相对肘部 local position 为 0，
 *    但渲染网格长度为 0.28，本实现使用 0.28 保证 IK 有正确的弯曲能力 */
function computeArmLengths(): { upperArm: number; forearm: number } {
  // 使用固定值与 Skeleton3D 渲染臂长一致
  return { upperArm: 0.28, forearm: 0.28 };
}

const ARM_LENGTHS = computeArmLengths();

/**
 * 对单帧姿态进行 IK 修正
 * 根据手腕位置反算肩部与肘部旋转，保证手臂运动自然
 * 导出供 AvatarDriver.generateBasicMotion 使用
 */
export function applyIKCorrection(pose: BonePose): BonePose {
  // 左臂 IK
  const leftIK = ikSolve(
    pose.left_shoulder.position,
    pose.left_wrist.position,
    ARM_LENGTHS.upperArm,
    ARM_LENGTHS.forearm,
  );
  // 右臂 IK
  const rightIK = ikSolve(
    pose.right_shoulder.position,
    pose.right_wrist.position,
    ARM_LENGTHS.upperArm,
    ARM_LENGTHS.forearm,
  );

  return {
    ...pose,
    left_shoulder: { ...pose.left_shoulder, rotation: leftIK.shoulderRotation },
    left_elbow: { ...pose.left_elbow, rotation: leftIK.elbowRotation },
    right_shoulder: { ...pose.right_shoulder, rotation: rightIK.shoulderRotation },
    right_elbow: { ...pose.right_elbow, rotation: rightIK.elbowRotation },
  };
}

// ===== 过渡帧序列生成 =====

/**
 * 生成过渡帧序列
 * 策略选择：位置差异 > 阈值时使用"中性复位"，否则使用"直接插值"
 *
 * @param from 起始姿态
 * @param to 目标姿态
 * @param durationMs 过渡时长（毫秒）
 * @returns 过渡帧序列
 */
export function generateTransition(from: BonePose, to: BonePose, durationMs: number): Frame[] {
  const distance = poseDistance(from, to);
  const useNeutralReset = distance.position > POSITION_DISTANCE_THRESHOLD;
  const frames: Frame[] = [];

  if (useNeutralReset) {
    // 中性复位：前半段 from -> NEUTRAL_POSE，后半段 NEUTRAL_POSE -> to
    const halfDuration = durationMs / 2;
    const halfFrameCount = Math.max(1, Math.round(halfDuration / FRAME_INTERVAL_MS));
    // 前半段
    for (let i = 0; i <= halfFrameCount; i++) {
      const progress = i / halfFrameCount;
      frames.push({
        pose: interpolateBonePose(from, NEUTRAL_POSE, progress),
        timestamp: Math.round(i * FRAME_INTERVAL_MS),
      });
    }
    // 后半段（跳过起始帧，避免重复）
    for (let i = 1; i <= halfFrameCount; i++) {
      const progress = i / halfFrameCount;
      frames.push({
        pose: interpolateBonePose(NEUTRAL_POSE, to, progress),
        timestamp: Math.round((halfFrameCount + i) * FRAME_INTERVAL_MS),
      });
    }
  } else {
    // 直接插值：from -> to
    const frameCount = Math.max(1, Math.round(durationMs / FRAME_INTERVAL_MS));
    for (let i = 0; i <= frameCount; i++) {
      const progress = i / frameCount;
      frames.push({
        pose: interpolateBonePose(from, to, progress),
        timestamp: Math.round(i * FRAME_INTERVAL_MS),
      });
    }
  }

  // 对每帧进行 IK 修正与约束检查
  return frames.map((frame) => ({
    pose: clampJointAngles(applyIKCorrection(frame.pose)),
    timestamp: frame.timestamp,
  }));
}

// ===== TransitionEngine 主类 =====

/**
 * 动作过渡引擎
 * 根据两个姿态的差异自动选择过渡策略，生成平滑过渡帧序列
 */
export class TransitionEngine {
  /**
   * 创建过渡帧序列
   * @param from 起始姿态
   * @param to 目标姿态
   * @param durationMs 过渡时长（毫秒），不传则按策略使用默认值
   */
  createTransition(from: BonePose, to: BonePose, durationMs?: number): Frame[] {
    const distance = poseDistance(from, to);
    const useNeutralReset = distance.position > POSITION_DISTANCE_THRESHOLD;
    // 默认过渡时长：直接插值 300ms，中性复位 500ms
    const duration = durationMs ?? (useNeutralReset
      ? DEFAULT_NEUTRAL_DURATION_MS
      : DEFAULT_DIRECT_DURATION_MS);
    return generateTransition(from, to, duration);
  }
}
