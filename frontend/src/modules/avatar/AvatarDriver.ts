// 虚拟人动作驱动引擎
// 接收词汇序列（GlossSequence），编排播放：
//   - 旧 BonePose 轨道（保留，供 2D/skeleton 模式）
//   - 新 AnimationClip 轨道（VRMAnimator 驱动，3D VRM 模式）
// 新轨道通过 ClipBuilder 生成 AnimationClip，交由 VRMAnimator 播放，
// 不再维护 VRMPose 状态与每帧手动设置 node.quaternion。
import * as THREE from 'three';
import type { BonePose, Frame, JointPose, MotionData, Vec3, HandPose, VRMPose } from '@/types/avatar';
import { NEUTRAL_POSE, NEUTRAL_VRM_POSE } from '@/types/avatar';
import type { GlossSequence, NonManualMark } from '@/types/grammar';
import {
  HandShape,
  HandLocation,
} from '@/types/sign';
import type { HandShapeDefinition, SignGloss } from '@/types/sign';
import { MotionPlayer } from './MotionPlayer';
import { TransitionEngine } from './TransitionEngine';
import { getHandShapeDefinition } from './HandShape';
import { VRMAnimator } from './VRMAnimator';
import { ClipBuilder } from './ClipBuilder';
import { retarget as retargetMixamoClip } from './MixamoRetargeter';
import { parseHandShape, parseHandLocation, parseFacialExpression, parseHeadMovement } from './EnumParser';
import type { VRM } from '@pixiv/three-vrm';
import { vocabularyStore } from '../data/VocabularyStore';
import { motionDataStore } from '../data/MotionDataStore';
import { logger } from '@/modules/debug/logger';
import {
  easeInOutCubic,
  applyIKCorrection,
  clampJointAngles,
} from './TransitionEngine';

const log = logger.module('AvatarDriver');

/** 身体关节字段列表 */
const BODY_JOINT_KEYS = [
  'root', 'spine', 'chest', 'neck', 'head',
  'left_shoulder', 'left_elbow', 'left_wrist',
  'right_shoulder', 'right_elbow', 'right_wrist',
  'left_hip', 'left_knee', 'left_ankle',
  'right_hip', 'right_knee', 'right_ankle',
] as const;

/**
 * HandLocation → 3D 位置映射（世界坐标，Y 轴向上，与 Skeleton3D FK 一致）
 *   hips y=1.0, waist≈1.0, abdomen≈1.15, chest y=1.42, shoulder y=1.40,
 *   neck y=1.50, chin≈1.46, mouth≈1.52, nose≈1.56, eye≈1.60, forehead≈1.66,
 *   手臂自然下垂 wrist y≈0.82，中性手位腹部前方 y≈0.95 z≈0.15
 */
const LOCATION_POSITIONS: Record<HandLocation, Vec3> = {
  [HandLocation.NEUTRAL]: { x: 0, y: 0.95, z: 0.15 },
  [HandLocation.CHEST_CENTER]: { x: 0, y: 1.35, z: 0.12 },
  [HandLocation.CHEST_LEFT]: { x: -0.18, y: 1.35, z: 0.12 },
  [HandLocation.CHEST_RIGHT]: { x: 0.18, y: 1.35, z: 0.12 },
  [HandLocation.SHOULDER_LEFT]: { x: -0.22, y: 1.40, z: 0 },
  [HandLocation.SHOULDER_RIGHT]: { x: 0.22, y: 1.40, z: 0 },
  [HandLocation.FACE_LEVEL]: { x: 0, y: 1.52, z: 0.18 },
  [HandLocation.EYE_LEVEL]: { x: 0, y: 1.58, z: 0.18 },
  [HandLocation.MOUTH_LEVEL]: { x: 0, y: 1.50, z: 0.18 },
  [HandLocation.CHIN_LEVEL]: { x: 0, y: 1.45, z: 0.15 },
  [HandLocation.FOREHEAD_LEVEL]: { x: 0, y: 1.65, z: 0.18 },
  [HandLocation.ABDOMEN_LEVEL]: { x: 0, y: 1.15, z: 0.10 },
  [HandLocation.WAIST_LEVEL]: { x: 0, y: 1.00, z: 0.10 },
};

