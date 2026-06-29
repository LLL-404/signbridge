// 虚拟人动作驱动引擎
// 接收词汇序列（GlossSequence），编排播放：获取/生成动作数据、词汇间过渡、附加非手动标记
import type { BonePose, Frame, JointPose, MotionData, Vec3, HandPose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import type { GlossSequence, NonManualMark } from '@/types/grammar';
import {
  HandShape,
  HandLocation,
  FacialExpression,
  HeadMovement,
} from '@/types/sign';
import type { HandShapeDefinition, SignGloss } from '@/types/sign';
import { MotionPlayer } from './MotionPlayer';
import { TransitionEngine } from './TransitionEngine';
import { getHandShapeDefinition } from './HandShape';
import { vocabularyStore } from '../data/VocabularyStore';
import { motionDataStore } from '../data/MotionDataStore';
import {
  easeInOutCubic,
  applyIKCorrection,
  clampJointAngles,
} from './TransitionEngine';

/** 身体关节字段列表 */
const BODY_JOINT_KEYS = [
  'root', 'spine', 'chest', 'neck', 'head',
  'left_shoulder', 'left_elbow', 'left_wrist',
  'right_shoulder', 'right_elbow', 'right_wrist',
] as const;

/** HandLocation → 3D 位置映射（基于身体坐标，Y 轴向上） */
const LOCATION_POSITIONS: Record<HandLocation, Vec3> = {
  [HandLocation.NEUTRAL]: { x: 0, y: 0.9, z: 0 },
  [HandLocation.CHEST_CENTER]: { x: 0, y: 1.3, z: 0.1 },
  [HandLocation.CHEST_LEFT]: { x: -0.15, y: 1.3, z: 0.1 },
  [HandLocation.CHEST_RIGHT]: { x: 0.15, y: 1.3, z: 0.1 },
  [HandLocation.SHOULDER_LEFT]: { x: -0.2, y: 1.45, z: 0 },
  [HandLocation.SHOULDER_RIGHT]: { x: 0.2, y: 1.45, z: 0 },
  [HandLocation.FACE_LEVEL]: { x: 0, y: 1.65, z: 0.15 },
  [HandLocation.EYE_LEVEL]: { x: 0, y: 1.7, z: 0.15 },
  [HandLocation.MOUTH_LEVEL]: { x: 0, y: 1.55, z: 0.15 },
  [HandLocation.CHIN_LEVEL]: { x: 0, y: 1.5, z: 0.15 },
  [HandLocation.FOREHEAD_LEVEL]: { x: 0, y: 1.75, z: 0.15 },
  [HandLocation.ABDOMEN_LEVEL]: { x: 0, y: 1.0, z: 0.1 },
  [HandLocation.WAIST_LEVEL]: { x: 0, y: 0.85, z: 0.1 },
};

/** 默认动作时长（毫秒） */
const DEFAULT_DURATION_MS = 1000;
/** 帧间隔（毫秒） */
const FRAME_INTERVAL_MS = 16;

// ===== 枚举解析 =====

/** 将字符串安全转换为 HandShape 枚举，无法识别时返回 OPEN_5 */
function parseHandShape(s: string): HandShape {
  const values = Object.values(HandShape);
  return (values as string[]).includes(s) ? (s as HandShape) : HandShape.OPEN_5;
}

/** 将字符串安全转换为 HandLocation 枚举，无法识别时返回 NEUTRAL */
function parseHandLocation(s: string): HandLocation {
  const values = Object.values(HandLocation);
  return (values as string[]).includes(s) ? (s as HandLocation) : HandLocation.NEUTRAL;
}

/** 将字符串安全转换为 FacialExpression 枚举 */
function parseFacialExpression(s: string): FacialExpression {
  const values = Object.values(FacialExpression);
  return (values as string[]).includes(s) ? (s as FacialExpression) : FacialExpression.NEUTRAL;
}

/** 将字符串安全转换为 HeadMovement 枚举 */
function parseHeadMovement(s: string): HeadMovement {
  const values = Object.values(HeadMovement);
  return (values as string[]).includes(s) ? (s as HeadMovement) : HeadMovement.NONE;
}

// ===== 位置与姿态构建 =====

/** 获取指定位置对应的 3D 坐标，NEUTRAL 时根据主导手调整 x 符号 */
function getLocationPosition(location: HandLocation, dominantHand: 'left' | 'right'): Vec3 {
  const base = LOCATION_POSITIONS[location] ?? LOCATION_POSITIONS[HandLocation.NEUTRAL];
  if (location === HandLocation.NEUTRAL) {
    return { x: dominantHand === 'left' ? -0.25 : 0.25, y: base.y, z: base.z };
  }
  return { ...base };
}

/** 根据 movement 方向对位置施加偏移（用于起止位置相同时的运动） */
function applyMovementOffset(pos: Vec3, movement: string): Vec3 {
  const offset = 0.2;
  switch (movement) {
    case 'upward': return { ...pos, y: pos.y + offset };
    case 'downward': return { ...pos, y: pos.y - offset };
    case 'leftward': return { ...pos, x: pos.x - offset };
    case 'rightward': return { ...pos, x: pos.x + offset };
    case 'toward_body': return { ...pos, z: pos.z - offset };
    case 'away_from_body': return { ...pos, z: pos.z + offset };
    default: return { ...pos };
  }
}

/** 根据手形定义构建 HandPose（手指关节角度从 HandShapeDefinition 映射） */
function buildHandPose(shape: HandShape, location: HandLocation, wristPos: Vec3): HandPose {
  const def: HandShapeDefinition = getHandShapeDefinition(shape);
  const fingers = def.fingers.map((fp) => ({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: fp.mcp, y: fp.pip, z: fp.dip },
  })) as HandPose['fingers'];
  return {
    shape,
    location,
    palm_orientation: 'inward',
    wrist: { position: { ...wristPos }, rotation: { x: 0, y: 0, z: 0 } },
    fingers,
  };
}

