// 关键点提取器：从实时关键点流中提取有效动作序列
// 通过运动起止检测，截取包含实际手语动作的窗口

import type { FrameKeypoints, HandKeypoint, KeypointSequence } from '@/types/recognition';

/** KeypointExtractor 配置项 */
export interface KeypointExtractorConfig {
  /** 窗口大小 W（帧数），默认 30 */
  windowSize?: number;
  /** 滑动步长 S（帧数），默认 5 */
  slideStep?: number;
  /** 运动检测阈值（归一化坐标方差），默认 0.01 */
  motionThreshold?: number;
  /** 静止持续帧数阈值，默认 10 */
  staticFrameLimit?: number;
  /** 计算方差使用的最近帧数 N，默认 5 */
  varianceWindow?: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: Required<KeypointExtractorConfig> = {
  windowSize: 30,
  slideStep: 5,
  motionThreshold: 0.01,
  staticFrameLimit: 10,
  varianceWindow: 5,
};

/**
 * 关键点提取器
 * 维护一个帧缓冲区，基于关键点方差检测运动起止，
 * 当检测到完整的运动起止后，提取窗口内的关键点序列。
 */
export class KeypointExtractor {
  private readonly config: Required<KeypointExtractorConfig>;
  /** 帧缓冲区 */
  private buffer: FrameKeypoints[] = [];
  /** 上一次用于位移计算的帧（展平后的坐标） */
  private prevFrameCoords: number[] | null = null;
  /** 最近若干帧的位移值，用于计算方差 */
  private recentDisplacements: number[] = [];
  /** 运动是否已开始 */
  private motionStarted = false;
  /** 连续静止帧计数 */
  private staticFrameCount = 0;
  /** 运动是否已结束（一次完整动作完成后置位） */
  private motionEnded = false;
  /** 已提取的帧数计数，用于滑动步长控制 */
  private extractedCount = 0;

  constructor(config: KeypointExtractorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 输入一帧关键点
   * 计算与上一帧的位移，更新方差窗口，并执行运动起止检测
   */
  feed(frame: FrameKeypoints): void {
    this.buffer.push(frame);
    const currentCoords = this.flattenFrame(frame);

    // 计算与上一帧的位移（所有关键点坐标差的平方和的均值）
    if (this.prevFrameCoords !== null && currentCoords.length === this.prevFrameCoords.length) {
      const displacement = this.computeDisplacement(this.prevFrameCoords, currentCoords);
      this.recentDisplacements.push(displacement);

      // 仅保留最近 N 帧的位移值
      const N = this.config.varianceWindow;
      if (this.recentDisplacements.length > N) {
        this.recentDisplacements.shift();
      }
    }

    this.prevFrameCoords = currentCoords;
    this.updateMotionState();
  }

  /** 运动是否开始 */
  isMotionStarted(): boolean {
    return this.motionStarted;
  }

  /** 运动是否结束（一次完整动作完成） */
  isMotionEnded(): boolean {
    return this.motionEnded;
  }

  /**
   * 提取当前窗口的关键点序列
   * - 运动未开始或缓冲区不足时返回 null
   * - 返回最近 W 帧的关键点序列
   * - 提取后按滑动步长 S 移除旧帧
   */
  extract(): KeypointSequence | null {
    const W = this.config.windowSize;
    if (this.buffer.length < W) {
      return null;
    }

    // 取最近 W 帧
    const frames = this.buffer.slice(this.buffer.length - W);
    const fps = this.computeFps(frames);

    // 按滑动步长移除旧帧，避免缓冲区无限增长
    const S = this.config.slideStep;
    this.extractedCount += S;
    if (this.buffer.length > W) {
      this.buffer.splice(0, S);
    }

    return { frames, fps };
  }

  /** 重置状态，清空缓冲区 */
  reset(): void {
    this.buffer = [];
    this.prevFrameCoords = null;
    this.recentDisplacements = [];
    this.motionStarted = false;
    this.staticFrameCount = 0;
    this.motionEnded = false;
    this.extractedCount = 0;
  }

  /**
   * 根据最近帧的位移方差更新运动状态
   * - 方差 > 阈值 → 运动开始
   * - 方差 < 阈值持续 staticFrameLimit 帧 → 运动结束
   */
  private updateMotionState(): void {
    if (this.recentDisplacements.length < 2) return;

    const variance = this.computeVariance(this.recentDisplacements);
    const threshold = this.config.motionThreshold;

    if (!this.motionStarted) {
      // 未开始运动：检测是否开始
      if (variance > threshold) {
        this.motionStarted = true;
        this.motionEnded = false;
        this.staticFrameCount = 0;
      }
    } else {
      // 已开始运动：检测是否结束
      if (variance < threshold) {
        this.staticFrameCount++;
        if (this.staticFrameCount >= this.config.staticFrameLimit) {
          this.motionEnded = true;
        }
      } else {
        // 仍有运动，重置静止计数
        this.staticFrameCount = 0;
      }
    }
  }

  /**
   * 将一帧关键点展平为一维坐标数组
   * 双手各 21 点 × 3 坐标 = 126 维；单手时另一手补 0
   */
  private flattenFrame(frame: FrameKeypoints): number[] {
    const left = this.flattenHand(frame.left_hand);
    const right = this.flattenHand(frame.right_hand);
    return [...left, ...right];
  }

  /** 将单手关键点展平为 63 维数组，null 时补 0 */
  private flattenHand(hand: HandKeypoint[] | null): number[] {
    if (!hand) return new Array(63).fill(0);
    const coords: number[] = [];
    for (const kp of hand) {
      coords.push(kp.x, kp.y, kp.z);
    }
    return coords;
  }

  /** 计算两帧之间的位移（坐标差平方和的均值） */
  private computeDisplacement(prev: number[], curr: number[]): number {
    let sumSq = 0;
    for (let i = 0; i < prev.length; i++) {
      const diff = curr[i] - prev[i];
      sumSq += diff * diff;
    }
    return sumSq / prev.length;
  }

  /** 计算数组的方差 */
  private computeVariance(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const sqDiffSum = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
    return sqDiffSum / n;
  }

  /** 根据帧时间戳计算 FPS */
  private computeFps(frames: FrameKeypoints[]): number {
    if (frames.length < 2) return 30;
    const duration = frames[frames.length - 1].timestamp - frames[0].timestamp;
    if (duration <= 0) return 30;
    return (frames.length - 1) / (duration / 1000);
  }
}
