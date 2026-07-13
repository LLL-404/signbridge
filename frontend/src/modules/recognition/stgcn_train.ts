/**
 * ST-GCN 模型训练脚本
 *
 * 流程：生成合成训练数据 → 构建 ST-GCN 模型 → 训练 → 保存到 IndexedDB
 *
 * 用法：
 *   import { trainSTGCN } from './stgcn_train';
 *   await trainSTGCN();  // 训练完成后 STGCNRecognizer.init() 会自动加载
 *
 * 注意：合成数据训练的模型在真实场景下准确率有限，
 *       主要用于验证端到端管线可用性。
 */

import * as tf from '@tensorflow/tfjs';
import { buildSTGCNModel, STGCN_MODEL_PATH } from './STGCNRecognizer';
import { generateTrainingData, NUM_CLASSES } from './stgcn_data';
import { logger } from '@/modules/debug/logger';

const log = logger.module('STGCNTrain');

/** 训练轮数 */
const TRAIN_EPOCHS = 50;
/** 批大小 */
const BATCH_SIZE = 32;
/** 验证集比例 */
const VALIDATION_SPLIT = 0.2;
/** 学习率 */
const LEARNING_RATE = 0.001;

/**
 * 训练 ST-GCN 模型并保存到 IndexedDB
 *
 * @param samplesPerGesture 每种手势的合成样本数，默认 120
 * @returns 训练好的模型
 */
export async function trainSTGCN(samplesPerGesture = 120): Promise<tf.LayersModel> {
  log.debug('开始训练，生成合成数据...');

  // 1. 生成合成训练数据
  const { x, y } = generateTrainingData(samplesPerGesture);
  log.debug(`数据集: ${x.shape[0]} 样本, shape=${x.shape.join('×')}`);

  // 2. 构建并编译模型
  const model = buildSTGCNModel(NUM_CLASSES);
  model.compile({
    optimizer: tf.train.adam(LEARNING_RATE),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  // 3. 训练
  log.debug('开始训练模型...');
  await model.fit(x, y, {
    epochs: TRAIN_EPOCHS,
    batchSize: BATCH_SIZE,
    validationSplit: VALIDATION_SPLIT,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0 || epoch === TRAIN_EPOCHS - 1) {
          log.debug(
            `epoch ${epoch}: loss=${logs?.loss?.toFixed(4)} acc=${logs?.acc?.toFixed(4)} val_acc=${logs?.val_acc?.toFixed(4)}`,
          );
        }
      },
    },
  });

  // 4. 保存模型到 IndexedDB
  await model.save(STGCN_MODEL_PATH);
  log.debug(`模型已保存到 ${STGCN_MODEL_PATH}`);

  // 5. 释放训练数据张量
  x.dispose();
  y.dispose();

  return model;
}
