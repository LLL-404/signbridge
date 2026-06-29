// 非手动标记器：检测句子类型并附加面部表情、头势等非手动标记
// 检测类型：疑问句、否定句、强调句、陈述句（默认）

import type { Token, GlossSequenceItem, NonManualMark, NonManualRule } from '@/types/grammar';
import { FacialExpression, HeadMovement } from '@/types/sign';
import { Rewriter } from './Rewriter';

/** 句子类型 */
export type SentenceType = 'question' | 'negation' | 'emphasis' | 'statement';

/**
 * 非手动标记器
 * 根据句子中的疑问词、否定词、强调词检测句子类型
 * 返回对应的非手动标记（表情 + 头势）
 */
export class NonManualMarker {
  /** 非手动规则集（来自规则包） */
  private rules: NonManualRule[] = [];

  /** 默认非手动规则（中国手语 CSL） */
  private static readonly DEFAULT_RULES: NonManualRule[] = [
    {
      trigger: 'question',
      expression: FacialExpression.QUESTION,
      head_movement: HeadMovement.SLIGHT_NOD,
    },
    {
      trigger: 'negation',
      expression: FacialExpression.NEGATIVE,
      head_movement: HeadMovement.SHAKE,
    },
    {
      trigger: 'emphasis',
      expression: FacialExpression.EMPHASIS,
      head_movement: HeadMovement.NONE,
    },
  ];

  constructor() {
    this.rules = [...NonManualMarker.DEFAULT_RULES];
  }

  /** 设置规则包提供的非手动规则 */
  setRules(rules: NonManualRule[]): void {
    this.rules = rules.length > 0 ? rules : [...NonManualMarker.DEFAULT_RULES];
  }

  /**
   * 检测句子类型并返回对应的非手动标记
   * 检测优先级：疑问 > 否定 > 强调 > 陈述
   * @param tokens 重写后的 token 序列
   * @param _items 映射后的 gloss 序列项（预留扩展，当前未使用）
   * @returns 非手动标记，陈述句返回 undefined
   */
  mark(tokens: Token[], _items: GlossSequenceItem[]): NonManualMark | undefined {
    const sentenceType = this.detectSentenceType(tokens);

    // 陈述句不附加非手动标记
    if (sentenceType === 'statement') {
      return undefined;
    }

    const rule = this.rules.find((r) => r.trigger === sentenceType);
    if (!rule) {
      return undefined;
    }

    return {
      expression: rule.expression,
      head_movement: rule.head_movement,
    };
  }

  /**
   * 检测句子类型
   * 优先级：疑问 > 否定 > 强调 > 陈述
   */
  private detectSentenceType(tokens: Token[]): SentenceType {
    // 检测疑问句：含疑问词或疑问语气词
    const hasQuestion = tokens.some(
      (t) => t.pos === 'qst' || Rewriter.isQuestionWord(t.word) || t.word === '吗',
    );
    if (hasQuestion) return 'question';

    // 检测否定句：含否定词
    const hasNegation = tokens.some(
      (t) => t.pos === 'neg' || Rewriter.isNegationWord(t.word),
    );
    if (hasNegation) return 'negation';

    // 检测强调句：含强调词
    const hasEmphasis = tokens.some(
      (t) => t.pos === 'emph' || Rewriter.isEmphasisWord(t.word),
    );
    if (hasEmphasis) return 'emphasis';

    // 默认陈述句
    return 'statement';
  }
}
