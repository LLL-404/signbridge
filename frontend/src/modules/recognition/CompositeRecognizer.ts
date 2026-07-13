/**
 * 组合识别器
 * 按优先级依次尝试多个识别器，返回第一个满足置信度阈值的结果
 *
 * 用法（等置信度阈值，默认 0.5）：
 *   const composite = new CompositeRecognizer([
 *     new RuleRecognizer(),      // 先试规则（快）
 *     new LstmRecognizer(),      // 未命中再试 LSTM（慢但智能）
 *   ]);
 *
 * 用法（自定义每识别器置信度阈值，STGCN 优先 + 规则回退）：
 *   import { STGCN_CONFIDENCE_THRESHOLD } from './STGCNRecognizer';
 *   const composite = new CompositeRecognizer(
 *     [new STGCNRecognizer(), new RuleRecognizer()],
 *     [STGCN_CONFIDENCE_THRESHOLD, 0.5],  // STGCN 需 ≥0.8，否则回退到规则
 *   );
 */

import type { ClassificationResult } from '@/types/recognition';
import type { Recognizer, FrameInput } from './Recognizer';

/** 默认置信度阈值 */
const DEFAULT_MIN_CONFIDENCE = 0.5;

export class CompositeRecognizer implements Recognizer {
  private recognizers: Recognizer[];
  /** 每个识别器对应的最小置信度阈值，未指定则使用 DEFAULT_MIN_CONFIDENCE */
  private minConfidences: number[];
  private isInitialized = false;

  /**
   * @param recognizers 按优先级排序的识别器列表
   * @param minConfidences 每个识别器的最小置信度阈值（可选，长度需与 recognizers 一致）
   */
  constructor(recognizers: Recognizer[], minConfidences?: number[]) {
    this.recognizers = recognizers;
    this.minConfidences = minConfidences ?? recognizers.map(() => DEFAULT_MIN_CONFIDENCE);
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    // 并行初始化所有识别器
    await Promise.all(this.recognizers.map((r) => r.init()));
    this.isInitialized = true;
  }

  async recognize(input: FrameInput): Promise<ClassificationResult | null> {
    if (!this.isInitialized) {
      throw new Error('组合识别器未初始化');
    }

    // 单次遍历：按优先级尝试每个识别器，记录最后一个有效结果
    // 比双次遍历更高效（避免重复调用 recognize），且结果更一致
    let lastResult: ClassificationResult | null = null;

    for (let i = 0; i < this.recognizers.length; i++) {
      const recognizer = this.recognizers[i];
      if (!recognizer.isReady()) continue;

      const result = await recognizer.recognize(input);
      if (!result) continue;

      lastResult = result;

      // 满足该识别器的置信度阈值且非 none/unknown → 立即返回
      const threshold = this.minConfidences[i] ?? DEFAULT_MIN_CONFIDENCE;
      if (
        result.gloss_id !== 'none' &&
        result.gloss_id !== 'unknown' &&
        result.confidence > threshold
      ) {
        return result;
      }
    }

    // 所有识别器都未命中阈值，返回最后一个有效结果（可能是低置信度或 none/unknown）
    return lastResult ?? { gloss_id: 'none', chinese: '无手势', confidence: 0 };
  }

  isReady(): boolean {
    return this.isInitialized && this.recognizers.some((r) => r.isReady());
  }

  dispose(): void {
    this.recognizers.forEach((r) => r.dispose());
    this.recognizers = [];
    this.isInitialized = false;
  }
}
