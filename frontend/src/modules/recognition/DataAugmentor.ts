// 高级数据增强器：提供超出基础增强的进阶策略
// 包括：左右镜像、帧丢失、关键点遮挡、Mixup 混合、高斯噪声、时序抖动
// 用于 LSTM 训练数据扩充，提升模型泛化能力

import type { SignGloss } from '@/types/sign';

/** 每帧维度（双手 126） */
const DIMS_PER_FRAME = 126;
/** 每只手关键点数 */
const KEYPOINTS_PER_HAND = 21;
/** 单手维度 */
const HAND_DIMS = KEYPOINTS_PER_HAND * 3;

/** 增强配置 */
export interface AugmentorConfig {
  /** 镜像概率 (0-1) */
  mirrorProb: number;
  /** 帧丢失概率 (0-1) */
  frameDropProb: number;
  /** 关键点遮挡概率 (0-1) */
  occlusionProb: number;
  /** Mixup 概率 (0-1) */
  mixupProb: number;
  /** 高斯噪声标准差 */
  gaussianNoiseStd: number;
  /** 时序抖动幅度（帧） */
  temporalJitterFrames: number;
  /** 是否启用 */
  enabled: boolean;
}

/** 默认增强配置 */
const DEFAULT_CONFIG: AugmentorConfig = {
  mirrorProb: 0.3,
  frameDropProb: 0.1,
  occlusionProb: 0.05,
  mixupProb: 0.15,
  gaussianNoiseStd: 0.008,
  temporalJitterFrames: 2,
  enabled: true,
};

/**
 * 高级数据增强器
 * 在 TrainingDataGenerator 的基础增强之上，提供更多样的增强策略
 * 每次调用随机选择增强组合，最大化样本多样性
 */
export class DataAugmentor {
  private config: AugmentorConfig;

