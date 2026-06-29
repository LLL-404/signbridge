// 置信度过滤器：根据模型置信度决定是否接受分类结果
// 低于阈值的结果被拒绝，提示用户重新输入

import type { ClassificationResult } from '@/types/recognition';

/** 过滤结果 */
export interface FilterResult {
  /** 是否接受该分类结果 */
  accepted: boolean;
  /** 拒绝时的提示消息 */
  message?: string;
}

/** 默认置信度阈值 */
const DEFAULT_THRESHOLD = 0.6;
/** 拒绝时的提示消息 */
const REJECT_MESSAGE = '请重新打手语';

/**
 * 置信度过滤器
 * 通过阈值判断分类结果是否可信
 */
export class ConfidenceFilter {
  private readonly threshold: number;

  /**
   * @param threshold 置信度阈值，默认 0.6
   */
  constructor(threshold: number = DEFAULT_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * 过滤分类结果
   * @param result 分类结果
   * @returns 接受则 accepted=true；拒绝则附带提示消息
   */
  filter(result: ClassificationResult): FilterResult {
    if (result.confidence < this.threshold) {
      return { accepted: false, message: REJECT_MESSAGE };
    }
    return { accepted: true };
  }

  /** 获取当前阈值 */
  getThreshold(): number {
    return this.threshold;
  }
}
