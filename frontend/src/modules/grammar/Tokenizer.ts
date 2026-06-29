// 中文分词器：基于词汇库的正向最大匹配（FMM）算法
// 不依赖第三方分词库，与手语词汇库天然对齐

import type { Token } from '@/types/grammar';
import type { VocabularyStore } from '@/modules/data/VocabularyStore';

/** 代词列表 */
const PRONOUNS = new Set([
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '咱们', '自己', '别人',
]);

/** 常用动词列表 */
const VERBS = new Set([
  '是', '有', '想', '要', '去', '来', '看', '听', '说', '做', '吃', '喝',
  '走', '跑', '坐', '站', '睡', '写', '读', '学', '教', '买', '卖', '给',
  '爱', '喜欢', '知道', '认识', '会', '能', '可以', '应该',
]);

/** 量词列表 */
const CLASSIFIERS = new Set(['个', '只', '条', '本', '张', '件', '辆', '座', '位', '头', '匹', '棵']);

/** 语气词列表 */
const PARTICLES = new Set(['吗', '呢', '吧', '啊', '呀', '哦', '啦', '嘛', '哟', '哇']);

/** 介词列表 */
const PREPOSITIONS = new Set(['在', '到', '从', '给', '对', '向', '为', '被', '把', '比']);

/** 否定词列表 */
const NEGATIONS = new Set(['不', '没', '没有', '别', '勿', '未', '莫']);

/** 疑问词列表 */
const QUESTION_WORDS = new Set(['什么', '哪里', '哪儿', '谁', '怎么', '为什么', '怎么', '几', '多少', '哪']);

/** 强调词列表 */
const EMPHASIS_WORDS = new Set(['很', '非常', '太', '特别', '十分', '极其', '尤其', '更', '最']);

/** 标点符号集合（分词时作为分隔符） */
const PUNCTUATIONS = new Set([
  '，', '。', '！', '？', '、', '；', '：', '“', '”', '‘', '’',
  '（', '）', '《', '》', '【', '】', '…', '—',
  ',', '.', '!', '?', ';', ':', '(', ')', '"', "'", ' ',
]);

/**
 * 词性标注器
 * 基于预定义词表和词汇库分类信息进行简单词性标注
 */
export class PosTagger {
  /** 为单个词标注词性 */
  tagWord(word: string, category?: string): string {
    // 优先按预定义词表判断
    if (PRONOUNS.has(word)) return 'r';
    if (VERBS.has(word)) return 'v';
    if (CLASSIFIERS.has(word)) return 'q';
    if (PARTICLES.has(word)) return 'u';
    if (PREPOSITIONS.has(word)) return 'p';
    if (NEGATIONS.has(word)) return 'neg';
    if (QUESTION_WORDS.has(word)) return 'qst';
    if (EMPHASIS_WORDS.has(word)) return 'emph';
    // 若提供词汇分类，按分类推断
    if (category) {
      const cat = category.toLowerCase();
      if (cat.includes('动') || cat.includes('verb')) return 'v';
      if (cat.includes('名') || cat.includes('noun')) return 'n';
      if (cat.includes('形') || cat.includes('adj')) return 'a';
      if (cat.includes('数') || cat.includes('num')) return 'm';
    }
    // 默认标记为其他
    return 'x';
  }
}

/**
 * 中文分词器
 * 采用正向最大匹配算法（FMM），优先匹配词汇库中的词
 * 词汇库中匹配不到的部分按单字切分
 */
export class Tokenizer {
  private posTagger: PosTagger;
  /** 词汇库中所有中文词的集合（按长度降序排列便于 FMM） */
  private vocabWords: string[] = [];
  /** 中文词到分类的映射 */
  private wordToCategory = new Map<string, string>();
  /** 标记是否已加载词汇库 */
  private isLoaded = false;
  /** 最大词长（FMM 匹配窗口） */
  private maxWordLen = 1;

  constructor(private vocabStore: VocabularyStore) {
    this.posTagger = new PosTagger();
  }

  /** 加载词汇库中的所有中文词，构建 FMM 词典 */
  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;
    const all = await this.vocabStore.getAll();
    const wordSet = new Set<string>();
    all.forEach((g) => {
      // 跳过空字符串
      const word = g.chinese?.trim();
      if (!word) return;
      wordSet.add(word);
      // 记录词到分类的映射（同词多义取第一个）
      if (!this.wordToCategory.has(word)) {
        this.wordToCategory.set(word, g.category);
      }
    });
    // 按长度降序排列，确保 FMM 优先匹配长词
    this.vocabWords = Array.from(wordSet).sort((a, b) => b.length - a.length);
    // 计算最大词长
    this.maxWordLen = this.vocabWords.reduce((max, w) => Math.max(max, w.length), 1);
    this.isLoaded = true;
  }

  /**
   * 对文本进行分词
   * @param text 输入中文文本
   * @returns Token 数组（含词与词性）
   */
  async tokenize(text: string): Promise<Token[]> {
    if (!text || text.trim().length === 0) return [];
    await this.ensureLoaded();

    const tokens: Token[] = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
      const ch = text[i];

      // 跳过标点和空白
      if (PUNCTUATIONS.has(ch)) {
        i++;
        continue;
      }

      // 正向最大匹配：从最长词开始尝试
      const matched = this.matchLongest(text, i);
      if (matched) {
        const category = this.wordToCategory.get(matched);
        tokens.push({
          word: matched,
          pos: this.posTagger.tagWord(matched, category),
        });
        i += matched.length;
      } else {
        // 词汇库和词表中均无匹配，按单字切分
        tokens.push({
          word: ch,
          pos: this.posTagger.tagWord(ch),
        });
        i++;
      }
    }

    return tokens;
  }

  /**
   * 从指定位置开始匹配最长的词
   * @returns 匹配到的词，未匹配返回 null
   */
  private matchLongest(text: string, start: number): string | null {
    const remaining = text.length - start;
    // 匹配窗口取剩余长度与最大词长的较小值
    const windowSize = Math.min(this.maxWordLen, remaining);

    // 从最长到最短尝试匹配
    for (let size = windowSize; size >= 1; size--) {
      const candidate = text.substring(start, start + size);
      // 先查词汇库
      if (this.wordToCategory.has(candidate)) {
        return candidate;
      }
      // 再查预定义词表（代词、动词等）
      if (this.isInWordList(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /** 判断词是否在预定义词表中 */
  private isInWordList(word: string): boolean {
    return (
      PRONOUNS.has(word) ||
      VERBS.has(word) ||
      CLASSIFIERS.has(word) ||
      PARTICLES.has(word) ||
      PREPOSITIONS.has(word) ||
      NEGATIONS.has(word) ||
      QUESTION_WORDS.has(word) ||
      EMPHASIS_WORDS.has(word)
    );
  }
}
