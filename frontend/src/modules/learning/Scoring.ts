// 跟练评分算法
// 基于 DTW 时间对齐，从手形、位置、运动方向三个维度计算用户动作与标准动作的相似度
import type { FrameKeypoints, HandKeypoint, PracticeScore } from '@/types/recognition';
import type { SignGloss } from '@/types/sign';
import { DTW } from './DTW';

/** 评分维度权重 */
const WEIGHT_HANDSHAPE = 0.4;
const WEIGHT_POSITION = 0.4;
const WEIGHT_MOTION = 0.2;

/** 指尖关键点索引（MediaPipe 21 点模型） */
const FINGERTIP_INDICES = [4, 8, 12, 16, 20];
/** 腕部关键点索引 */
const WRIST_INDEX = 0;

/** 手部位置 → 归一化坐标映射（x: 0-1 水平, y: 0-1 垂直, 原点左上） */
const LOCATION_NORMALIZED: Record<string, { x: number; y: number }> = {
  neutral: { x: 0.5, y: 0.7 },
  chest_center: { x: 0.5, y: 0.5 },
  chest_left: { x: 0.3, y: 0.5 },
  chest_right: { x: 0.7, y: 0.5 },
  shoulder_left: { x: 0.25, y: 0.4 },
  shoulder_right: { x: 0.75, y: 0.4 },
  face_level: { x: 0.5, y: 0.3 },
  eye_level: { x: 0.5, y: 0.25 },
  mouth_level: { x: 0.5, y: 0.35 },
  chin_level: { x: 0.5, y: 0.38 },
  forehead_level: { x: 0.5, y: 0.2 },
  abdomen_level: { x: 0.5, y: 0.6 },
  waist_level: { x: 0.5, y: 0.75 },
};

/** 手形 → 各手指是否伸展 [拇指, 食指, 中指, 无名指, 小指] */
const HANDSHAPE_EXTENDED: Record<string, boolean[]> = {
  open_5: [true, true, true, true, true],
  flat_b: [false, true, true, true, true],
  fist_a: [false, false, false, false, false],
  v_shape: [false, true, true, false, false],
  index_point: [false, true, false, false, false],
  thumb_up: [true, false, false, false, false],
  c_shape: [true, true, true, true, true],
  o_shape: [true, true, true, true, true],
  horns: [true, true, false, false, false],
  three: [true, true, true, false, false],
  four: [false, true, true, true, true],
  six: [true, false, false, false, true],
  seven: [true, true, false, false, true],
  eight: [true, true, true, false, true],
  nine: [true, true, true, true, false],
  ten: [true, true, true, true, true],
};

/** 默认生成帧数 */
const DEFAULT_FRAME_COUNT = 30;

/**
 * 跟练评分器
 * 通过 DTW 对齐用户与标准动作序列，逐帧计算多维度相似度后汇总评分
 */
export class PracticeScorer {
  private dtw = new DTW();

