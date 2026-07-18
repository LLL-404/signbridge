/**
 * ST-GCN 模型训练模块
 *
 * 流程：生成合成训练数据 → 构建 ST-GCN 模型 → 训练 → 评估 → 保存
 *
 * 用法（浏览器）：
 *   import { trainSTGCN } from './stgcn_train';
 *   await trainSTGCN();  // 训练并保存到 IndexedDB
 *
 * 用法（Node.js 训练脚本）：
 *   import { trainSTGCN } from '../src/modules/recognition/stgcn_train.ts';
 *   await trainSTGCN({
 *     saveToIndexedDB: false,
 *     saveHandler: tf.io.withSaveHandler(...),  // 写入文件系统
 *     onLabelMap: (data) => fs.writeFileSync('labelMap.json', JSON.stringify(data)),
 *   });
 *
 * 注意：合成数据训练的模型在真实场景下准确率有限，
 *       主要用于验证端到端管线可用性 + 提供可加载的预训练权重。
 */

import * as tf from '@tensorflow/tfjs';
// 显式 .ts 扩展名以兼容 Node.js ESM 解析（Vite 同样支持）
import { buildSTGCNModel, STGCN_MODEL_PATH } from './stgcn_model.ts';
import {
  generateTrainingData,
  GESTURE_LABELS,
  GESTURE_CHINESE,
  NUM_CLASSES,
} from './stgcn_data.ts';

/** 默认训练轮数 */
const DEFAULT_EPOCHS = 50;
/** 默认批大小 */
const DEFAULT_BATCH_SIZE = 32;
/** 默认验证集比例 */
const DEFAULT_VALIDATION_SPLIT = 0.2;
/** 默认学习率 */
const DEFAULT_LEARNING_RATE = 0.001;
/** 默认每种手势的合成样本数 */
const DEFAULT_SAMPLES_PER_GESTURE = 120;
/** 评估时每种手势的测试样本数 */
const EVAL_SAMPLES_PER_GESTURE = 20;

/** 标签映射文件格式标识 */
const LABEL_MAP_FORMAT = 'stgcn-v1';

/** 训练日志回调类型 */
type LogCallback = (message: string) => void;

/** 标签映射数据（写入 labelMap.json） */
export interface LabelMapData {
  /** 文件格式标识，便于未来升级 */
  format: typeof LABEL_MAP_FORMAT;
  /** index → gloss_id 列表 */
  labels: string[];
  /** gloss_id → 中文显示名 */
  chinese: Record<string, string>;
  /** 类别数 */
  numClasses: number;
  /** 生成时间（ISO 字符串） */
  generatedAt: string;
}

/** 训练选项 */
export interface TrainSTGCNOptions {
  /** 每种手势的合成样本数，默认 120 */
  samplesPerGesture?: number;
  /** 训练轮数，默认 50 */
  epochs?: number;
  /** 批大小，默认 32 */
  batchSize?: number;
  /** 验证集比例，默认 0.2 */
  validationSplit?: number;
  /** 学习率，默认 0.001 */
  learningRate?: number;
  /** 是否保存到 IndexedDB（浏览器环境），默认 true */
  saveToIndexedDB?: boolean;
  /** 自定义模型保存处理器（Node.js 文件系统保存用） */
  saveHandler?: tf.io.IOHandler;
  /** 标签映射保存回调（Node.js 用于写入 labelMap.json） */
  onLabelMap?: (data: LabelMapData) => Promise<void> | void;
  /** 日志回调；未提供时静默 */
  onLog?: LogCallback;
}

/** 训练结果 */
export interface TrainSTGCNResult {
  /** 训练好的模型（调用方负责 dispose） */
  model: tf.LayersModel;
  /** 最后一轮训练 loss */
  finalLoss: number;
  /** 最后一轮训练 accuracy */
  finalAccuracy: number;
  /** 独立测试集准确率 */
  evalAccuracy: number;
  /** 标签映射数据 */
  labelMap: LabelMapData;
  /** 训练耗时（毫秒） */
  trainingTimeMs: number;
}

/**
 * 构建标签映射数据
 * @returns LabelMapData 对象
 */