/** 默认动作时长（毫秒） */
const DEFAULT_DURATION_MS = 1000;
/** 帧间隔（毫秒） */
const FRAME_INTERVAL_MS = 16;

// ===== 位置与姿态构建 =====

/** 获取指定位置对应的 3D 坐标，NEUTRAL 时根据主导手调整 x 符号 */
function getLocationPosition(location: HandLocation, dominantHand: 'left' | 'right'): Vec3 {
  const base = LOCATION_POSITIONS[location] ?? LOCATION_POSITIONS[HandLocation.NEUTRAL];
  if (location === HandLocation.NEUTRAL) {
    return { x: dominantHand === 'left' ? -0.20 : 0.20, y: base.y, z: base.z };
  }
  return { ...base };
}

/**
 * 根据 movement 方向对位置施加偏移（用于 2D/skeleton 模式下起止位置相同时的运动）
 * 注意：3D VRM 模式使用 ClipBuilder.buildMovementTrajectory 处理全部 19 种 Movement 枚举，
 * 本函数仅服务于旧 BonePose 管道的简化位置偏移，不需要完整轨迹支持。
 */
function applyMovementOffset(pos: Vec3, movement: string): Vec3 {
  const offset = 0.2;
  switch (movement) {
    case 'upward': return { ...pos, y: pos.y + offset };
    case 'downward': return { ...pos, y: pos.y - offset };
    case 'leftward': return { ...pos, x: pos.x - offset };
    case 'rightward': return { ...pos, x: pos.x + offset };
    case 'toward_body': return { ...pos, z: pos.z - offset };
    case 'away_from_body': return { ...pos, z: pos.z + offset };
    case 'horizontal_line': return { ...pos, x: pos.x + offset };
    case 'vertical_line': return { ...pos, y: pos.y + offset };
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

// ===== 基础动作生成（旧 BonePose 轨道，供 2D/skeleton 模式）=====

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
 * 接收词汇序列，编排播放：
 *   - 旧 BonePose 轨道（保留，供 2D/skeleton 模式）
 *   - 新 AnimationClip 轨道（VRMAnimator 驱动，3D VRM 模式）
 *
 * 新架构下 VRM 动画由 ClipBuilder 生成 AnimationClip，VRMAnimator（封装 AnimationMixer）播放。
 * AvatarDriver 不再维护 VRMPose / vrmQueue / vrmTime 等状态。
 */
export class AvatarDriver {
  private motionPlayer = new MotionPlayer();
  private transitionEngine = new TransitionEngine();
  /** 播放队列（motion 与 transition 交替，旧 BonePose 轨道） */
  private queue: MotionData[] = [];
  private queueIndex = 0;
  private playing = false;
  private speed = 1.0;
  /** Promise resolve 函数，播放完成时调用 */
  private resolvePromise: (() => void) | null = null;
  /** 用户传入的完成回调 */
  private onCompleteCallback: (() => void) | null = null;

  // ===== 新 AnimationClip 轨道相关字段 =====
  /** VRMAnimator 实例（由 VRMModel 创建并传入） */
  private vrmAnimator: VRMAnimator | null = null;
  /** 已加载的 VRM 模型实例 */
  private vrm: VRM | null = null;

  // ===== 穿模检测相关字段 =====
  /** 是否正在播放 Mixamo 重定向动画（仅在此时进行每帧穿模检测） */
  private isPlayingRetargetedAnim = false;
  /** 单只手在同一动画内的穿模日志计数（达到上限后不再输出，避免刷屏） */
  private penetrationLogCount = { left: 0, right: 0 };
  /** 同一动画内同一只手的穿模日志上限 */
  private static readonly MAX_PENETRATION_LOGS = 3;
  /** 复用 Vector3 实例，避免每帧分配造成 GC 压力 */
  private readonly _tmpLeftHandPos = new THREE.Vector3();
  private readonly _tmpRightHandPos = new THREE.Vector3();
  private readonly _tmpHipsPos = new THREE.Vector3();

  /**
   * 注入 VRMAnimator 与 VRM 实例
   * 由 VRMModel 在 VRM 加载成功后调用，把同一份 VRMAnimator 实例共享给 AvatarDriver，
   * 让 AvatarDriver 通过 playClip 触发动画，VRMModel 在 useFrame 中调用 vrmAnimator.update(delta)。
   */
  setVRMAnimator(vrm: VRM, animator: VRMAnimator): void {
    this.vrm = vrm;
    this.vrmAnimator = animator;
    log.info('已绑定 VRMAnimator', { hasExpressionManager: !!vrm.expressionManager });
  }

  /**
   * 加载 Mixamo FBX 动画并重定向后播放
   *
   * 流程：
   *   1. 动态 import FBXLoader，加载远程 FBX
   *   2. 取 asset.animations[0] 作为 fbxClip
   *   3. 调用 MixamoRetargeter.retarget 重映射轨道到 VRM normalized bone
   *   4. 通过 VRMAnimator.playClip 播放，await clip 时长后触发 onComplete
   *
   * 失败处理：try/catch 捕获异常，log.error 输出失败信息，不向上抛出
   *
   * @param url FBX 文件 URL（如 '/animations/hello.fbx'）
   * @param onComplete 播放完成回调（可选）
   */
  async playRetargetedAnimation(url: string, onComplete?: () => void): Promise<void> {
    if (!this.vrm || !this.vrmAnimator) {
      log.error('playRetargetedAnimation 失败：VRM 未绑定', { url });
      onComplete?.();
      return;
    }

    // 标记进入 Mixamo 重定向动画播放，启用 update() 中的每帧穿模检测；
    // 重置日志计数器，确保本次动画的穿模日志配额独立。
    this.isPlayingRetargetedAnim = true;
    this.penetrationLogCount = { left: 0, right: 0 };

    try {
      // 动态加载 FBXLoader，避免首屏包体积增加
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const loader = new FBXLoader();
      const asset = await loader.loadAsync(url);

      const fbxClip = asset.animations[0];
      if (!fbxClip) {
        log.error('FBX 文件未包含动画', { url });
        onComplete?.();
        return;
      }

      // 重定向到 VRM normalized bone
      const retargetedClip = retargetMixamoClip(fbxClip, this.vrm);
      this.vrmAnimator.playClip(retargetedClip, 0.3);
      log.info('播放 Mixamo 重定向动画', { url, duration: retargetedClip.duration });

      // 穿模检测说明：重定向动画无轨迹点（不同于 ClipBuilder.buildArmTracks 生成的轨道），
      // 无法用同样方法做静态穿模检测，需运行时每帧检测手腕位置是否穿入躯干。
      // 标志位 isPlayingRetargetedAnim 已置为 true，update() 会调用 checkPenetration() 执行每帧检测。
      log.info('[穿模统计] Mixamo重定向动画 | 轨迹点=N/A | 运行时每帧检测已启用');

      // 等待 clip 播放完成后触发 onComplete
      await this.waitClipFinish(retargetedClip.duration);
      onComplete?.();
    } catch (err) {
      log.error('playRetargetedAnimation 失败', { url, err });
      onComplete?.();
    } finally {
      // 无论成功/失败/提前返回，都重置穿模检测标志，避免后续误检测
      this.isPlayingRetargetedAnim = false;
    }
  }

  /**
   * 播放词汇序列
   *
   * 流程：
   *   1. 旧 BonePose 轨道：准备 MotionData，构建播放队列（motion + transition 交替）
   *   2. 新 AnimationClip 轨道：若已绑定 VRMAnimator，对每个词汇调用 ClipBuilder.buildClip
   *      生成 AnimationClip 并 playClip，同步设置表情，await clip 播放完成
   *   3. 启动 BonePose 轨道播放（若存在）
   */
  async playSequence(sequence: GlossSequence, onComplete?: () => void): Promise<void> {
    this.onCompleteCallback = onComplete ?? null;

    // ===== 1. 旧 BonePose 轨道：准备动作数据 =====
    const motions: MotionData[] = [];
    for (const item of sequence.items) {
      const motion = await this.prepareMotion(item.gloss_id, item.non_manual, sequence.sentence_non_manual);
      if (motion) motions.push(motion);
    }
    log.info('准备动作', `${motions.length} 个 BonePose 动作`);

    this.queue = this.buildQueue(motions);
    this.queueIndex = 0;
    this.playing = true;

    // ===== 2. 新 AnimationClip 轨道：依次播放每个词汇的 clip =====
    if (this.vrmAnimator && this.vrm) {
      for (const item of sequence.items) {
        const gloss = await vocabularyStore.getById(item.gloss_id);
        if (!gloss || !this.vrm) continue;

        const clip = ClipBuilder.buildClip(gloss, this.vrm);

        // 表情由 ClipBuilder.buildExpressionTrack 生成的轨道驱动，
        // 通过 VRMAnimator 构造函数中创建的 'expressionManager' 代理 Object3D
        // 转发到 vrm.expressionManager，无需在此手动调用 setValue
        this.vrmAnimator.playClip(clip, 0.3);
        log.info('播放词汇 clip', { glossId: item.gloss_id, duration: clip.duration });
        await this.waitClipFinish(clip.duration);
      }
      // 序列播放完毕，淡出最后一个 action
      this.vrmAnimator.stop(0.3);
    }

    // ===== 3. 启动 BonePose 轨道（若存在）=====
    if (this.queue.length > 0) {
      this.playCurrent();
    }

    log.info('开始播放', `队列长度: ${this.queue.length}, 使用 VRMAnimator: ${!!this.vrmAnimator}`);

    return new Promise<void>((resolve) => {
      this.resolvePromise = resolve;
      // 若 BonePose 队列为空，且 VRMAnimator 也未启动或已 await 完成，立即结束
      if (this.queue.length === 0) {
        this.finish();
      }
    });
  }

  /**
   * 等待 clip 播放完成
   * 简化实现：setTimeout(durationSec * 1000)
   * 注意：speed 影响——若 speed != 1，应缩短/延长等待时间
   */
  private waitClipFinish(durationSec: number): Promise<void> {
    const waitMs = (durationSec * 1000) / this.speed;
    return new Promise((resolve) => {
      setTimeout(() => resolve(), waitMs);
    });
  }

  /** 停止播放并重置 */
  stop(): void {
    this.motionPlayer.stop();
    this.queue = [];
    this.queueIndex = 0;
    this.playing = false;
    // 停止 VRMAnimator 当前 action（淡出 0.3 秒）
    this.vrmAnimator?.stop(0.3);
    this.onCompleteCallback = null;
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    if (resolve) resolve();
  }

  /** 获取当前姿态（旧 BonePose 轨道，供 2D/skeleton 模式） */
  getCurrentPose(): BonePose {
    return this.motionPlayer.getCurrentPose();
  }

  /**
   * 获取当前 VRM 姿态
   * 兼容性保留：新架构下 VRM 动画由 VRMAnimator 内部 AnimationMixer 直接驱动骨骼，
   * AvatarDriver 不再维护 VRMPose 状态。此处返回中性姿态。
   */
  getCurrentVRMPose(): VRMPose {
    return NEUTRAL_VRM_POSE;
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

  /**
   * 每帧更新（由外部循环调用）
   * 只推进旧 BonePose 轨道；VRM 动画由 VRMAnimator.update() 在 VRMModel 的 useFrame 中调用，
   * AvatarDriver 不再推进 vrmTime。
   */
  update(deltaTime: number): void {
    if (this.playing) {
      this.motionPlayer.update(deltaTime);
    }
    // 穿模检测（仅在播放 Mixamo 重定向动画时）
    if (this.isPlayingRetargetedAnim && this.vrm) {
      this.checkPenetration();
    }
  }

  // ===== 内部方法 =====

  /**
   * 准备单个词汇的动作数据（旧 BonePose 轨道）
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
      // BonePose 轨道完成
      this.playing = false;
      // VRM 轨道已在 playSequence 中 await 完成，无需再检查
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

  // ===== 穿模检测 =====

  /**
   * 检测手腕是否穿入躯干边界（每帧调用，仅在播放 Mixamo 重定向动画时）
   *
   * 躯干边界定义：以 hips 骨骼世界位置为中心，
   *   X 方向 ±0.15m，Z 方向 ±0.12m 的矩形区域（不考虑 Y，因为手腕在不同高度都可能穿入躯干）。
   *
   * 穿模时通过 log.warn 输出警告，不中断动画播放；
   * 同一动画内同一只手最多记录 MAX_PENETRATION_LOGS 次，避免日志刷屏。
   */
  private checkPenetration(): void {
    if (!this.vrm) return;

    const humanoid = this.vrm.humanoid;
    const hipsNode = humanoid.getNormalizedBoneNode('hips' as never);
    const leftHandNode = humanoid.getNormalizedBoneNode('leftHand' as never);
    const rightHandNode = humanoid.getNormalizedBoneNode('rightHand' as never);
    // 任一关键骨骼缺失则无法检测，直接跳过
    if (!hipsNode || !leftHandNode || !rightHandNode) return;

    hipsNode.getWorldPosition(this._tmpHipsPos);
    const hipsX = this._tmpHipsPos.x;
    const hipsZ = this._tmpHipsPos.z;

    this.checkHandPenetration('left', leftHandNode, hipsX, hipsZ, this._tmpLeftHandPos);
    this.checkHandPenetration('right', rightHandNode, hipsX, hipsZ, this._tmpRightHandPos);
  }

  /**
   * 检测单只手是否穿入躯干边界，穿模时输出警告日志（受计数限制）
   *
   * @param hand 'left' 或 'right'，用于日志与计数器索引
   * @param handNode 手腕骨骼节点（leftHand / rightHand normalized bone）
   * @param hipsX hips 世界坐标 X（已预先读取，避免重复读取）
   * @param hipsZ hips 世界坐标 Z
   * @param tmpPos 复用的 Vector3，用于接收手腕世界位置（避免每帧分配）
   */
  private checkHandPenetration(
    hand: 'left' | 'right',
    handNode: THREE.Object3D,
    hipsX: number,
    hipsZ: number,
    tmpPos: THREE.Vector3,
  ): void {
    handNode.getWorldPosition(tmpPos);
    // 躯干边界：|Δx| < 0.15 且 |Δz| < 0.12 视为穿模
    const isPenetrating =
      Math.abs(tmpPos.x - hipsX) < 0.15 &&
      Math.abs(tmpPos.z - hipsZ) < 0.12;
    if (!isPenetrating) return;
    // 达到日志上限后不再输出，但仍继续检测（不中断动画）
    if (this.penetrationLogCount[hand] >= AvatarDriver.MAX_PENETRATION_LOGS) return;

    this.penetrationLogCount[hand]++;
    log.warn('[穿模检测] 手腕穿入躯干', {
      hand,
      position: { x: tmpPos.x, y: tmpPos.y, z: tmpPos.z },
    });
  }
}