/** 构建包含指定手部姿态的完整 BonePose（基于 NEUTRAL_POSE，仅修改主导手） */
function buildPoseWithHand(
  dominantHand: 'left' | 'right',
  shape: HandShape,
  location: HandLocation,
  wristPos: Vec3,
): BonePose {
  const pose: BonePose = {
    ...NEUTRAL_POSE,
    left_hand: { ...NEUTRAL_POSE.left_hand, fingers: [...NEUTRAL_POSE.left_hand.fingers] },
    right_hand: { ...NEUTRAL_POSE.right_hand, fingers: [...NEUTRAL_POSE.right_hand.fingers] },
  };
  const handPose = buildHandPose(shape, location, wristPos);
  const wristJoint: JointPose = { position: { ...wristPos }, rotation: { x: 0, y: 0, z: 0 } };
  if (dominantHand === 'left') {
    pose.left_hand = handPose;
    pose.left_wrist = wristJoint;
  } else {
    pose.right_hand = handPose;
    pose.right_wrist = wristJoint;
  }
  return pose;
}

// ===== 线性插值 =====

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function lerpJoint(a: JointPose, b: JointPose, t: number): JointPose {
  return { position: lerpVec3(a.position, b.position, t), rotation: lerpVec3(a.rotation, b.rotation, t) };
}

function lerpHand(a: HandPose, b: HandPose, t: number): HandPose {
  const fingers = a.fingers.map((f, i) => lerpJoint(f, b.fingers[i], t)) as HandPose['fingers'];
  return {
    shape: t >= 0.5 ? b.shape : a.shape,
    location: t >= 0.5 ? b.location : a.location,
    palm_orientation: t >= 0.5 ? b.palm_orientation : a.palm_orientation,
    wrist: lerpJoint(a.wrist, b.wrist, t),
    fingers,
  };
}

/** 线性插值完整 BonePose（P2 修复：使用缓动函数）
 *  缓动使动作开始和结束更自然，有自然的加减速感 */
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

// ===== 基础动作生成 =====

