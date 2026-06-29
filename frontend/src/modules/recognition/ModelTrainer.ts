// 模型训练器：生成训练数据 → 构建模型 → 训练 → 保存到 IndexedDB
// 训练是异步过程，首次使用时自动触发，不在 build 时强制执行

import { SignModel, MODEL_STORAGE_PATH, MODEL_VERSION_NUM } from './SignModel';
import { TrainingDataGenerator } from './TrainingDataGenerator';
import { idbAdapter, STORES } from '@/modules/data/IndexedDBAdapter';

/** 标签映射在 IndexedDB 中的存储键（版本化） */
const LABEL_MAP_KEY = `sign-model-label-map-v${MODEL_VERSION_NUM}`;
/** 训练轮数 */
const TRAIN_EPOCHS = 50;

/** 标签映射条目：gloss_id 与类别索引的对应关系 */
export interface LabelMapEntry {
  gloss_id: string;
  index: number;
}

/** 标签映射存储结构 */
interface LabelMapRecord {
  key: string;
  labels: string[];
  entries: LabelMapEntry[];
}

/**
 * 模型训练器
 * 协调数据生成、模型构建与训练、持久化存储
 */
export class ModelTrainer {
  private readonly generator = new TrainingDataGenerator();
  private readonly model = new SignModel();

  /**
   * 训练并导出模型
   * 1. 生成训练数据
   * 2. 构建并训练模型
   * 3. 保存模型到 IndexedDB
   * 4. 保存标签映射到 IndexedDB
   */
  async trainAndExport(): Promise<void> {
    // 1. 生成训练数据
    const { x, y, labels } = await this.generator.generate();

    // 2. 构建模型（类别数 = 标签数）
    const numClasses = labels.length;
    this.model.build(numClasses);

    // 3. 训练模型
    await this.model.train(x, y, TRAIN_EPOCHS);

    // 4. 保存模型到 IndexedDB
    await this.model.save(MODEL_STORAGE_PATH);

    // 5. 保存标签映射到 IndexedDB
    await this.saveLabelMap(labels);

    // 释放模型资源（已持久化）
    this.model.dispose();
  }

  /**
   * 保存标签映射到 IndexedDB
   * @param labels gloss_id 列表，索引即为类别索引
   */
  private async saveLabelMap(labels: string[]): Promise<void> {
    await idbAdapter.init();
    const entries: LabelMapEntry[] = labels.map((glossId, index) => ({
      gloss_id: glossId,
      index,
    }));
    const record: LabelMapRecord = {
      key: LABEL_MAP_KEY,
      labels,
      entries,
    };
    await idbAdapter.put(STORES.CACHE, record);
  }

  /** 获取训练器持有的模型实例（供外部使用） */
  getModel(): SignModel {
    return this.model;
  }
}

/** 标签映射存储键导出，供 SequenceClassifier 使用 */
export { LABEL_MAP_KEY, type LabelMapRecord };
