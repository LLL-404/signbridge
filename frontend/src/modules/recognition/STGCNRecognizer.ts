/**
 * ST-GCN 手势识别器 —— 基于手部骨骼关键点的时空图卷积网络
 *
 * 架构（详见 stgcn_model.ts）：
 *   输入 (batch, 30, 21, 2) → 空间图卷积 ×2 → 时间卷积 → 全局池化 → 全连接
 *
 * 模型加载优先级：
 *   1. /models/stgcn/model.json   —— 训练脚本生成的预训练模型（首选）
 *   2. indexeddb://stgcn-gesture-model —— 浏览器端在线训练后缓存的模型
 *   3. buildSTGCNModel()           —— 未训练模型（兜底，准确率低）
 *
 * 标签映射加载：
 *   优先从 /models/stgcn/labelMap.json 读取，失败则回退到 stgcn_data.ts 的 GESTURE_LABELS
 */

import * as tf from '@tensorflow/tfjs';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { appConfig } from '@/config';
import type { ClassificationResult } from '@/types/recognition';
import type { Recognizer, FrameInput } from './Recognizer';
import {
  GESTURE_LABELS,
  GESTURE_CHINESE,
  NUM_KEYPOINTS,
  NUM_FRAMES,
  COORD_DIM,
} from './stgcn_data';
import {
  buildSTGCNModel,
  registerGraphConvLayer,
  STGCN_MODEL_PATH,
  STGCN_MODEL_HTTP_URL,
  STGCN_LABEL_MAP_URL,
} from './stgcn_model';
import { logger } from '@/modules/debug/logger';

const log = logger.module('STGCNRecognizer');

// ===== 常量 =====

/** MediaPipe wasm CDN（复用 RuleRecognizer 配置） */
const WASM_URL = appConfig.mediapipeWasmBaseUrl;
/** HandLandmarker 模型 URL（从 appConfig 读取，默认自托管） */
const HAND_MODEL_URL = appConfig.handModelUrl;
/** 推理置信度阈值：低于此值视为无效识别 */
export const STGCN_CONFIDENCE_THRESHOLD = 0.8;

// 为向后兼容（stgcn_train.ts 仍从此处导入），重新导出模型路径与构建函数
export { buildSTGCNModel, STGCN_MODEL_PATH };

// ===== 关键点归一化 =====

/**
 * 归一化手部关键点（平移 + 缩放不变性）
 * 1. 以腕部（关键点 0）为原点
 * 2. 以腕部到中指 MCP（关键点 9）的距离为尺度
 *
 * @param landmarks MediaPipe 归一化关键点 [0,1]
 * @returns 21×2 归一化坐标
 */
function normalizeLandmarks(
  landmarks: ReadonlyArray<{ x: number; y: number }>,
): number[][] {
  const wrist = landmarks[0];
  const mcp = landmarks[9];
  const palmSize = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y) || 1;

  return landmarks.map((lm) => [
    (lm.x - wrist.x) / palmSize,
    (lm.y - wrist.y) / palmSize,
  ]);
}

// ===== ST-GCN 识别器 =====

/**
 * ST-GCN 手势识别器
 * 使用 MediaPipe HandLandmarker 提取手部 21 关键点，
 * 通过 ST-GCN 模型进行时空图卷积分类。
 *
 * 用法：
 *   const recognizer = new STGCNRecognizer();
 *   await recognizer.init();
 *   const result = await recognizer.recognize({ element: videoElement });
 *
 * 集成到 CompositeRecognizer（置信度 ≥ 0.8 时优先采用）：
 *   new CompositeRecognizer(
 *     [new STGCNRecognizer(), new RuleRecognizer()],
 *     [STGCN_CONFIDENCE_THRESHOLD, 0.5],
 *   );
 */
export class STGCNRecognizer implements Recognizer {
  private model: tf.LayersModel | null = null;
  private handLandmarker: HandLandmarker | null = null;
  /** 时序帧缓冲：滑动窗口保存最近 maxFrames 帧关键点 */
  private frameBuffer: number[][][] = [];
  private readonly maxFrames = NUM_FRAMES;
  private isInitialized = false;
  /** 推理频率控制：每 inferEvery 帧推理一次，避免过载 */
  private readonly inferEvery = 3;
  private frameCount = 0;
  /** 标签映射：index → gloss_id；优先使用 labelMap.json，否则回退到 GESTURE_LABELS */
  private labelMap: string[] | null = null;

  /** 初始化：加载 HandLandmarker + 加载或构建 ST-GCN 模型 */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    // 确保自定义层已注册（加载含 GraphConv 的模型时必须）
    registerGraphConvLayer();

