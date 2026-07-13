/**
 * ST-GCN 手势识别器 —— 基于手部骨骼关键点的时空图卷积网络
 *
 * 架构：
 *   输入 (batch, 30, 21, 2) →
 *   空间图卷积 1 (21 节点, 2→64 通道) → ReLU →
 *   空间图卷积 2 (21 节点, 64→128 通道) → ReLU →
 *   时间卷积 (kernel=3, 128→256 通道) → ReLU →
 *   全局平均池化 →
 *   全连接 (256→10) → Softmax
 *
 * 空间图卷积实现：X' = D^(-1/2) (A+I) D^(-1/2) X W
 *   A: 21×21 邻接矩阵（无向图）
 *   D: 度矩阵
 *   W: 可训练权重 (in_channels, out_channels)
 *
 * 注意：若无训练好的模型，init() 会构建未训练模型，接口完整但准确率低。
 * 调用 stgcn_train.ts 的 trainSTGCN() 可训练并保存模型。
 */

import * as tf from '@tensorflow/tfjs';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { appConfig } from '@/config';
import type { ClassificationResult } from '@/types/recognition';
import type { Recognizer, FrameInput } from './Recognizer';
import {
  HAND_EDGES,
  GESTURE_LABELS,
  GESTURE_CHINESE,
  NUM_KEYPOINTS,
  NUM_FRAMES,
  COORD_DIM,
  NUM_CLASSES,
} from './stgcn_data';
import { logger } from '@/modules/debug/logger';

const log = logger.module('STGCNRecognizer');

// ===== 常量 =====

/** MediaPipe wasm CDN（复用 RuleRecognizer 配置） */
const WASM_URL = appConfig.mediapipeWasmBaseUrl;
/** HandLandmarker 模型 URL */
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
/** 模型在 IndexedDB 中的存储路径 */
export const STGCN_MODEL_PATH = 'indexeddb://stgcn-gesture-model';
/** 推理置信度阈值：低于此值视为无效识别 */
export const STGCN_CONFIDENCE_THRESHOLD = 0.8;

// ===== 邻接矩阵构建 =====

/** 归一化邻接矩阵缓存（模块级单例，避免重复创建） */
let adjNormCache: tf.Tensor2D | null = null;

/**
 * 构建 21×21 归一化邻接矩阵
 * 1. 根据骨骼边构建对称邻接矩阵 A
 * 2. 添加自环 A' = A + I
 * 3. 对称归一化：D^(-1/2) A' D^(-1/2)
 */
function getAdjNorm(): tf.Tensor2D {
  if (adjNormCache) return adjNormCache;

  const N = NUM_KEYPOINTS;
  const adj: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  // 填充邻接矩阵（无向图，对称）
  for (const [i, j] of HAND_EDGES) {
    adj[i][j] = 1;
    adj[j][i] = 1;
  }
  // 添加自环
  for (let i = 0; i < N; i++) adj[i][i] = 1;

  // 计算度矩阵并对称归一化
  const degree = adj.map((row) => row.reduce((s, v) => s + v, 0));
  const normalized = adj.map((row, i) =>
    row.map((v, j) => v / Math.sqrt(degree[i] * degree[j] || 1)),
  );

  adjNormCache = tf.tensor2d(normalized, [N, N], 'float32');
  return adjNormCache;
}

// ===== 自定义图卷积层 =====

/** 空间图卷积层配置 */
interface GraphConvConfig {
  units: number;
  name?: string;
}

/**
 * 空间图卷积层
 * X' = A_norm @ (X @ W)
 *   X: (batch, frames, 21, in_channels)
 *   W: (in_channels, out_channels)
 *   A_norm: (21, 21) 归一化邻接矩阵
 *   输出: (batch, frames, 21, out_channels)
 */
class GraphConvLayer extends tf.layers.Layer {
  /** 序列化类名（registerClass 需要） */
  static className = 'GraphConv';

  private units: number;
  private kernel: tf.LayerVariable | null = null;

  constructor(config: GraphConvConfig) {
    super({ name: config.name });
    this.units = config.units;
  }

  build(inputShape: tf.Shape | tf.Shape[]): void {
    const shape = inputShape as tf.Shape;
    const inChannels = shape[shape.length - 1] as number;
    this.kernel = this.addWeight(
      'kernel',
      [inChannels, this.units],
      'float32',
      tf.initializers.glorotNormal({}),
    );
    super.build(inputShape);
  }

