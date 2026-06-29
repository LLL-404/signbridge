/**
 * 组合识别器
 * 按优先级依次尝试多个识别器，返回第一个有效结果
 *
 * 用法：
 *   const composite = new CompositeRecognizer([
 *     new RuleRecognizer(),      // 先试规则（快）
 *     new LstmRecognizer(),      // 未命中再试 LSTM（慢但智能）
 *   ]);
 */

import type { ClassificationResult } from '@/types/recognition';
import type { Recognizer, FrameInput } from './Recognizer';

export class CompositeRecognizer implements Recognizer {
  private recognizers: Recognizer[];
  private isInitialized = false;

  constructor(recognizers: Recognizer[]) {
    this.recognizers = recognizers;
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

    for (const recognizer of this.recognizers) {
      if (!recognizer.isReady()) continue;
      const result = await recognizer.recognize(input);
      // 有效结果：非 none/unknown 且置信度 > 0.5
      if (result && result.gloss_id !== 'none' && result.gloss_id !== 'unknown' && result.confidence > 0.5) {
        return result;
      }
    }

    // 所有识别器都未命中，返回最后一个结果（可能是 none/unknown）
    let lastResult: ClassificationResult | null = null;
    for (const recognizer of this.recognizers) {
      if (recognizer.isReady()) {
        lastResult = await recognizer.recognize(input);
      }
    }
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