    // 并行加载 HandLandmarker 和 ST-GCN 模型
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    const [handLandmarker] = await Promise.all([
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL },
        runningMode: 'VIDEO',
        numHands: 1,
      }),
      this.loadOrBuildModel(),
    ]);

    this.handLandmarker = handLandmarker;
    this.isInitialized = true;
  }

  /**
   * 加载已训练模型，失败则构建未训练模型
   * 优先级：HTTP 预训练模型 → IndexedDB 缓存 → 未训练兜底
   */
  private async loadOrBuildModel(): Promise<void> {
    // 1. 优先从 /models/stgcn/model.json 加载预训练模型
    if (await this.tryLoadFromHttp()) return;

    // 2. 回退到 IndexedDB（浏览器端在线训练后缓存）
    if (await this.tryLoadFromIndexedDB()) return;

    // 3. 兜底：构建未训练模型，并尝试加载标签映射
    log.warn('未找到已训练模型，使用未训练模型（准确率低）');
    this.model = buildSTGCNModel();
    await this.tryLoadLabelMap();
  }

  /** 尝试从 HTTP 加载预训练模型，成功返回 true */
  private async tryLoadFromHttp(): Promise<boolean> {
    try {
      this.model = await tf.loadLayersModel(STGCN_MODEL_HTTP_URL);
      log.info('已加载预训练 ST-GCN 模型:', STGCN_MODEL_HTTP_URL);
      // 加载对应的标签映射
      await this.tryLoadLabelMap();
      return true;
    } catch (err) {
      // 预训练模型尚未生成（首次部署或训练脚本未运行）
      log.debug('HTTP 预训练模型加载失败，将尝试 IndexedDB:', err);
      return false;
    }
  }

  /** 尝试从 IndexedDB 加载在线训练缓存，成功返回 true */
  private async tryLoadFromIndexedDB(): Promise<boolean> {
    try {
      this.model = await tf.loadLayersModel(STGCN_MODEL_PATH);
      log.info('已加载 IndexedDB 缓存的 ST-GCN 模型');
      await this.tryLoadLabelMap();
      return true;
    } catch (err) {
      log.debug('IndexedDB 模型加载失败:', err);
      return false;
    }
  }

  /**
   * 尝试加载 /models/stgcn/labelMap.json
   * 成功时设置 this.labelMap，失败时保持 null（使用 GESTURE_LABELS 兜底）
   */
  private async tryLoadLabelMap(): Promise<void> {
    try {
      const response = await fetch(STGCN_LABEL_MAP_URL);
      if (!response.ok) return;
      const data = (await response.json()) as { labels?: string[] };
      if (Array.isArray(data.labels) && data.labels.length > 0) {
        this.labelMap = data.labels;
      }
    } catch {
      // labelMap.json 不存在或解析失败，保持默认 GESTURE_LABELS
    }
  }

  /** 根据类别索引获取 gloss_id，优先用 labelMap，回退到 GESTURE_LABELS */
  private getLabelByIndex(index: number): string {
    return this.labelMap?.[index] ?? GESTURE_LABELS[index] ?? `class_${index}`;
  }

  /** 识别单帧：提取关键点 → 帧缓冲 → 模型推理 */
  async recognize(input: FrameInput): Promise<ClassificationResult | null> {
    if (!this.handLandmarker || !this.model || !this.isInitialized) {
      throw new Error('ST-GCN 识别器未初始化');
    }

    const video = input.element as HTMLVideoElement;
    if (video.readyState < 2) return null;

    // 1. 提取手部关键点
    const timestamp = input.timestamp ?? performance.now();
    const result = this.handLandmarker.detectForVideo(video, timestamp);

    if (!result.landmarks || result.landmarks.length === 0) {
      // 未检测到手：清空缓冲，避免跨手势混淆
      this.frameBuffer = [];
      return null;
    }

    const landmarks = result.landmarks[0];
    const normalized = normalizeLandmarks(landmarks);

    // 2. 添加到帧缓冲（滑动窗口）
    this.frameBuffer.push(normalized);
    if (this.frameBuffer.length > this.maxFrames) {
      this.frameBuffer.shift();
    }

    // 3. 缓冲未满，等待更多帧
    if (this.frameBuffer.length < this.maxFrames) {
      return null;
    }

    // 4. 推理频率控制
    this.frameCount++;
    if (this.frameCount % this.inferEvery !== 0) {
      return null;
    }

    // 5. ST-GCN 模型推理
    return this.infer();
  }

  /** 执行模型推理并构建分类结果 */
  private async infer(): Promise<ClassificationResult> {
    const input = tf.tidy(() =>
      tf.tensor4d(
        this.frameBuffer.flat(3),
        [1, this.maxFrames, NUM_KEYPOINTS, COORD_DIM],
        'float32',
      ),
    );

    try {
      const output = this.model!.predict(input) as tf.Tensor;
      const probs = await output.data();
      output.dispose();

      // 找到概率最大的类别
      let maxIdx = 0;
      let maxProb = probs[0];
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > maxProb) {
          maxProb = probs[i];
          maxIdx = i;
        }
      }

      const glossId = this.getLabelByIndex(maxIdx);
      const chinese = GESTURE_CHINESE[glossId] ?? glossId;

      // 构建所有类别概率列表
      const allProbabilities = Array.from(probs).map((prob, idx) => ({
        gloss_id: this.getLabelByIndex(idx),
        probability: prob,
      }));

      return {
        gloss_id: glossId,
        chinese,
        confidence: maxProb,
        all_probabilities: allProbabilities,
      };
    } finally {
      input.dispose();
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.model !== null && this.handLandmarker !== null;
  }

  dispose(): void {
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.model?.dispose();
    this.model = null;
    this.frameBuffer = [];
    this.isInitialized = false;
    this.labelMap = null;
  }
}