/**
 * 根据 SignGloss.manual 参数生成基础动作
 * 使用 handshape_start/end、location_start/end、movement 生成起止帧，
 * 中间用缓动插值填充（P2 修复：使用 easeInOutCubic）
 * P0 修复：每帧都经过 IK 反算，保证肩肘旋转与手腕位置一致
 */
function generateBasicMotion(gloss: SignGloss): MotionData {
  const manual = gloss.manual;
  const dominantHand = manual.dominant_hand;
  const shapeStart = parseHandShape(manual.handshape_start);
  const shapeEnd = parseHandShape(manual.handshape_end);
  const locStart = parseHandLocation(manual.location_start);
  const locEnd = parseHandLocation(manual.location_end);

  // 起止位置
  const startPos = getLocationPosition(locStart, dominantHand);
  let endPos = getLocationPosition(locEnd, dominantHand);
  // 起止位置相同且 movement 非静态时，根据 movement 方向施加偏移
  if (locStart === locEnd && manual.movement !== 'static') {
    endPos = applyMovementOffset(endPos, manual.movement);
  }

  // 起止姿态
  const startPose = buildPoseWithHand(dominantHand, shapeStart, locStart, startPos);
  const endPose = buildPoseWithHand(dominantHand, shapeEnd, locEnd, endPos);

  // 生成中间帧（缓动插值）
  const durationMs = gloss.duration_ms > 0 ? gloss.duration_ms : DEFAULT_DURATION_MS;
  const frameCount = Math.max(2, Math.round(durationMs / FRAME_INTERVAL_MS));
  const frames: Frame[] = [];
  for (let i = 0; i < frameCount; i++) {
    const t = i / (frameCount - 1);
    const rawPose = lerpBonePose(startPose, endPose, t);
    // P0 修复：对每帧进行 IK 反算 + 约束检查，保证肩肘跟随手腕
    const pose = clampJointAngles(applyIKCorrection(rawPose));
    frames.push({
      pose,
      timestamp: Math.round(t * durationMs),
    });
  }
  // 确保最后一帧时间精确
  if (frames[frames.length - 1].timestamp < durationMs) {
    frames.push({ pose: clampJointAngles(applyIKCorrection(endPose)), timestamp: durationMs });
  }

  return { gloss_id: gloss.gloss_id, frames, duration_ms: durationMs, loop: false };
}

// ===== 非手动标记应用 =====

/**
 * 将非手动标记（表情、头势）应用到动作数据的所有帧
 * 返回新的 MotionData，不修改原始数据
 */
function applyNonManual(motion: MotionData, mark: NonManualMark): MotionData {
  const expression = parseFacialExpression(mark.expression);
  const headMovement = parseHeadMovement(mark.head_movement);
  return {
    ...motion,
    frames: motion.frames.map((f) => ({
      ...f,
      pose: { ...f.pose, expression, head_movement: headMovement },
    })),
  };
}

// ===== 工具：Frame[] → MotionData =====

function framesToMotion(frames: Frame[], glossId: string): MotionData {
  const durationMs = frames.length > 0 ? frames[frames.length - 1].timestamp : 0;
  return { gloss_id: glossId, frames, duration_ms: durationMs, loop: false };
}

// ===== AvatarDriver 主类 =====

/**
 * 虚拟人动作驱动引擎
 * 接收词汇序列，编排播放：依次播放每个词汇动作，词汇间使用 TransitionEngine 生成过渡
 */
export class AvatarDriver {
  private motionPlayer = new MotionPlayer();
  private transitionEngine = new TransitionEngine();
  /** 播放队列（motion 与 transition 交替） */
  private queue: MotionData[] = [];
  private queueIndex = 0;
  private playing = false;
  private speed = 1.0;
  /** Promise resolve 函数，播放完成时调用 */
  private resolvePromise: (() => void) | null = null;
  /** 用户传入的完成回调 */
  private onCompleteCallback: (() => void) | null = null;

