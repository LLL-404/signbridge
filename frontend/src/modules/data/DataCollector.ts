// 手语数据收集器：采集真实手语关键点数据用于模型训练
// 支持录制、标注、质量校验、本地存储、导出训练数据集

import type { FrameKeypoints, KeypointSequence } from '@/types/recognition';
import { Normalizer } from '@/modules/recognition/Normalizer';
import { idbAdapter } from './IndexedDBAdapter';

/** 单个标注样本 */
export interface CollectedSample {
  /** 样本唯一 ID */
  id: string;
  /** 标注的 gloss_id */
  gloss_id: string;
  /** 中文标注 */
  chinese: string;
  /** 原始关键点序列（归一化前） */
  rawFrames: FrameKeypoints[];
  /** 归一化后的 [T, 126] 数据 */
  normalizedData: number[];
  /** 采样帧率 */
  fps: number;
  /** 采集时间戳 */
  collectedAt: number;
  /** 采集者 ID（可选） */
  collector?: string;
  /** 质量评分 (0-1) */
  quality: number;
  /** 左右手标记 */
  dominantHand: 'left' | 'right';
}

/** 数据收集器配置 */
export interface DataCollectorConfig {
  /** 目标帧数 T（用于归一化），默认 30 */
  targetFrames: number;
  /** 最小帧数阈值，低于此值视为无效 */
  minFrames: number;
  /** 最大帧数阈值 */
  maxFrames: number;
  /** 静止检测阈值（手腕位移方差） */
  stillnessThreshold: number;
  /** 是否自动检测起止 */
  autoDetectMotion: boolean;
  /** 前置静止帧数（录制前留白） */
  preRollFrames: number;
  /** 后置静止帧数（录制后留白） */
  postRollFrames: number;
}

const DEFAULT_CONFIG: Required<DataCollectorConfig> = {
  targetFrames: 30,
  minFrames: 15,
  maxFrames: 90,
  stillnessThreshold: 0.001,
  autoDetectMotion: true,
  preRollFrames: 5,
  postRollFrames: 8,
};

/** 录制状态 */
export type RecordingState =
  | 'idle'        // 空闲
  | 'waiting'     // 等待运动开始（自动模式）
  | 'recording'   // 录制中
  | 'stopping'    // 等待运动结束
  | 'reviewing';  // 等待标注

/** 录制统计 */
export interface RecordingStats {
  recordedFrames: number;
  elapsedMs: number;
  motionDetected: boolean;
  qualityScore: number;
}

/**
 * 手语数据收集器
 * 支持两种录制模式：
 *   - 手动模式：调用 startRecording/stopRecording 手动控制
 *   - 自动模式：基于运动检测自动起止
 */
export class DataCollector {
  private config: Required<DataCollectorConfig>;
  private normalizer: Normalizer;
  private state: RecordingState = 'idle';
  private buffer: FrameKeypoints[] = [];
  private recordingStart = 0;
  private motionFrameCount = 0;
  private stillFrameCount = 0;
  private lastWristPos: { x: number; y: number; z: number } | null = null;
  private pendingSample: FrameKeypoints[] | null = null;

  constructor(config: Partial<DataCollectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.normalizer = new Normalizer();
  }

  /** 获取当前状态 */
  getState(): RecordingState {
    return this.state;
  }

