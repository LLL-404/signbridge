// 词汇映射器：将中文词映射到手语词汇 ID
// 使用 VocabularyStore.getByChinese 查询，找不到的词跳过

import type { Token, GlossSequenceItem, GlossMapping } from '@/types/grammar';
import type { VocabularyStore } from '@/modules/data/VocabularyStore';

/**
 * 词汇映射器
 * 将重写后的 Token 序列映射为 GlossSequenceItem 数组
 */
export class GlossMapper {
  /** 中文词到 gloss_id 的快速查找表（基于规则包映射） */
  private extraMap = new Map<string, string>();

  constructor(private vocabStore: VocabularyStore) {}

  /** 设置规则包提供的额外映射 */
  setMappings(mappings: GlossMapping[]): void {
    this.extraMap.clear();
    mappings.forEach((m) => {
      // 同词多义取第一个
      if (!this.extraMap.has(m.chinese)) {
        this.extraMap.set(m.chinese, m.gloss_id);
      }
    });
  }

  /**
   * 将 Token 序列映射为 GlossSequenceItem 数组
   * 优先从词汇库查询，其次从规则包映射表查询
   * 找不到映射的词跳过
   */
  async map(tokens: Token[]): Promise<GlossSequenceItem[]> {
    const items: GlossSequenceItem[] = [];

    for (const token of tokens) {
      const glossId = await this.lookupGlossId(token.word);
      if (glossId) {
        items.push({
          gloss_id: glossId,
          chinese: token.word,
        });
      }
      // 找不到映射的词跳过（不输出 unmapped 标记，保持序列简洁）
    }

    return items;
  }

  /**
   * 查询单个中文词的 gloss_id
   * 优先从词汇库查询，其次从规则包映射表查询
   * @returns gloss_id，找不到返回 null
   */
  private async lookupGlossId(word: string): Promise<string | null> {
    // 优先从词汇库查询
    const glosses = await this.vocabStore.getByChinese(word);
    if (glosses.length > 0) {
      return glosses[0].gloss_id;
    }
    // 其次从规则包映射表查询
    const extraId = this.extraMap.get(word);
    if (extraId) {
      return extraId;
    }
    return null;
  }
}
