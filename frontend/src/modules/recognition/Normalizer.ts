// 序列归一化器：将关键点序列归一化为模型可用的标准输入
// 步骤：平移归一化 → 缩放归一化 → 时间归一化（重采样） → 展平

import type {
  FrameKeypoints,
  HandKeypoint,
  KeypointSequence,
  NormalizedSequence,
} from '@/types/recognition';

/** 每只手的关键点数 */
const KEYPOINTS_PER_HAND = 21;
/** 坐标维度 */
const COORDS_PER_KEYPOINT = 3;
/** 每只手的特征维度（21 × 3 = 63） */
const DIMS_PER_HAND = KEYPOINTS_PER_HAND * COORDS_PER_KEYPOINT;
/** 每帧总维度（双手 126） */
const DIMS_PER_FRAME = 2 * DIMS_PER_HAND;
/** 腕部关键点索引 */
const WRIST_INDEX = 0;
/** 中指掌指关节索引（用于计算手掌大小） */
const PALM_REF_INDEX = 9;
/** 目标时间长度 T */
const TARGET_LENGTH = 30;

/**
 * 序列归一化器
 * 将变长的关键点序列转换为固定长度 [T, 126] 的归一化表示
 */
export class Normalizer {
  /**
   * 对关键点序列执行完整归一化流程
   * @param sequence 原始关键点序列
   * @returns 归一化后的序列（data 为展平的 [T*126] 数组）
   */
  normalize(sequence: KeypointSequence): NormalizedSequence {
    // 1. 逐帧进行空间归一化（平移 + 缩放）
    const spatialNormalized = sequence.frames.map((frame) =>
      this.normalizeFrameSpatial(frame),
    );

    // 2. 时间归一化：重采样到固定长度 T
    const resampled = this.resample(spatialNormalized, TARGET_LENGTH);

    // 3. 展平为 [T*126] 一维数组
    const data: number[] = [];
    for (const frame of resampled) {
      data.push(...frame);
    }

    return { data, length: TARGET_LENGTH };
  }

  /**
   * 单帧空间归一化
   * - 平移：以腕部（点0）为原点
   * - 缩放：以手掌大小（点0到点9的距离）为参考
   * - 单手时另一手补 0
   */
  private normalizeFrameSpatial(frame: FrameKeypoints): number[] {
    const left = this.normalizeHand(frame.left_hand);
    const right = this.normalizeHand(frame.right_hand);
    return [...left, ...right];
  }

  /**
   * 单手空间归一化
   * @returns 63 维数组；hand 为 null 时返回全 0
   */
  private normalizeHand(hand: HandKeypoint[] | null): number[] {
    if (!hand || hand.length < KEYPOINTS_PER_HAND) {
      return new Array(DIMS_PER_HAND).fill(0);
    }

    const wrist = hand[WRIST_INDEX];
    const palmRef = hand[PALM_REF_INDEX];

    // 计算手掌大小（腕部到中指掌指关节的距离）
    const palmSize = this.distance(wrist, palmRef);
    // 避免除零：手掌过小时使用一个极小下限
    const scale = palmSize > 1e-6 ? palmSize : 1e-6;

    // 平移归一化（减去腕部）+ 缩放归一化（除以手掌大小）
    const result: number[] = [];
    for (const kp of hand) {
      result.push((kp.x - wrist.x) / scale, (kp.y - wrist.y) / scale, (kp.z - wrist.z) / scale);
    }
    return result;
  }

  /** 计算两个关键点间的欧氏距离 */
  private distance(a: HandKeypoint, b: HandKeypoint): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * 时间归一化：将变长序列重采样到固定长度 T（线性插值）
   * @param frames 每帧为 126 维数组
   * @param targetLength 目标长度 T
   */
  private resample(frames: number[][], targetLength: number): number[][] {
    const srcLen = frames.length;
    if (srcLen === 0) {
      return Array.from({ length: targetLength }, () => new Array(DIMS_PER_FRAME).fill(0));
    }
    // 源长度等于目标长度，直接返回副本
    if (srcLen === targetLength) {
      return frames.map((f) => [...f]);
    }
    // 源长度为 1，复制到目标长度
    if (srcLen === 1) {
      return Array.from({ length: targetLength }, () => [...frames[0]]);
    }

    const result: number[][] = [];
    for (let i = 0; i < targetLength; i++) {
      // 将目标索引映射到源序列的浮点位置
      const srcPos = (i / (targetLength - 1)) * (srcLen - 1);
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;
      const nextIdx = Math.min(srcIdx + 1, srcLen - 1);

      // 线性插值
      const frame: number[] = [];
      const curr = frames[srcIdx];
      const next = frames[nextIdx];
      for (let d = 0; d < DIMS_PER_FRAME; d++) {
        frame.push(curr[d] + (next[d] - curr[d]) * frac);
      }
      result.push(frame);
    }
    return result;
  }
}
