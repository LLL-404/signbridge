// 语法重写器：将中文语序重写为中国手语（CSL）语序
// 主要规则：宾语前移、去除功能词、疑问词后置、否定词后置

import type { Token, GrammarRule } from '@/types/grammar';

/** 表示方向/目标的动词，触发宾语前移 */
const DIRECTIONAL_VERBS = new Set(['去', '到', '回', '上', '下', '进', '出', '过']);

/** 疑问词集合 */
const QUESTION_WORDS = new Set(['什么', '哪里', '哪儿', '谁', '怎么', '为什么', '几', '多少', '哪']);

/** 否定词集合 */
const NEGATION_WORDS = new Set(['不', '没', '没有', '别', '勿', '未', '莫']);

/** 强调词集合 */
const EMPHASIS_WORDS = new Set(['很', '非常', '太', '特别', '十分', '极其', '尤其', '更', '最']);

/** 重写规则配置 */
export interface RewriterConfig {
  /** 是否启用宾语前移 */
  enableObjectFronting: boolean;
  /** 是否启用功能词去除 */
  enableFunctionWordRemoval: boolean;
  /** 是否启用疑问词后置 */
  enableQuestionRear: boolean;
  /** 是否启用否定词后置 */
  enableNegationRear: boolean;
}

/** 默认重写配置（全部启用） */
const DEFAULT_CONFIG: RewriterConfig = {
  enableObjectFronting: true,
  enableFunctionWordRemoval: true,
  enableQuestionRear: true,
  enableNegationRear: true,
};

/**
 * 语法重写器
 * 按优先级执行多条重写规则，将中文语序转换为中国手语语序
 */
export class Rewriter {
  private config: RewriterConfig;
  /** 启用的规则集（按优先级降序排列） */
  private rules: GrammarRule[] = [];

  constructor(config: Partial<RewriterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = this.buildRules();
  }

  /** 更新配置并重建规则集 */
  setConfig(config: Partial<RewriterConfig>): void {
    this.config = { ...this.config, ...config };
    this.rules = this.buildRules();
  }

  /**
   * 对 token 序列应用重写规则
   * 规则按优先级从高到低执行
   */
  rewrite(tokens: Token[]): Token[] {
    if (tokens.length === 0) return tokens;

    let result = [...tokens];

    // 按优先级降序执行规则
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);
    for (const rule of sortedRules) {
      result = this.applyRule(rule, result);
    }

