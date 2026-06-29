// 手语识别 TF.js LSTM 分类模型
// 结构：[30, 126] → LSTM(128) → LSTM(64) → Dense(64) → Dropout(0.3) → Dense(numClasses, softmax)

import * as tf from '@tensorflow/tfjs';
import type { NormalizedSequence } from '@/types/recognition';

/** 输入时间步长 T */
const TIMESTEPS = 30;
/** 每帧特征维度（双手 21 点 × 3 坐标 = 126） */
const FEATURE_DIM = 126;
/** 默认训练轮数 */
const DEFAULT_EPOCHS = 50;
/** 默认批大小 */
const DEFAULT_BATCH_SIZE = 32;
/** 默认验证集比例 */
const DEFAULT_VALIDATION_SPLIT = 0.2;
/** 模型版本号：升级代码时提高以清除旧缓存 */
const MODEL_VERSION = 2;

/**
 * 手语分类模型
 * 封装 TF.js LSTM 模型的构建、训练、推理、保存与加载
 */
export class SignModel {
  /** TF.js 模型实例 */
  private model: tf.LayersModel | null = null;
  /** 当前模型类别数 */
  private numClasses = 0;

  /**
   * 构建模型
   * 使用 categoricalCrossentropy（标签为 one-hot float32）以避免 int32/float32 类型问题
   */
  build(numClasses: number): tf.LayersModel {
    this.numClasses = numClasses;
    const model = tf.sequential();

    model.add(
      tf.layers.lstm({
        units: 128,
        returnSequences: true,
        inputShape: [TIMESTEPS, FEATURE_DIM],
      }),
    );

    model.add(
      tf.layers.lstm({
        units: 64,
        returnSequences: false,
      }),
    );

    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));

    model.add(tf.layers.dropout({ rate: 0.3 }));

    model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

    model.compile({
      optimizer: tf.train.adam(0.001),
      // 使用 categoricalCrossentropy，标签为 float32 的 one-hot 向量
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    this.model = model;
    return model;
  }

  /**
   * 将整数标签转换为 one-hot float32 矩阵
   */
  private oneHotEncode(yData: number[], numClasses: number): tf.Tensor2D {
    const buffer = new Float32Array(yData.length * numClasses);
    for (let i = 0; i < yData.length; i++) {
      const idx = Math.min(Math.max(Math.floor(yData[i]), 0), numClasses - 1);
      buffer[i * numClasses + idx] = 1.0;
    }
    return tf.tensor2d(buffer, [yData.length, numClasses], 'float32');
  }

  /**
   * 训练模型
   * @param xData 训练输入 [样本数, T, 126]
   * @param yData 训练标签 [样本数]（整数类别索引）
   * @param epochs 训练轮数，默认 50
   */
  async train(
    xData: number[][][],
    yData: number[],
    epochs: number = DEFAULT_EPOCHS,
  ): Promise<tf.History> {
    if (!this.model) {
      throw new Error('模型未构建，请先调用 build()');
    }

    // 将输入数据构建为张量，训练结束后释放
    const xs = tf.tensor3d(xData, undefined, 'float32');
    // 整数标签转换为 one-hot float32 矩阵，避免 int32/float32 不兼容
    const ys = this.oneHotEncode(yData, this.numClasses);

    try {
      const history = await this.model.fit(xs, ys, {
        epochs,
        batchSize: DEFAULT_BATCH_SIZE,
        validationSplit: DEFAULT_VALIDATION_SPLIT,
        shuffle: true,
      });
      return history;
    } finally {
      xs.dispose();
      ys.dispose();
    }
  }

  /**
   * 推理：对归一化序列预测各类别概率
   */
  async predict(sequence: NormalizedSequence): Promise<number[]> {
    if (!this.model) {
      throw new Error('模型未构建，请先调用 build() 或 load()');
    }

    // 输入为 float32 张量，保持与训练时一致的类型
    const input = tf.tensor3d(sequence.data, [1, TIMESTEPS, FEATURE_DIM], 'float32');

    try {
      const output = this.model.predict(input) as tf.Tensor;
      const probabilities = await output.data();
      return Array.from(probabilities);
    } finally {
      input.dispose();
    }
  }

  /** 保存模型到指定路径 */
  async save(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('模型未构建，无法保存');
    }
    await this.model.save(path);
  }

  /** 从指定路径加载模型 */
  async load(path: string): Promise<void> {
    this.model = await tf.loadLayersModel(path);
    const outputShape = this.model.outputs[0].shape;
    this.numClasses = outputShape[outputShape.length - 1] ?? 0;
  }

  /** 释放模型资源 */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.numClasses = 0;
  }

  /** 获取当前类别数 */
  getNumClasses(): number {
    return this.numClasses;
  }

  /** 模型是否已就绪 */
  isReady(): boolean {
    return this.model !== null;
  }
}

/** 模型在 IndexedDB 中的存储路径（版本化） */
export const MODEL_STORAGE_PATH = `indexeddb://signbridge-sign-model-v${MODEL_VERSION}`;

/** 版本号供 SequenceClassifier 同步判断标签映射是否过期 */
export const MODEL_VERSION_NUM = MODEL_VERSION;

/** 时间步长与特征维度常量导出，供其他模块使用 */
export const MODEL_TIMESTEPS = TIMESTEPS;
export const MODEL_FEATURE_DIM = FEATURE_DIM;