  /** 更新配置 */
  setConfig(config: Partial<DataCollectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 手动开始录制
   * 在自动模式下也可调用，跳过等待阶段直接开始
   */
  startRecording(): void {
    this.buffer = [];
    this.motionFrameCount = 0;
    this.stillFrameCount = 0;
    this.lastWristPos = null;
    this.recordingStart = performance.now();
    this.state = 'recording';
  }

  /**
   * 手动停止录制
   * @returns 录制的帧序列，不足 minFrames 时返回 null
   */
  stopRecording(): FrameKeypoints[] | null {
    if (this.state !== 'recording' && this.state !== 'stopping') {
      return null;
    }
    const frames = this.trimBuffer(this.buffer);
    if (frames.length < this.config.minFrames) {
      this.reset();
      return null;
    }
    this.pendingSample = frames;
    this.state = 'reviewing';
    return frames;
  }

  /**
   * 输入一帧关键点（用于自动模式）
   * 根据运动检测自动管理录制状态
   */
  feedFrame(frame: FrameKeypoints): RecordingStats | null {
    if (this.state === 'idle' && this.config.autoDetectMotion) {
      // 空闲状态，检测运动是否开始
      if (this.detectMotion(frame)) {
        this.startRecording();
        // 补上 preRoll 帧
        this.buffer = this.buffer.slice(-this.config.preRollFrames);
      }
      // 持续积累帧（用于 preRoll）
      this.buffer.push(this.cloneFrame(frame));
      if (this.buffer.length > this.config.preRollFrames * 3) {
        this.buffer.shift();
      }
      return this.getStats();
    }

    if (this.state === 'recording') {
      this.buffer.push(this.cloneFrame(frame));

      const isStill = !this.detectMotion(frame);
      if (isStill) {
        this.stillFrameCount++;
        if (this.stillFrameCount >= this.config.postRollFrames) {
          this.state = 'stopping';
        }
      } else {
        this.stillFrameCount = 0;
        this.motionFrameCount++;
      }

      // 超过最大帧数自动停止
      if (this.buffer.length >= this.config.maxFrames) {
        this.stopRecording();
      }

      return this.getStats();
    }

    if (this.state === 'stopping') {
      this.stopRecording();
      return this.getStats();
    }

    return null;
  }

  /**
   * 保存标注后的样本
   * @param gloss_id 词汇 ID
   * @param chinese 中文词
   * @param dominantHand 主导手
   * @param collector 采集者 ID（可选）
   * @returns 保存的样本
   */
  async saveSample(
    gloss_id: string,
    chinese: string,
    dominantHand: 'left' | 'right' = 'right',
    collector?: string,
  ): Promise<CollectedSample> {
    if (!this.pendingSample) {
      throw new Error('没有待保存的样本，请先录制');
    }

    const frames = this.pendingSample;
    const fps = frames.length > 1
      ? (frames.length - 1) / ((frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000)
      : 30;

    // 归一化
    const sequence: KeypointSequence = { frames, fps };
    const normalized = this.normalizer.normalize(sequence);

    // 质量评估
    const quality = this.assessQuality(frames);

    const sample: CollectedSample = {
      id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      gloss_id,
      chinese,
      rawFrames: frames,
      normalizedData: normalized.data,
      fps,
      collectedAt: Date.now(),
      collector,
      quality,
      dominantHand,
    };

    // 保存到 IndexedDB
    await idbAdapter.put('collected_samples', sample);

    this.reset();
    return sample;
  }

  /** 丢弃当前待标注样本 */
  discardSample(): void {
    this.reset();
  }

  /** 获取待标注的帧序列 */
  getPendingFrames(): FrameKeypoints[] | null {
    return this.pendingSample;
  }

  /**
   * 获取录制统计信息
   */
  getStats(): RecordingStats {
    const elapsedMs = this.state !== 'idle' ? performance.now() - this.recordingStart : 0;
    return {
      recordedFrames: this.buffer.length,
      elapsedMs,
      motionDetected: this.motionFrameCount > 0,
      qualityScore: this.assessQuality(this.buffer),
    };
  }

  /** 重置状态 */
  reset(): void {
    this.state = 'idle';
    this.buffer = [];
    this.pendingSample = null;
    this.motionFrameCount = 0;
    this.stillFrameCount = 0;
    this.lastWristPos = null;
  }

  /**
   * 导出指定 gloss_id 的训练数据
   * @returns [样本数, 特征维度] 的训练数据和标签
   */
  async exportDataset(glossIds?: string[]): Promise<{
    samples: CollectedSample[];
    features: number[][];
    labels: string[];
    labelMap: Record<string, number>;
  }> {
    const all = await idbAdapter.getAll<CollectedSample>('collected_samples');
    const filtered = glossIds
      ? all.filter((s) => glossIds.includes(s.gloss_id))
      : all;

    // 构建标签映射
    const uniqueLabels = [...new Set(filtered.map((s) => s.gloss_id))].sort();
    const labelMap: Record<string, number> = {};
    uniqueLabels.forEach((id, i) => { labelMap[id] = i; });

    const features = filtered.map((s) => s.normalizedData);
    const labels = filtered.map((s) => s.gloss_id);

    return { samples: filtered, features, labels, labelMap };
  }

  /**
   * 获取已采集样本统计
   */
  async getDatasetStats(): Promise<{
    totalSamples: number;
    byGloss: Record<string, number>;
    totalGlosses: number;
    avgQuality: number;
  }> {
    const all = await idbAdapter.getAll<CollectedSample>('collected_samples');
    const byGloss: Record<string, number> = {};
    let qualitySum = 0;
    for (const s of all) {
      byGloss[s.gloss_id] = (byGloss[s.gloss_id] || 0) + 1;
      qualitySum += s.quality;
    }
    return {
      totalSamples: all.length,
      byGloss,
      totalGlosses: Object.keys(byGloss).length,
      avgQuality: all.length > 0 ? qualitySum / all.length : 0,
    };
  }

  /** 删除指定样本 */
  async deleteSample(id: string): Promise<void> {
    await idbAdapter.delete('collected_samples', id);
  }

  /** 清空所有采集数据 */
  async clearAll(): Promise<void> {
    await idbAdapter.clear('collected_samples');
  }

  /** 检测是否有运动（基于手腕位移） */
  private detectMotion(frame: FrameKeypoints): boolean {
    const wrist = frame.right_hand?.[0] ?? frame.left_hand?.[0];
    if (!wrist) {
      this.lastWristPos = null;
      return false;
    }

    if (!this.lastWristPos) {
      this.lastWristPos = { x: wrist.x, y: wrist.y, z: wrist.z };
      return false;
    }

    const dx = wrist.x - this.lastWristPos.x;
    const dy = wrist.y - this.lastWristPos.y;
    const displacement = dx * dx + dy * dy;
    this.lastWristPos = { x: wrist.x, y: wrist.y, z: wrist.z };

    return displacement > this.config.stillnessThreshold;
  }

  /** 裁剪缓冲区：去除开头和结尾的静止帧 */
  private trimBuffer(frames: FrameKeypoints[]): FrameKeypoints[] {
    if (frames.length < this.config.minFrames) return frames;
    // 简单裁剪：保留所有帧，让 Normalizer 处理
    return frames.map((f) => this.cloneFrame(f));
  }

  /** 评估样本质量 (0-1) */
  private assessQuality(frames: FrameKeypoints[]): number {
    if (frames.length < this.config.minFrames) return 0;

    let score = 1;
    // 1. 帧数合理性：过少或过多扣分
    const optimalFrames = this.config.targetFrames;
    const frameRatio = frames.length / optimalFrames;
    if (frameRatio < 0.5 || frameRatio > 2.5) score -= 0.3;
    else if (frameRatio < 0.7 || frameRatio > 1.8) score -= 0.1;

    // 2. 关键点完整性：有手的帧比例
    let handPresentFrames = 0;
    for (const f of frames) {
      if (f.left_hand || f.right_hand) handPresentFrames++;
    }
    const handRatio = handPresentFrames / frames.length;
    if (handRatio < 0.8) score -= 0.3;
    else if (handRatio < 0.95) score -= 0.1;

    // 3. 运动幅度：有实际运动
    let totalMotion = 0;
    for (let i = 1; i < frames.length; i++) {
      const prev = frames[i - 1].right_hand?.[0] ?? frames[i - 1].left_hand?.[0];
      const curr = frames[i].right_hand?.[0] ?? frames[i].left_hand?.[0];
      if (prev && curr) {
        totalMotion += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      }
    }
    const avgMotion = totalMotion / frames.length;
    if (avgMotion < 0.001) score -= 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /** 深拷贝一帧 */
  private cloneFrame(frame: FrameKeypoints): FrameKeypoints {
    return {
      left_hand: frame.left_hand ? frame.left_hand.map((kp) => ({ ...kp })) : null,
      right_hand: frame.right_hand ? frame.right_hand.map((kp) => ({ ...kp })) : null,
      timestamp: frame.timestamp,
    };
  }
}

/** 全局单例 */
export const dataCollector = new DataCollector();