    return result;
  }

  /** 构建规则集 */
  private buildRules(): GrammarRule[] {
    const rules: GrammarRule[] = [];

    // 规则1：宾语前移（优先级最高，先处理结构）
    if (this.config.enableObjectFronting) {
      rules.push({
        id: 'object_fronting',
        name: '宾语前移',
        description: '方向/目标动词后的名词宾语前移到动词前（如"去医院" → "医院去"）',
        pattern: [{ pos: 'v' }, { pos: 'n' }],
        action: { type: 'reorder', params: { mode: 'object_fronting' } },
        priority: 100,
      });
    }

    // 规则2：否定词后置
    if (this.config.enableNegationRear) {
      rules.push({
        id: 'negation_rear',
        name: '否定词后置',
        description: '否定词移到动词后（如"我不去" → "我去 不"）',
        pattern: [{ pos: 'neg' }],
        action: { type: 'reorder', params: { mode: 'negation_rear' } },
        priority: 90,
      });
    }

    // 规则3：疑问词后置
    if (this.config.enableQuestionRear) {
      rules.push({
        id: 'question_rear',
        name: '疑问词后置',
        description: '疑问词移到句末',
        pattern: [{ pos: 'qst' }],
        action: { type: 'reorder', params: { mode: 'question_rear' } },
        priority: 80,
      });
    }

    // 规则4：去除功能词（优先级最低，最后清理）
    if (this.config.enableFunctionWordRemoval) {
      rules.push({
        id: 'function_word_removal',
        name: '去除功能词',
        description: '去除量词、语气词、部分介词',
        pattern: [{ pos: 'q' }],
        action: { type: 'remove', params: { pos_list: ['q', 'u', 'p'] } },
        priority: 50,
      });
    }

    return rules;
  }

  /** 应用单条规则 */
  private applyRule(rule: GrammarRule, tokens: Token[]): Token[] {
    switch (rule.action.type) {
      case 'reorder':
        return this.applyReorder(rule.action.params.mode as string, tokens);
      case 'remove':
        return this.applyRemove(rule.action.params.pos_list as string[], tokens);
      case 'add_non_manual':
        // 非手动标记由 NonManualMarker 处理，此处不处理
        return tokens;
      default:
        return tokens;
    }
  }

  /**
   * 应用重排序规则
   * 根据规则模式将特定词性的词移到目标位置
   */
  private applyReorder(mode: string, tokens: Token[]): Token[] {
    switch (mode) {
      case 'object_fronting':
        return this.objectFronting(tokens);
      case 'negation_rear':
        return this.negationRear(tokens);
      case 'question_rear':
        return this.questionRear(tokens);
      default:
        return tokens;
    }
  }

  /**
   * 宾语前移：方向/目标动词后的名词前移到动词前
   * 仅对表示方向/目标的动词（去、到、回等）生效
   */
  private objectFronting(tokens: Token[]): Token[] {
    const result: Token[] = [];
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      // 检测方向动词 + 名词模式
      if (
        token.pos === 'v' &&
        DIRECTIONAL_VERBS.has(token.word) &&
        i + 1 < tokens.length &&
        tokens[i + 1].pos === 'n'
      ) {
        // 将名词移到动词前
        result.push(tokens[i + 1]);
        result.push(token);
        i += 2;
      } else {
        result.push(token);
        i++;
      }
    }
    return result;
  }

  /**
   * 否定词后置：将否定词移到动词后
   * 如"我不去" → "我去 不"
   */
  private negationRear(tokens: Token[]): Token[] {
    const negations: Token[] = [];
    const others: Token[] = [];
    let negationPlaced = false;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.pos === 'neg' || NEGATION_WORDS.has(token.word)) {
        // 收集否定词，延迟放置
        negations.push(token);
        continue;
      }
      others.push(token);
      // 遇到动词后，将收集的否定词插入到动词后
      if (token.pos === 'v' && negations.length > 0 && !negationPlaced) {
        negations.forEach((n) => others.push(n));
        negations.length = 0;
        negationPlaced = true;
      }
    }

    // 若否定词未放置（无动词），追加到末尾
    if (negations.length > 0) {
      negations.forEach((n) => others.push(n));
    }
    return others;
  }

  /**
   * 疑问词后置：将疑问词移到句末
   */
  private questionRear(tokens: Token[]): Token[] {
    const questions: Token[] = [];
    const others: Token[] = [];

    for (const token of tokens) {
      if (token.pos === 'qst' || QUESTION_WORDS.has(token.word)) {
        questions.push(token);
      } else {
        others.push(token);
      }
    }

    // 疑问词追加到末尾
    return [...others, ...questions];
  }

  /**
   * 去除指定词性的功能词
   * @param posList 要去除的词性列表
   */
  private applyRemove(posList: string[], tokens: Token[]): Token[] {
    const posSet = new Set(posList);
    return tokens.filter((t) => !posSet.has(t.pos));
  }

  /** 判断是否为强调词（供 NonManualMarker 使用） */
  static isEmphasisWord(word: string): boolean {
    return EMPHASIS_WORDS.has(word);
  }

  /** 判断是否为否定词（供 NonManualMarker 使用） */
  static isNegationWord(word: string): boolean {
    return NEGATION_WORDS.has(word);
  }

  /** 判断是否为疑问词（供 NonManualMarker 使用） */
  static isQuestionWord(word: string): boolean {
    return QUESTION_WORDS.has(word);
  }
}
