/**
 * 手部关键点追踪器
 * 封装 MediaPipe Hands，从视频流提取 21 关键点（每只手）
 * 输出 FrameKeypoints 供识别器、评分器、3D 骨骼驱动使用
 *
 * 注意：本类只负责关键点提取，不做手势分类（分类见 RuleRecognizer / WorkerRecognizer）
 */

import { Hands, type Results, type NormalizedLandmark } from '@mediapipe/hands';
import type { FrameKeypoints, HandKeypoint } from '@/types/recognition';
import { appConfig } from '@/config';

/** HandTracker 配置项 */
export interface HandTrackerConfig {
  /** 最大检测手数，默认 2 */
  maxNumHands?: number;
  /** 模型复杂度（0=轻量，1=完整），默认 1 */
  modelComplexity?: 0 | 1;
  /** 最小检测置信度，默认 0.5 */
  minDetectionConfidence?: number;
  /** 最小追踪置信度，默认 0.5 */
  minTrackingConfidence?: number;
}

/** HandTracker 默认配置 */
const DEFAULT_CONFIG: Required<HandTrackerConfig> = {
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

/**
 * 手部追踪器：封装 MediaPipe Hands，提供 21 关键点检测能力。
 * - 通过 onResults 回调接收检测结果
 * - 将归一化坐标转换为 HandKeypoint
 * - 区分左右手（基于 handedness，考虑 selfieMode 镜像）
 */
export class HandTracker {
  private readonly config: Required<HandTrackerConfig>;
  private hands: Hands | null = null;
  /** 最近一帧的处理结果，供 process() 同步返回 */
  private latestResult: FrameKeypoints | null = null;
  /** 标记是否已初始化，避免重复 initialize */
  private isInitialized = false;

  constructor(config: HandTrackerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化 MediaPipe Hands 实例。
   * - 通过 CDN 加载 wasm 文件
   * - 注册 onResults 回调以接收检测结果
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    const hands = new Hands({
      locateFile: (file) =>
        `${appConfig.mediapipeHandsCdnBase}/${file}`,
    });

    hands.setOptions({
      maxNumHands: this.config.maxNumHands,
      modelComplexity: this.config.modelComplexity,
      minDetectionConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
    });

    // 注册结果回调：将 MediaPipe Results 转换为 FrameKeypoints
    hands.onResults((results: Results) => {
      this.latestResult = this.convertResults(results);
    });

    await hands.initialize();

    this.hands = hands;
    this.isInitialized = true;
  }

  /**
   * 处理一帧视频，返回该帧的关键点。
   * - 调用 send 后等待 onResults 回调更新 latestResult
   * - 由于 MediaPipe 的 send 与 onResults 是异步衔接的，这里采用「上一帧结果」策略
   *
   * @param video 视频元素
   * @returns 当前帧关键点，未检测到手时 left_hand/right_hand 为 null
   */
  async process(video: HTMLVideoElement): Promise<FrameKeypoints | null> {
    if (!this.hands) {
      throw new Error('HandTracker 未初始化，请先调用 init()');
    }

    // 视频未准备好时直接返回 null
    if (video.readyState < 2) {
      return null;
    }

    // 重置上一帧结果，等待 onResults 写入新值
    const previous = this.latestResult;
    this.latestResult = null;

    await this.hands.send({ image: video });

    // 若 send 后仍未拿到结果（极少发生），退回上一帧以保证连续性
    return this.latestResult ?? previous;
  }

  /** 释放 MediaPipe Hands 资源 */
  dispose(): void {
    if (this.hands) {
      // close 返回 Promise，这里不等待，避免阻塞 UI
      this.hands.close().catch(() => {
        /* 忽略关闭时的错误 */
      });
      this.hands = null;
    }
    this.isInitialized = false;
    this.latestResult = null;
  }

  /**
   * 将 MediaPipe Results 转换为 FrameKeypoints。
   * - multiHandedness.label 在 selfieMode 下表示「画面中的左右」
   *   默认 selfieMode=false 时，label='Right' 表示用户的右手
   *   为符合直觉（用户视角），这里对 label 做一次翻转
   *
   * @param results MediaPipe 原始结果
   * @returns 转换后的 FrameKeypoints
   */
  private convertResults(results: Results): FrameKeypoints {
    let left_hand: HandKeypoint[] | null = null;
    let right_hand: HandKeypoint[] | null = null;

    const landmarksList = results.multiHandLandmarks ?? [];
    const handednessList = results.multiHandedness ?? [];

    for (let i = 0; i < landmarksList.length; i++) {
      const landmarks = landmarksList[i];
      const handedness = handednessList[i];
      if (!landmarks || !handedness) continue;

      const keypoints = this.normalizeLandmarks(landmarks);

      // MediaPipe 默认将图像视为非镜像输入，label='Left' 表示图像中的左手
      // 由于摄像头预览通常采用镜像显示（用户视角），这里翻转左右以匹配用户直觉
      const userHand = handedness.label === 'Left' ? 'right' : 'left';

      if (userHand === 'left') {
        left_hand = keypoints;
      } else {
        right_hand = keypoints;
      }
    }

    return {
      left_hand,
      right_hand,
      timestamp: performance.now(),
    };
  }

  /**
   * 将 MediaPipe 归一化关键点转换为 HandKeypoint[]。
   * - MediaPipe 坐标已归一化到 [0,1]，直接保留即可
   * - z 表示相对深度（手腕为原点），负值朝向相机
   */
  private normalizeLandmarks(landmarks: NormalizedLandmark[]): HandKeypoint[] {
    return landmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
    }));
  }
}