  computeOutputShape(inputShape: tf.Shape | tf.Shape[]): tf.Shape | tf.Shape[] {
    const shape = inputShape as tf.Shape;
    return [...shape.slice(0, -1), this.units];
  }

  call(inputs: tf.Tensor | tf.Tensor[], _kwargs: { [key: string]: unknown }): tf.Tensor | tf.Tensor[] {
    const x = (Array.isArray(inputs) ? inputs[0] : inputs) as tf.Tensor4D;
    const w = this.kernel!.read();
    const [B, F, N, inCh] = x.shape as number[];
    const outCh = this.units;
    const adj = getAdjNorm();

    return tf.tidy(() => {
      // X @ W: (B,F,21,in) @ (in,out) → (B*F, 21, out)
      const xBF = tf.reshape(x, [B * F, N, inCh]);
      const xw = tf.matMul(xBF, w); // w 广播到 (B*F, in, out)
      // A @ XW: (1,21,21) @ (B*F,21,out) → (B*F, 21, out)
      const adjBatched = tf.reshape(adj, [1, N, N]);
      const axw = tf.matMul(adjBatched, xw);
      return tf.reshape(axw, [B, F, N, outCh]);
    });
  }

  getClassName(): string {
    return 'GraphConv';
  }

  getConfig(): tf.serialization.ConfigDict {
    const config = super.getConfig();
    config.units = this.units;
    return config;
  }
}

// 注册自定义层，支持模型序列化/反序列化
// GraphConvLayer 通过继承获得 Container.fromConfig（4 参数泛型签名），
// TS 无法正确推断其满足 SerializableConstructor 的 2 参数约束，故使用类型断言
tf.serialization.registerClass(
  GraphConvLayer as unknown as Parameters<typeof tf.serialization.registerClass>[0],
);

// ===== ST-GCN 模型构建 =====

/**
 * 构建 ST-GCN 模型
 * @param numClasses 输出类别数，默认 NUM_CLASSES
 * @returns 未编译的 LayersModel（训练前需 compile）
 */
export function buildSTGCNModel(numClasses: number = NUM_CLASSES): tf.LayersModel {
  const input = tf.input({ shape: [NUM_FRAMES, NUM_KEYPOINTS, COORD_DIM] });

  // 空间图卷积 1: 2 → 64 通道
  const gcn1 = new GraphConvLayer({ units: 64, name: 'gcn1' }).apply(input);
  const relu1 = tf.layers.reLU().apply(gcn1);

  // 空间图卷积 2: 64 → 128 通道
  const gcn2 = new GraphConvLayer({ units: 128, name: 'gcn2' }).apply(relu1);
  const relu2 = tf.layers.reLU().apply(gcn2);

  // 时间卷积: 128 → 256 通道, kernel=(3,1) 沿时间轴滑动
  const tempConv = tf.layers
    .conv2d({
      filters: 256,
      kernelSize: [3, 1],
      strides: [1, 1],
      padding: 'same',
      activation: 'relu',
      name: 'temporal_conv',
    })
    .apply(relu2);

  // 全局平均池化: (B, 30, 21, 256) → (B, 256)
  const pooled = tf.layers.globalAveragePooling2d({}).apply(tempConv);

  // 全连接分类层: 256 → numClasses
  const output = tf.layers
    .dense({ units: numClasses, activation: 'softmax', name: 'classifier' })
    .apply(pooled);

  const model = tf.model({ inputs: input, outputs: output as tf.SymbolicTensor });
  return model;
}

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

  /** 初始化：加载 HandLandmarker + 构建或加载 ST-GCN 模型 */
  async init(): Promise<void> {
    if (this.isInitialized) return;

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

  /** 尝试加载已训练模型，失败则构建未训练模型 */
  private async loadOrBuildModel(): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(STGCN_MODEL_PATH);
    } catch {
      // 模型不存在（首次使用），构建未训练模型
      // 调用 stgcn_train.ts 的 trainSTGCN() 可训练并持久化
      log.warn('未找到已训练模型，使用未训练模型（准确率低）');
      this.model = buildSTGCNModel(NUM_CLASSES);
    }
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

      const glossId = GESTURE_LABELS[maxIdx] ?? 'unknown';
      const chinese = GESTURE_CHINESE[glossId] ?? glossId;

      // 构建所有类别概率列表
      const allProbabilities = Array.from(probs).map((prob, idx) => ({
        gloss_id: GESTURE_LABELS[idx] ?? `class_${idx}`,
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
  }
}