  /**
   * 对用户动作序列进行评分
   * @param userKeypoints 用户摄像头捕捉的关键点序列
   * @param standardKeypoints 标准动作关键点序列
   * @returns 评分结果（总分、三项子分、反馈、对齐帧）
   */
  score(userKeypoints: FrameKeypoints[], standardKeypoints: FrameKeypoints[]): PracticeScore {
    // 空序列直接返回零分
    if (userKeypoints.length === 0 || standardKeypoints.length === 0) {
      return this.buildEmptyScore();
    }

    // 1. 将关键点序列转为特征向量序列，用于 DTW 对齐
    const userFeatures = userKeypoints.map(frameToFeatureVector);
    const standardFeatures = standardKeypoints.map(frameToFeatureVector);

    // 2. DTW 对齐
    const { alignedPairs } = this.dtw.align(userFeatures, standardFeatures);
    if (alignedPairs.length === 0) {
      return this.buildEmptyScore();
    }

    // 3. 逐帧计算三个维度的相似度
    let handshapeSum = 0;
    let positionSum = 0;
    let motionSum = 0;
    const alignedFrames: PracticeScore['aligned_frames'] = [];

    for (let k = 0; k < alignedPairs.length; k++) {
      const [uIdx, sIdx] = alignedPairs[k];
      const userFrame = userKeypoints[uIdx];
      const standardFrame = standardKeypoints[sIdx];

      // 手形相似度：指尖相对腕部向量的余弦相似度
      const handshapeSim = computeHandshapeSimilarity(userFrame, standardFrame);
      // 位置相似度：手掌绝对位置的归一化距离
      const positionSim = computePositionSimilarity(userFrame, standardFrame);
      // 运动方向相似度：帧间位移向量的角度差
      const motionSim = computeMotionSimilarity(
        userKeypoints, standardKeypoints, alignedPairs, k,
      );

      handshapeSum += handshapeSim;
      positionSum += positionSim;
      motionSum += motionSim;

      // 帧综合相似度
      const frameSim = WEIGHT_HANDSHAPE * handshapeSim
        + WEIGHT_POSITION * positionSim
        + WEIGHT_MOTION * motionSim;

      alignedFrames.push({
        user: userFrame,
        standard: standardFrame,
        similarity: frameSim,
      });
    }

    const count = alignedPairs.length;
    const handshapeScore = (handshapeSum / count) * 100;
    const positionScore = (positionSum / count) * 100;
    const motionScore = (motionSum / count) * 100;

    // 4. 总评分 = 帧相似度均值 × 100
    const totalScore = alignedFrames.reduce((acc, f) => acc + f.similarity, 0) / count * 100;

    // 5. 生成反馈
    const feedback = buildFeedback(totalScore, handshapeScore, positionScore, motionScore);

    return {
      total_score: Math.round(totalScore),
      handshape_score: Math.round(handshapeScore),
      position_score: Math.round(positionScore),
      motion_score: Math.round(motionScore),
      feedback,
      aligned_frames: alignedFrames,
    };
  }

  /** 构建零分结果 */
  private buildEmptyScore(): PracticeScore {
    return {
      total_score: 0,
      handshape_score: 0,
      position_score: 0,
      motion_score: 0,
      feedback: '未捕捉到有效动作，请重试',
      aligned_frames: [],
    };
  }
}

// ===== 特征向量转换 =====

/**
 * 将单帧关键点转为特征向量（用于 DTW 对齐）
 * 拼接左右手所有关键点坐标，空手用 0 填充
 */
function frameToFeatureVector(frame: FrameKeypoints): number[] {
  const left = handToVector(frame.left_hand);
  const right = handToVector(frame.right_hand);
  return [...left, ...right];
}

/** 单手 21 点展平为 63 维向量，null 时返回零向量 */
function handToVector(hand: HandKeypoint[] | null): number[] {
  if (!hand) return new Array<number>(63).fill(0);
  const vec: number[] = [];
  for (const kp of hand) {
    vec.push(kp.x, kp.y, kp.z);
  }
  return vec;
}

// ===== 三维度相似度计算 =====

/**
 * 手形相似度（40%）
 * 计算五根指尖相对腕部位置的向量，对比用户与标准的余弦相似度
 */
