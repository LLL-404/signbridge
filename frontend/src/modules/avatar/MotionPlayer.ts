// 动作播放器
// 按 MotionData 驱动骨骼播放，支持帧间缓动插值、暂停/恢复、变速与循环
import type { BonePose, Frame, JointPose, MotionData, Vec3, HandPose, SignMotion, VRMPose } from '@/types/avatar';
import { NEUTRAL_POSE, NEUTRAL_VRM_POSE } from '@/types/avatar';

/** 身体关节字段列表 */
const BODY_JOINT_KEYS = [
  'root', 'spine', 'chest', 'neck', 'head',
  'left_shoulder', 'left_elbow', 'left_wrist',
  'right_shoulder', 'right_elbow', 'right_wrist',
] as const;

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function lerpJoint(a: JointPose, b: JointPose, t: number): JointPose {
  return {
    position: lerpVec3(a.position, b.position, t),
    rotation: lerpVec3(a.rotation, b.rotation, t),
  };
}

/** ease-in-out cubic（用于帧间插值） */
function easeInOutCubic(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** 缓动插值 HandPose（shape 在中点切换） */
function lerpHand(a: HandPose, b: HandPose, t: number): HandPose {
  const eased = easeInOutCubic(t);
  const fingers = a.fingers.map((f, i) => lerpJoint(f, b.fingers[i], eased)) as HandPose['fingers'];
  return {
    shape: t >= 0.5 ? b.shape : a.shape,
    location: t >= 0.5 ? b.location : a.location,
    palm_orientation: t >= 0.5 ? b.palm_orientation : a.palm_orientation,
    wrist: lerpJoint(a.wrist, b.wrist, eased),
    fingers,
  };
}

/** 缓动插值完整 BonePose（P2 修复：统一使用 easeInOutCubic） */
function lerpBonePose(a: BonePose, b: BonePose, t: number): BonePose {
  const eased = easeInOutCubic(t);
  const pose: Partial<BonePose> = {};
  for (const key of BODY_JOINT_KEYS) {
    pose[key] = lerpJoint(a[key] as JointPose, b[key] as JointPose, eased);
  }
  pose.left_hand = lerpHand(a.left_hand, b.left_hand, eased);
  pose.right_hand = lerpHand(a.right_hand, b.right_hand, eased);
  pose.expression = t >= 0.5 ? b.expression : a.expression;
  pose.head_movement = t >= 0.5 ? b.head_movement : a.head_movement;
  return pose as BonePose;
}

/** 在两个 Vec3 间插值，任一为 undefined 时返回另一个或 undefined */
function lerpVec(v1: Vec3 | undefined, v2: Vec3 | undefined, t: number): Vec3 | undefined {
  if (!v1 && !v2) return undefined;
  if (!v1) return v2;
  if (!v2) return v1;
  return { x: v1.x + (v2.x - v1.x) * t, y: v1.y + (v2.y - v1.y) * t, z: v1.z + (v2.z - v1.z) * t };
}

/**
 * 在两个 VRMPose 间插值
 * - ikTargets 各分量线性插值
 * - expression/headMovement/handShapes 取 B 的（或 A 的 fallback）
 * - bones 取并集，逐骨骼对 rotation/position 线性插值
 */
function lerpVRMPose(a: VRMPose, b: VRMPose, t: number): VRMPose {
  const result: VRMPose = {
    bones: {},
    expression: b.expression ?? a.expression,
    headMovement: b.headMovement ?? a.headMovement,
    ikTargets: {},
    handShapes: b.handShapes ?? a.handShapes,
  };

  // 插值 IK 目标
  if (a.ikTargets || b.ikTargets) {
    result.ikTargets = {
      leftHand: lerpVec(a.ikTargets?.leftHand, b.ikTargets?.leftHand, t),
      rightHand: lerpVec(a.ikTargets?.rightHand, b.ikTargets?.rightHand, t),
      leftFoot: lerpVec(a.ikTargets?.leftFoot, b.ikTargets?.leftFoot, t),
      rightFoot: lerpVec(a.ikTargets?.rightFoot, b.ikTargets?.rightFoot, t),
    };
  }

  // 插值 bones（并集，逐分量）
  const aBones = a.bones ?? {};
  const bBones = b.bones ?? {};
  const boneKeys = new Set([...Object.keys(aBones), ...Object.keys(bBones)]);
  for (const key of boneKeys) {
    const ta = aBones[key as keyof typeof aBones];
    const tb = bBones[key as keyof typeof bBones];
    if (ta && tb) {
      result.bones[key as keyof typeof result.bones] = {
        rotation: lerpVec3(ta.rotation, tb.rotation, t),
        position: ta.position && tb.position
          ? lerpVec3(ta.position, tb.position, t)
          : (ta.position ?? tb.position),
      };
    } else {
      result.bones[key as keyof typeof result.bones] = (ta ?? tb)!;
    }
  }
  return result;
}

/**
 * 动作播放器
 * 由外部循环调用 update(deltaTime) 推进时间，并在帧间做缓动插值（easeInOutCubic）
 */
export class MotionPlayer {
  /** 当前播放的动作数据 */
  private motion: MotionData | null = null;
  /** 当前播放时间（毫秒） */
  private currentTime: number = 0;
  /** 是否正在播放 */
  private playing: boolean = false;
  /** 是否暂停 */
  private paused: boolean = false;
  /** 播放速度倍率 */
  private speed: number = 1.0;
  /** 完成回调 */
  private onComplete: (() => void) | null = null;
  /** 当前姿态（用于 getCurrentPose） */
  private currentPose: BonePose = NEUTRAL_POSE;
  /** 当前播放的 SignMotion 关键帧序列（新轨道） */
  private currentMotion: SignMotion | null = null;

  /** 播放一个动作 */
  play(motion: MotionData, onComplete?: () => void): void {
    this.motion = motion;
    this.currentTime = 0;
    this.playing = true;
    this.paused = false;
    this.onComplete = onComplete ?? null;
    // 初始化为第一帧
    this.currentPose = motion.frames.length > 0 ? motion.frames[0].pose : NEUTRAL_POSE;
  }

  /** 停止播放并重置 */
  stop(): void {
    this.motion = null;
    this.currentTime = 0;
    this.playing = false;
    this.paused = false;
    this.onComplete = null;
    this.currentPose = NEUTRAL_POSE;
  }

  /** 暂停 */
  pause(): void {
    if (this.playing) this.paused = true;
  }

  /** 恢复 */
  resume(): void {
    if (this.playing) this.paused = false;
  }

  /** 设置播放速度（1.0=正常） */
  setSpeed(speed: number): void {
    this.speed = speed > 0 ? speed : 1.0;
  }

  /** 获取当前帧姿态 */
  getCurrentPose(): BonePose {
    return this.currentPose;
  }

  /** 是否正在播放 */
  isPlaying(): boolean {
    return this.playing && !this.paused;
  }

  /**
   * 每帧更新（由外部循环调用）
   * @param deltaTime 距上一帧的时间间隔（毫秒）
   */
  update(deltaTime: number): void {
    // 未播放、已暂停或无动作数据，直接返回
    if (!this.playing || this.paused || !this.motion) return;
    const frames = this.motion.frames;
    if (frames.length === 0) return;

    // 推进时间
    this.currentTime += deltaTime * this.speed;

    // 到达或超过动作时长
    if (this.currentTime >= this.motion.duration_ms) {
      if (this.motion.loop) {
        // 循环：取模回到起点
        this.currentTime = this.currentTime % this.motion.duration_ms;
      } else {
        // 非循环：固定到最后一帧并结束
        this.currentPose = frames[frames.length - 1].pose;
        this.playing = false;
        const cb = this.onComplete;
        this.onComplete = null;
        if (cb) cb();
        return;
      }
    }

    // 在帧间线性插值
    this.currentPose = this.samplePoseAtTime(frames, this.currentTime);
  }

  /**
   * 根据时间在帧序列中采样并插值
   * 找到当前时间所在的两个帧，做线性插值
   */
  private samplePoseAtTime(frames: Frame[], time: number): BonePose {
    // 时间在第一帧之前
    if (time <= frames[0].timestamp) return frames[0].pose;
    // 时间在最后一帧之后
    const last = frames[frames.length - 1];
    if (time >= last.timestamp) return last.pose;

    // 二分查找当前时间所在区间 [i, i+1]
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].timestamp <= time) lo = mid;
      else hi = mid;
    }
    const f0 = frames[lo];
    const f1 = frames[hi];
    const span = f1.timestamp - f0.timestamp;
    const t = span > 0 ? (time - f0.timestamp) / span : 0;
    return lerpBonePose(f0.pose, f1.pose, t);
  }

  /**
   * 播放关键帧动作序列（SignMotion 新轨道）
   * 不影响旧 MotionData 轨道，外部用 getPoseAt 采样
   */
  playMotion(motion: SignMotion): void {
    this.currentMotion = motion;
  }

  /**
   * 获取指定时刻（毫秒）的插值 VRMPose
   * - 无 motion 或关键帧为空 → NEUTRAL_VRM_POSE
   * - timeMs >= duration → 最后一帧
   * - 否则在所在关键帧区间用 easeInOutCubic 缓动插值
   */
  getPoseAt(timeMs: number): VRMPose {
    if (!this.currentMotion || this.currentMotion.keyframes.length === 0) {
      return NEUTRAL_VRM_POSE;
    }
    const kfs = this.currentMotion.keyframes;
    const duration = this.currentMotion.duration_ms;

    // 超出时长：返回最后一帧
    if (timeMs >= duration) {
      return kfs[kfs.length - 1].pose;
    }

    // 归一化时间
    const t = duration > 0 ? timeMs / duration : 0;

    // 找到 t 所在的关键帧区间 [i, i+1]
    let i = 0;
    while (i < kfs.length - 1 && kfs[i + 1].time < t) i++;

    const kfA = kfs[i];
    const kfB = kfs[Math.min(i + 1, kfs.length - 1)];
    const span = kfB.time - kfA.time;
    const localT = span > 0 ? (t - kfA.time) / span : 0;
    // easeInOutCubic 缓动
    const eased = localT < 0.5 ? 4 * localT ** 3 : 1 - Math.pow(-2 * localT + 2, 3) / 2;

    return lerpVRMPose(kfA.pose, kfB.pose, eased);
  }
}
