// 动作播放器
// 按 MotionData 驱动骨骼播放，支持帧间缓动插值、暂停/恢复、变速与循环
import type { BonePose, Frame, JointPose, MotionData, Vec3, HandPose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';

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
}