function computeHandshapeSimilarity(user: FrameKeypoints, standard: FrameKeypoints): number {
  const userVecs = extractFingertipVectors(user);
  const standardVecs = extractFingertipVectors(standard);
  // 左右手各 5 个指尖向量，逐个计算余弦相似度后取均值
  let sum = 0;
  let count = 0;
  for (let i = 0; i < userVecs.length; i++) {
    const u = userVecs[i];
    const s = standardVecs[i];
    if (u && s) {
      sum += cosineSimilarity(u, s);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * 提取五根指尖相对腕部的方向向量（左右手共 10 个）
 * 用于手形比较，消除绝对位置影响
 */
function extractFingertipVectors(frame: FrameKeypoints): (number[] | null)[] {
  const result: (number[] | null)[] = [];
  result.push(...extractHandFingertipVectors(frame.left_hand));
  result.push(...extractHandFingertipVectors(frame.right_hand));
  return result;
}

/** 提取单手 5 个指尖相对腕部的向量 */
function extractHandFingertipVectors(hand: HandKeypoint[] | null): (number[] | null)[] {
  if (!hand || hand.length <= WRIST_INDEX) {
    return [null, null, null, null, null];
  }
  const wrist = hand[WRIST_INDEX];
  return FINGERTIP_INDICES.map((tipIdx) => {
    if (tipIdx >= hand.length) return null;
    const tip = hand[tipIdx];
    return [tip.x - wrist.x, tip.y - wrist.y, tip.z - wrist.z];
  });
}

/**
 * 位置相似度（40%）
 * 计算双手腕部绝对位置的归一化距离，转换为 0-1 相似度
 */
function computePositionSimilarity(user: FrameKeypoints, standard: FrameKeypoints): number {
  const userPos = getWristPositions(user);
  const standardPos = getWristPositions(standard);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < userPos.length; i++) {
    const u = userPos[i];
    const s = standardPos[i];
    if (u && s) {
      const dist = Math.sqrt(
        (u[0] - s[0]) ** 2 + (u[1] - s[1]) ** 2,
      );
      // 距离归一化到 0-1，0.5 为最大容忍距离
      sum += Math.max(0, 1 - dist / 0.5);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** 获取左右手腕部坐标 */
function getWristPositions(frame: FrameKeypoints): (number[] | null)[] {
  return [
    frame.left_hand ? [frame.left_hand[WRIST_INDEX].x, frame.left_hand[WRIST_INDEX].y] : null,
    frame.right_hand ? [frame.right_hand[WRIST_INDEX].x, frame.right_hand[WRIST_INDEX].y] : null,
  ];
}

/**
 * 运动方向相似度（20%）
 * 计算帧间位移向量的角度差，转换为 0-1 相似度
 */
function computeMotionSimilarity(
  userSeq: FrameKeypoints[],
  standardSeq: FrameKeypoints[],
  pairs: [number, number][],
  currentIdx: number,
): number {
  // 第一帧无前序帧，返回中性相似度
  if (currentIdx === 0) return 1;

  const [uCurr, sCurr] = pairs[currentIdx];
  const [uPrev, sPrev] = pairs[currentIdx - 1];

  const userMotion = computeFrameDisplacement(userSeq[uPrev], userSeq[uCurr]);
  const standardMotion = computeFrameDisplacement(standardSeq[sPrev], standardSeq[sCurr]);

  // 计算左右手运动方向角度差的平均值
  let sum = 0;
  let count = 0;
  for (let i = 0; i < userMotion.length; i++) {
    const u = userMotion[i];
    const s = standardMotion[i];
    if (u && s) {
      const angleDiff = computeAngleDifference(u, s);
      // 角度差归一化：0 度 → 1, 180 度 → 0
      sum += 1 - angleDiff / Math.PI;
      count++;
    }
  }
  return count > 0 ? sum / count : 1;
}

/** 计算单帧间双手腕部位移向量 */
function computeFrameDisplacement(
  prev: FrameKeypoints,
  curr: FrameKeypoints,
): (number[] | null)[] {
  return [
    computeHandDisplacement(prev.left_hand, curr.left_hand),
    computeHandDisplacement(prev.right_hand, curr.right_hand),
  ];
}

/** 计算单手帧间位移向量 */
function computeHandDisplacement(
  prev: HandKeypoint[] | null,
  curr: HandKeypoint[] | null,
): number[] | null {
  if (!prev || !curr || prev.length <= WRIST_INDEX || curr.length <= WRIST_INDEX) return null;
  const pw = prev[WRIST_INDEX];
  const cw = curr[WRIST_INDEX];
  return [cw.x - pw.x, cw.y - pw.y];
}

/** 计算两个 2D 向量的角度差（弧度，0-π） */
function computeAngleDifference(a: number[], b: number[]): number {
  const dot = a[0] * b[0] + a[1] * b[1];
  const magA = Math.sqrt(a[0] ** 2 + a[1] ** 2);
  const magB = Math.sqrt(b[0] ** 2 + b[1] ** 2);
  // 零向量时角度差为 0（无运动视为方向一致）
  if (magA < 1e-6 || magB < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return Math.acos(cos);
}

/** 余弦相似度（0-1，通过 (cos+1)/2 映射到非负区间） */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (magA < 1e-6 || magB < 1e-6) return 0;
  const cos = dot / (magA * magB);
  return (cos + 1) / 2;
}

// ===== 反馈生成 =====

/**
 * 根据总分和子分生成具体反馈
 * - >= 90: 优秀
 * - >= 70: 良好 + 针对性建议
 * - < 70: 继续练习 + 针对性建议
 */
function buildFeedback(
  total: number,
  handshape: number,
  position: number,
  motion: number,
): string {
  if (total >= 90) {
    return '优秀！动作非常标准';
  }

  // 找出最低分子项，给出针对性建议
  const suggestions: string[] = [];
  if (handshape < 70) suggestions.push('注意手形细节，保持指尖正确弯曲');
  if (position < 70) suggestions.push('注意手部位置，对照标准动作调整高度');
  if (motion < 70) suggestions.push('注意运动轨迹，保持方向与幅度一致');

  const suggestionText = suggestions.length > 0 ? suggestions.join('；') : '整体动作不错，继续保持';
  const prefix = total >= 70 ? '良好，' : '继续练习，';
  return prefix + suggestionText;
}

// ===== 标准关键点生成 =====

/**
 * 根据 SignGloss 生成标准动作关键点序列
 * 用于跟练模式中与用户动作对比
 * 若 gloss.keypoints 已存在则直接转换，否则根据手动参数合成
 */
export function generateStandardKeypoints(
  gloss: SignGloss,
  frameCount: number = DEFAULT_FRAME_COUNT,
): FrameKeypoints[] {
  // 优先使用预置关键点数据
  if (gloss.keypoints && gloss.keypoints.length > 0) {
    return gloss.keypoints.map((arr, idx) => arrayToFrameKeypoints(arr, idx));
  }

  // 根据手动参数合成标准关键点
  return synthesizeKeypointsFromGloss(gloss, frameCount);
}

/** 将一维数组转为 FrameKeypoints（假设前 63 为左手，后 63 为右手） */
function arrayToFrameKeypoints(arr: number[], frameIdx: number): FrameKeypoints {
  const left = arr.slice(0, 63);
  const right = arr.slice(63, 126);
  return {
    left_hand: left.length === 63 ? vectorToHand(left) : null,
    right_hand: right.length === 63 ? vectorToHand(right) : null,
    timestamp: frameIdx * 33, // 约 30fps
  };
}

/** 63 维向量转 21 个 HandKeypoint */
function vectorToHand(vec: number[]): HandKeypoint[] {
  const hand: HandKeypoint[] = [];
  for (let i = 0; i < 21; i++) {
    hand.push({
      x: vec[i * 3] ?? 0,
      y: vec[i * 3 + 1] ?? 0,
      z: vec[i * 3 + 2] ?? 0,
    });
  }
  return hand;
}

/**
 * 根据 SignGloss 手动参数合成标准关键点序列
 * 从起始位置/手形到结束位置/手形线性插值
 */
function synthesizeKeypointsFromGloss(gloss: SignGloss, frameCount: number): FrameKeypoints[] {
  const manual = gloss.manual;
  const startPos = getLocationNormalized(manual.location_start, manual.dominant_hand);
  let endPos = getLocationNormalized(manual.location_end, manual.dominant_hand);

  // 起止位置相同且运动非静态时，根据 movement 方向施加偏移
  if (manual.location_start === manual.location_end && manual.movement !== 'static') {
    endPos = applyMovementOffsetNormalized(endPos, manual.movement);
  }

  const shapeStart = HANDSHAPE_EXTENDED[manual.handshape_start] ?? HANDSHAPE_EXTENDED.open_5;
  const shapeEnd = HANDSHAPE_EXTENDED[manual.handshape_end] ?? HANDSHAPE_EXTENDED.open_5;
  const isTwoHanded = manual.is_two_handed;

  const frames: FrameKeypoints[] = [];
  for (let i = 0; i < frameCount; i++) {
    const t = frameCount > 1 ? i / (frameCount - 1) : 0;
    // 插值位置与手形
    const pos = {
      x: lerp(startPos.x, endPos.x, t),
      y: lerp(startPos.y, endPos.y, t),
    };
    const extended = shapeStart.map((s, idx) => {
      const e = shapeEnd[idx];
      // 手形在中间过渡
      return t < 0.5 ? s : e;
    });

    // 主导手关键点
    const dominantHand = buildHandKeypoints(pos.x, pos.y, extended, manual.dominant_hand);
    // 非主导手：双手词汇时生成镜像，否则为 null
    const nonDominantHand = isTwoHanded
      ? buildHandKeypoints(1 - pos.x, pos.y, extended, manual.dominant_hand === 'left' ? 'right' : 'left')
      : null;

    frames.push({
      left_hand: manual.dominant_hand === 'left' ? dominantHand : nonDominantHand,
      right_hand: manual.dominant_hand === 'right' ? dominantHand : nonDominantHand,
      timestamp: i * 33,
    });
  }
  return frames;
}

/** 获取位置对应的归一化坐标，未知位置回退到 neutral */
function getLocationNormalized(location: string, dominantHand: 'left' | 'right'): { x: number; y: number } {
  const pos = LOCATION_NORMALIZED[location] ?? LOCATION_NORMALIZED.neutral;
  // neutral 位置根据主导手偏移到身体一侧
  if (location === 'neutral') {
    return { x: dominantHand === 'left' ? 0.35 : 0.65, y: pos.y };
  }
  return { ...pos };
}

/** 对归一化坐标施加运动方向偏移 */
function applyMovementOffsetNormalized(
  pos: { x: number; y: number },
  movement: string,
): { x: number; y: number } {
  const offset = 0.15;
  switch (movement) {
    case 'upward': return { ...pos, y: pos.y - offset };
    case 'downward': return { ...pos, y: pos.y + offset };
    case 'leftward': return { ...pos, x: pos.x - offset };
    case 'rightward': return { ...pos, x: pos.x + offset };
    default: return { ...pos };
  }
}

/**
 * 根据腕部位置和手指伸展状态构建 21 个关键点
 * 简化模型：腕部为基准点，伸展手指向上延伸，弯曲手指贴近掌心
 */
function buildHandKeypoints(
  wristX: number,
  wristY: number,
  extended: boolean[],
  side: 'left' | 'right',
): HandKeypoint[] {
  const points: HandKeypoint[] = [];
  // 0: 腕部
  points.push({ x: wristX, y: wristY, z: 0 });

  // 手指基础参数：每根手指 4 个关节，向斜上方延伸
  const fingerSpread = 0.03; // 手指间距
  const fingerLength = 0.08; // 每节手指长度
  const dir = side === 'left' ? 1 : -1;

  // 5 根手指，每根 4 个关键点
  for (let f = 0; f < 5; f++) {
    const isExtended = extended[f] ?? true;
    // 手指根部 X 坐标（从拇指到小指依次排列）
    const baseX = wristX + dir * (f - 2) * fingerSpread;
    const baseY = wristY;

    if (isExtended) {
      // 伸展：4 个关节向上延伸
      for (let j = 1; j <= 4; j++) {
        points.push({
          x: baseX + dir * j * 0.005,
          y: baseY - j * fingerLength,
          z: 0,
        });
      }
    } else {
      // 弯曲：关节向掌心收拢
      for (let j = 1; j <= 4; j++) {
        points.push({
          x: baseX,
          y: baseY - j * fingerLength * 0.3,
          z: j * 0.02,
        });
      }
    }
  }
  return points;
}

/** 线性插值 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