  constructor(config: Partial<AugmentorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 更新配置 */
  setConfig(config: Partial<AugmentorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 获取当前配置 */
  getConfig(): AugmentorConfig {
    return { ...this.config };
  }

  /**
   * 对关键点序列施加随机增强组合
   * @param frames [帧数, 126] 的关键点序列
   * @param gloss 词汇定义（用于判断主导手等信息）
   * @param mixupPartner 可选的 Mixup 搭配序列
   * @returns 增强后的 [帧数, 126] 序列
   */
  augment(
    frames: number[][],
    gloss?: SignGloss,
    mixupPartner?: number[][],
  ): number[][] {
    if (!this.config.enabled || frames.length === 0) {
      return frames.map((f) => [...f]);
    }

    let result = frames.map((f) => [...f]);

    // 1. 时序抖动：随机偏移帧的时间位置
    if (Math.random() < 0.5) {
      result = this.temporalJitter(result);
    }

    // 2. 左右镜像：交换左右手关键点
    if (Math.random() < this.config.mirrorProb) {
      result = this.mirrorHands(result, gloss);
    }

    // 3. 帧丢失：随机将某些帧置零（模拟检测失败）
    if (Math.random() < this.config.frameDropProb) {
      result = this.frameDropout(result);
    }

    // 4. 关键点遮挡：随机遮挡部分关键点
    if (Math.random() < this.config.occlusionProb) {
      result = this.keypointOcclusion(result);
    }

    // 5. 高斯噪声：叠加高斯分布的随机噪声
    if (this.config.gaussianNoiseStd > 0) {
      result = this.addGaussianNoise(result, this.config.gaussianNoiseStd);
    }

    // 6. Mixup：与另一个样本混合
    if (mixupPartner && Math.random() < this.config.mixupProb) {
      result = this.mixup(result, mixupPartner);
    }

    return result;
  }

  /**
   * 左右镜像：交换左右手关键点
   * 前 63 维（左手）与后 63 维（右手）互换，并翻转 x 坐标
   */
  mirrorHands(frames: number[][], _gloss?: SignGloss): number[][] {
    return frames.map((frame) => {
      const left = frame.slice(0, HAND_DIMS);
      const right = frame.slice(HAND_DIMS);
      // 翻转 x 坐标（每 3 个值的第一个）
      const flipX = (hand: number[]): number[] => {
        const result: number[] = [];
        for (let i = 0; i < hand.length; i += 3) {
          result.push(1 - hand[i], hand[i + 1], hand[i + 2]);
        }
        return result;
      };
      // 交换左右手并翻转 x
      return [...flipX(right), ...flipX(left)];
    });
  }

  /**
   * 帧丢失：随机将某些帧的所有关键点置零
   * 模拟摄像头短暂丢失手部检测的场景
   */
  frameDropout(frames: number[][]): number[][] {
    if (frames.length <= 2) return frames;
    const result = frames.map((f) => [...f]);
    const dropCount = Math.max(1, Math.floor(frames.length * 0.1));
    const dropIndices = new Set<number>();
    while (dropIndices.size < dropCount && dropIndices.size < frames.length - 2) {
      const idx = 1 + Math.floor(Math.random() * (frames.length - 2));
      dropIndices.add(idx);
    }
    for (const idx of dropIndices) {
      result[idx] = new Array(DIMS_PER_FRAME).fill(0);
    }
    return result;
  }

  /**
   * 关键点遮挡：随机选择一组关键点置零
   * 模拟手指被遮挡的场景
   */
  keypointOcclusion(frames: number[][]): number[][] {
    const result = frames.map((f) => [...f]);
    // 随机选择 1-3 个关键点索引（0-20）进行遮挡
    const occludeCount = 1 + Math.floor(Math.random() * 3);
    const occludedIndices = new Set<number>();
    while (occludedIndices.size < occludeCount) {
      occludedIndices.add(Math.floor(Math.random() * KEYPOINTS_PER_HAND));
    }
    // 选择遮挡左手或右手
    const handOffset = Math.random() < 0.5 ? 0 : HAND_DIMS;
    for (const frame of result) {
      for (const kpIdx of occludedIndices) {
        const base = handOffset + kpIdx * 3;
        frame[base] = 0;
        frame[base + 1] = 0;
        frame[base + 2] = 0;
      }
    }
    return result;
  }

  /**
   * Mixup 增强：将两个样本按随机比例混合
   * x_new = λ * x_a + (1 - λ) * x_b
   * 增强模型对中间状态的泛化能力
   */
  mixup(framesA: number[][], framesB: number[][]): number[][] {
    const lambda = 0.7 + Math.random() * 0.2; // 0.7-0.9
    const minLen = Math.min(framesA.length, framesB.length);
    const result: number[][] = [];
    for (let t = 0; t < minLen; t++) {
      const frame: number[] = [];
      for (let d = 0; d < DIMS_PER_FRAME; d++) {
        const va = framesA[t][d] ?? 0;
        const vb = framesB[t][d] ?? 0;
        frame.push(lambda * va + (1 - lambda) * vb);
      }
      result.push(frame);
    }
    return result;
  }

  /**
   * 高斯噪声：对每个坐标叠加高斯分布噪声
   * 比均匀噪声更接近真实传感器噪声
   */
  addGaussianNoise(frames: number[][], std: number): number[][] {
    return frames.map((frame) =>
      frame.map((v, i) => {
        // z 坐标（每 3 个的第 3 个）噪声减半
        const noiseScale = (i % 3 === 2) ? std * 0.5 : std;
        return v + this.gaussianRandom(0, noiseScale);
      }),
    );
  }

  /**
   * 时序抖动：在帧级别引入随机时间偏移
   * 模拟动作执行速度不均匀
   */
  temporalJitter(frames: number[][]): number[][] {
    const jitter = this.config.temporalJitterFrames;
    if (jitter <= 0 || frames.length <= 2) return frames;
    const result: number[][] = [];
    const len = frames.length;
    for (let t = 0; t < len; t++) {
      // 随机偏移源帧索引（限制在有效范围内）
      const offset = Math.floor((Math.random() - 0.5) * jitter * 2);
      const srcIdx = Math.max(0, Math.min(len - 1, t + offset));
      result.push([...frames[srcIdx]]);
    }
    return result;
  }

  /** Box-Muller 变换生成高斯随机数 */
  private gaussianRandom(mean: number, std: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }
}
