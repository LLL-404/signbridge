// 序列分类器：协调归一化、模型推理与词汇查询，输出分类结果
// 初始化时自动加载已训练模型，若不存在则触发训练

import type { ClassificationResult, KeypointSequence } from '@/types/recognition';
import { Normalizer } from './Normalizer';
import { SignModel, MODEL_STORAGE_PATH } from './SignModel';
import { ModelTrainer, LABEL_MAP_KEY, type LabelMapRecord } from './ModelTrainer';
import { idbAdapter, STORES } from '@/modules/data/IndexedDBAdapter';
import { vocabularyStore } from '@/modules/data/VocabularyStore';

/**
 * 序列分类器
 * 封装从原始关键点序列到分类结果的完整流程
 */
export class SequenceClassifier {
  private readonly normalizer = new Normalizer();
  private readonly model = new SignModel();
  /** 标签列表：索引 → gloss_id */
  private labels: string[] = [];
  /** 模型是否已就绪 */
  private ready = false;
  /** 是否正在初始化（避免并发重复初始化） */
  private initializing = false;

  /**
   * 初始化：加载模型与标签映射
   * 若模型不存在则自动训练
   */
  async init(): Promise<void> {
    // 避免并发初始化
    if (this.ready || this.initializing) return;
    this.initializing = true;

    try {
      await idbAdapter.init();

      // 尝试加载标签映射
      const labelMap = await this.loadLabelMap();

      if (labelMap && labelMap.labels.length > 0) {
        // 标签映射存在，尝试加载模型
        try {
          await this.model.load(MODEL_STORAGE_PATH);
          this.labels = labelMap.labels;
          this.ready = true;
          return;
        } catch {
          // 模型加载失败，继续走训练流程
        }
      }

      // 模型或标签不存在，触发训练
      const trainer = new ModelTrainer();
      await trainer.trainAndExport();

      // 训练完成后重新加载
      await this.model.load(MODEL_STORAGE_PATH);
      const newLabelMap = await this.loadLabelMap();
      this.labels = newLabelMap?.labels ?? [];
      this.ready = true;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * 分类：将关键点序列归一化后送入模型推理
   * @param sequence 原始关键点序列
   * @returns 分类结果（含 gloss_id、chinese、confidence）
   */
  async classify(sequence: KeypointSequence): Promise<ClassificationResult> {
    if (!this.ready) {
      throw new Error('分类器未就绪，请先调用 init()');
    }

    // 1. 归一化
    const normalized = this.normalizer.normalize(sequence);

    // 2. 模型推理
    const probabilities = await this.model.predict(normalized);

    // 3. 取最大概率类别
    const { maxIndex, maxProb } = this.argmax(probabilities);

    // 4. 查词汇库获取中文
    const glossId = this.labels[maxIndex] ?? '';
    const gloss = await vocabularyStore.getById(glossId);
    const chinese = gloss?.chinese ?? glossId;

    // 5. 构建所有概率列表
    const allProbabilities = probabilities.map((prob, idx) => ({
      gloss_id: this.labels[idx] ?? '',
      probability: prob,
    }));

    return {
      gloss_id: glossId,
      chinese,
      confidence: maxProb,
      all_probabilities: allProbabilities,
    };
  }

  /** 模型是否就绪 */
  isReady(): boolean {
    return this.ready;
  }

  /** 释放资源 */
  dispose(): void {
    this.model.dispose();
    this.ready = false;
    this.labels = [];
  }

  /** 从 IndexedDB 加载标签映射 */
  private async loadLabelMap(): Promise<LabelMapRecord | undefined> {
    return idbAdapter.get<LabelMapRecord>(STORES.CACHE, LABEL_MAP_KEY);
  }

  /** 找到数组最大值的索引与值 */
  private argmax(arr: number[]): { maxIndex: number; maxProb: number } {
    let maxIndex = 0;
    let maxProb = arr[0] ?? 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > maxProb) {
        maxProb = arr[i];
        maxIndex = i;
      }
    }
    return { maxIndex, maxProb };
  }
}