  /**
   * 播放词汇序列
   * 1. 对每个 item 获取/生成动作数据
   * 2. 词汇间生成过渡动画
   * 3. 附加非手动标记
   */
  async playSequence(sequence: GlossSequence, onComplete?: () => void): Promise<void> {
    // 准备所有动作数据
    const motions: MotionData[] = [];
    for (const item of sequence.items) {
      const motion = await this.prepareMotion(item.gloss_id, item.non_manual, sequence.sentence_non_manual);
      if (motion) motions.push(motion);
    }

    // 构建播放队列：motion + transition 交替
    this.queue = this.buildQueue(motions);
    this.queueIndex = 0;
    this.playing = true;
    this.onCompleteCallback = onComplete ?? null;

    return new Promise<void>((resolve) => {
      this.resolvePromise = resolve;
      if (this.queue.length > 0) {
        this.playCurrent();
      } else {
        this.finish();
      }
    });
  }

  /** 停止播放并重置 */
  stop(): void {
    this.motionPlayer.stop();
    this.queue = [];
    this.queueIndex = 0;
    this.playing = false;
    this.onCompleteCallback = null;
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    if (resolve) resolve();
  }

  /** 获取当前姿态 */
  getCurrentPose(): BonePose {
    return this.motionPlayer.getCurrentPose();
  }

  /** 设置播放速度 */
  setSpeed(speed: number): void {
    this.speed = speed;
    this.motionPlayer.setSpeed(speed);
  }

  /** 是否正在播放 */
  isPlaying(): boolean {
    return this.playing;
  }

  /** 每帧更新（由外部循环调用） */
  update(deltaTime: number): void {
    if (!this.playing) return;
    this.motionPlayer.update(deltaTime);
  }

  // ===== 内部方法 =====

  /**
   * 准备单个词汇的动作数据
   * 优先从 MotionDataStore 获取，不存在则根据 SignGloss 生成基础动作
   * 最后附加非手动标记（item 级优先于句子级）
   */
  private async prepareMotion(
    glossId: string,
    itemNonManual?: NonManualMark,
    sentenceNonManual?: NonManualMark,
  ): Promise<MotionData | null> {
    let motion = await motionDataStore.getMotion(glossId);
    if (!motion) {
      const gloss = await vocabularyStore.getById(glossId);
      if (!gloss) return null;
      motion = generateBasicMotion(gloss);
    }
    // 附加非手动标记：item 级优先，否则用句子级
    const mark = itemNonManual ?? sentenceNonManual;
    return mark ? applyNonManual(motion, mark) : motion;
  }

  /**
   * 构建播放队列
   * 在相邻 motion 之间插入 transition（从上一动作最后一帧到下一动作第一帧）
   */
  private buildQueue(motions: MotionData[]): MotionData[] {
    if (motions.length === 0) return [];
    const queue: MotionData[] = [];
    for (let i = 0; i < motions.length; i++) {
      if (i > 0) {
        const prevPose = motions[i - 1].frames[motions[i - 1].frames.length - 1].pose;
        const nextPose = motions[i].frames[0].pose;
        const transitionFrames = this.transitionEngine.createTransition(prevPose, nextPose);
        queue.push(framesToMotion(transitionFrames, `transition_${i}`));
      }
      queue.push(motions[i]);
    }
    return queue;
  }

  /** 播放当前队列项 */
  private playCurrent(): void {
    if (this.queueIndex >= this.queue.length) {
      this.finish();
      return;
    }
    this.motionPlayer.setSpeed(this.speed);
    this.motionPlayer.play(this.queue[this.queueIndex], () => this.onMotionComplete());
  }

  /** 单个动作播放完成回调 */
  private onMotionComplete(): void {
    this.queueIndex++;
    if (this.queueIndex < this.queue.length) {
      this.playCurrent();
    } else {
      this.finish();
    }
  }

  /** 整个序列播放完成 */
  private finish(): void {
    this.playing = false;
    const cb = this.onCompleteCallback;
    this.onCompleteCallback = null;
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    if (cb) cb();
    if (resolve) resolve();
  }
}