function buildLabelMapData(): LabelMapData {
  const chinese: Record<string, string> = {};
  for (const glossId of GESTURE_LABELS) {
    chinese[glossId] = GESTURE_CHINESE[glossId] ?? glossId;
  }
  return {
    format: LABEL_MAP_FORMAT,
    labels: Array.from(GESTURE_LABELS),
    chinese,
    numClasses: NUM_CLASSES,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 在独立测试集上评估模型准确率
 * @param model 已训练模型
 * @param log 日志回调
 * @returns 准确率（0-1）
 */
async function evaluateModel(model: tf.LayersModel, log: LogCallback): Promise<number> {
  // 生成独立的测试数据集（不与训练集重叠，因 generateTrainingData 内部使用随机增强）
  const { x: testX, y: testY } = generateTrainingData(EVAL_SAMPLES_PER_GESTURE);
  log(`评估测试集: ${testX.shape[0]} 样本`);

  try {
    const evalResult = model.evaluate(testX, testY) as tf.Scalar[];
    const loss = (await evalResult[0].data())[0];
    const acc = (await evalResult[1].data())[0];
    log(`测试集 loss=${loss.toFixed(4)} accuracy=${acc.toFixed(4)}`);
    evalResult.forEach((t) => t.dispose());
    return acc;
  } finally {
    testX.dispose();
    testY.dispose();
  }
}

/**
 * 训练 ST-GCN 模型
 *
 * @param options 训练选项
 * @returns 训练结果，包含模型、指标和标签映射
 */
export async function trainSTGCN(options: TrainSTGCNOptions = {}): Promise<TrainSTGCNResult> {
  const {
    samplesPerGesture = DEFAULT_SAMPLES_PER_GESTURE,
    epochs = DEFAULT_EPOCHS,
    batchSize = DEFAULT_BATCH_SIZE,
    validationSplit = DEFAULT_VALIDATION_SPLIT,
    learningRate = DEFAULT_LEARNING_RATE,
    saveToIndexedDB = true,
    saveHandler,
    onLabelMap,
    onLog = () => {},
  } = options;

  const log: LogCallback = onLog;
  const startTime = Date.now();

  // 1. 生成合成训练数据
  log('开始生成合成训练数据...');
  const { x, y } = generateTrainingData(samplesPerGesture);
  log(`数据集: ${x.shape[0]} 样本, shape=${x.shape.join('×')}`);

  // 2. 构建并编译模型
  const model = buildSTGCNModel(NUM_CLASSES);
  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  log(`模型已构建，epochs=${epochs}, batchSize=${batchSize}, lr=${learningRate}`);

  // 3. 训练
  log('开始训练...');
  const history = await model.fit(x, y, {
    epochs,
    batchSize,
    validationSplit,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        // 每 5 轮或最后一轮输出日志
        if (epoch % 5 === 0 || epoch === epochs - 1) {
          log(
            `epoch ${epoch + 1}/${epochs}: ` +
              `loss=${logs?.loss?.toFixed(4)} ` +
              `acc=${logs?.acc?.toFixed(4)} ` +
              `val_loss=${logs?.val_loss?.toFixed(4)} ` +
              `val_acc=${logs?.val_acc?.toFixed(4)}`,
          );
        }
      },
    },
  });

  // 4. 释放训练数据张量
  x.dispose();
  y.dispose();

  // 5. 评估
  log('训练完成，开始独立测试集评估...');
  const evalAccuracy = await evaluateModel(model, log);

  // 6. 提取最终训练指标
  const lossHistory = history.history.loss as number[];
  const accHistory = history.history.acc as number[];
  const finalLoss = lossHistory[lossHistory.length - 1] ?? 0;
  const finalAccuracy = accHistory[accHistory.length - 1] ?? 0;

  // 7. 构建标签映射数据并回调
  const labelMap = buildLabelMapData();
  if (onLabelMap) {
    await onLabelMap(labelMap);
    log('标签映射已通过回调保存');
  }

  // 8. 保存模型
  if (saveHandler) {
    await model.save(saveHandler);
    log('模型已通过自定义 saveHandler 保存');
  }
  if (saveToIndexedDB) {
    try {
      await model.save(STGCN_MODEL_PATH);
      log(`模型已保存到 IndexedDB: ${STGCN_MODEL_PATH}`);
    } catch (err) {
      // IndexedDB 在 Node.js 环境不可用，忽略错误
      log(`IndexedDB 保存跳过（环境不支持）: ${(err as Error).message}`);
    }
  }

  const trainingTimeMs = Date.now() - startTime;
  log(
    `训练流程完成: 耗时=${(trainingTimeMs / 1000).toFixed(1)}s, ` +
      `finalLoss=${finalLoss.toFixed(4)}, finalAcc=${finalAccuracy.toFixed(4)}, ` +
      `evalAcc=${evalAccuracy.toFixed(4)}`,
  );

  return {
    model,
    finalLoss,
    finalAccuracy,
    evalAccuracy,
    labelMap,
    trainingTimeMs,
  };
}
