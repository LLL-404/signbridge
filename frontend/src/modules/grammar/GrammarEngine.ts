// 语法引擎主类：串联分词、重写、映射、非手动标记四个阶段
// 输入中文文本，输出手语词汇序列（GlossSequence）

import type { GlossSequence, GrammarRulePack } from '@/types/grammar';
import { vocabularyStore } from '@/modules/data/VocabularyStore';
import { Tokenizer } from './Tokenizer';
import { Rewriter } from './Rewriter';
import { GlossMapper } from './GlossMapper';
import { NonManualMarker } from './NonManualMarker';

/**
 * 手语语法引擎
 * 工作流程：Tokenizer → Rewriter → GlossMapper → NonManualMarker
 * 支持通过 setRulePack 切换规则包（如 zhCSL、国际手语扩展）
 */
export class GrammarEngine {
  private tokenizer: Tokenizer;
  private rewriter: Rewriter;
  private glossMapper: GlossMapper;
  private nonManualMarker: NonManualMarker;
  /** 当前规则包 ID */
  private currentRulePackId: string;

  constructor() {
    this.tokenizer = new Tokenizer(vocabularyStore);
    this.rewriter = new Rewriter();
    this.glossMapper = new GlossMapper(vocabularyStore);
    this.nonManualMarker = new NonManualMarker();
    this.currentRulePackId = 'zhCSL';
  }

  /**
   * 将中文文本转换为中国手语词汇序列
   * @param text 输入中文文本
   * @returns 手语词汇序列（含 items 和 sentence_non_manual）
   */
  async convert(text: string): Promise<GlossSequence> {
    // 阶段1：分词
    const tokens = await this.tokenizer.tokenize(text);

    // 阶段2：语法重写（调整语序）
    const rewrittenTokens = this.rewriter.rewrite(tokens);

    // 阶段3：词汇映射（中文词 → gloss_id）
    const items = await this.glossMapper.map(rewrittenTokens);

    // 阶段4：非手动标记检测
    const sentenceNonManual = this.nonManualMarker.mark(rewrittenTokens, items);

    return {
      items,
      sentence_non_manual: sentenceNonManual,
    };
  }

  /**
   * 切换规则包
   * 更新映射表和非手动规则
   * @param pack 规则包
   */
  setRulePack(pack: GrammarRulePack): void {
    this.currentRulePackId = pack.id;
    // 更新词汇映射表
    this.glossMapper.setMappings(pack.mappings);
    // 更新非手动规则
    this.nonManualMarker.setRules(pack.non_manual_rules);
  }

  /** 获取当前规则包 ID */
  getCurrentRulePackId(): string {
    return this.currentRulePackId;
  }
}

/** 全局语法引擎单例 */
export const grammarEngine = new GrammarEngine();
