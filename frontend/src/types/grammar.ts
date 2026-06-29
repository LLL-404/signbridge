// 语法引擎类型定义

/** 分词结果 */
export interface Token {
  word: string;
  pos: string; // 词性 (n/v/r/u/p 等)
}

/** 语法重写规则 */
export interface GrammarRule {
  id: string;
  name: string;
  description: string;
  pattern: TokenPattern[];
  action: RewriteAction;
  priority: number;
}

/** 词元匹配模式 */
export interface TokenPattern {
  pos?: string; // 匹配词性
  word?: string; // 匹配具体词
  exclude_pos?: string[];
}

/** 重写动作 */
export interface RewriteAction {
  type: 'reorder' | 'remove' | 'add_non_manual';
  params: Record<string, unknown>;
}

/** 词汇映射条目（中文词 → gloss_id） */
export interface GlossMapping {
  chinese: string;
  gloss_id: string;
}

/** 非手动标记 */
export interface NonManualMark {
  expression: string;
  head_movement: string;
  body_movement?: string;
}

/** 语法引擎输出：手语词汇序列项 */
export interface GlossSequenceItem {
  gloss_id: string;
  chinese: string;
  non_manual?: NonManualMark;
}

/** 手语词汇序列（一句话的完整输出） */
export interface GlossSequence {
  items: GlossSequenceItem[];
  sentence_non_manual?: NonManualMark;
}

/** 非手动规则触发条件 */
export interface NonManualRule {
  trigger: 'question' | 'negation' | 'emphasis' | 'conditional';
  expression: string;
  head_movement: string;
}

/** 语法规则包接口 */
export interface GrammarRulePack {
  id: string;
  name: string;
  source_lang: string;
  target_lang: string;
  rules: GrammarRule[];
  mappings: GlossMapping[];
  non_manual_rules: NonManualRule[];
}
