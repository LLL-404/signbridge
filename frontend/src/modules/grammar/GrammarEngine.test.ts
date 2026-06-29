// GrammarEngine 单元测试
// GrammarEngine 构造函数内部创建 Tokenizer/Rewriter/GlossMapper/NonManualMarker，
// 并使用全局单例 vocabularyStore，无法轻松 mock 内部依赖。
// 因此通过公共 API（getCurrentRulePackId / setRulePack / convert）进行行为测试。
//
// 为避免 convert 触发 IndexedDB 初始化（jsdom 环境下未初始化会抛错），
// 此处对 vocabularyStore 全局单例做轻量 mock，使其所有查询返回空。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GrammarRulePack } from '@/types/grammar';

// Mock 全局 vocabularyStore 单例，避免测试中触发 IndexedDB 初始化
vi.mock('@/modules/data/VocabularyStore', () => ({
  vocabularyStore: {
    getAll: vi.fn().mockResolvedValue([]),
    getByChinese: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(undefined),
    getByCategory: vi.fn().mockResolvedValue([]),
    getCategories: vi.fn().mockResolvedValue([]),
    bulkImport: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn(),
    getCacheSize: vi.fn().mockReturnValue(0),
  },
  VocabularyStore: vi.fn(),
}));

import { GrammarEngine } from './GrammarEngine';

describe('GrammarEngine', () => {
  let engine: GrammarEngine;

  beforeEach(() => {
    engine = new GrammarEngine();
  });

  it('getCurrentRulePackId() 默认返回 zhCSL', () => {
    expect(engine.getCurrentRulePackId()).toBe('zhCSL');
  });

  it('setRulePack() 切换规则包后 getCurrentRulePackId() 更新', () => {
    const pack: GrammarRulePack = {
      id: 'intlSign',
      name: '国际手语扩展',
      source_lang: 'zh',
      target_lang: 'isl',
      rules: [],
      mappings: [],
      non_manual_rules: [],
    };

    engine.setRulePack(pack);

    expect(engine.getCurrentRulePackId()).toBe('intlSign');
  });

  it('convert() 空字符串返回 { items: [], sentence_non_manual: undefined }', async () => {
    const result = await engine.convert('');

    expect(result.items).toEqual([]);
    expect(result.sentence_non_manual).toBeUndefined();
  });

  it('convert() 简单文本不抛错（vocabularyStore 未初始化时 items 可能为空）', async () => {
    // vocabularyStore 被 mock 为返回空，故 items 为空，但流程不应抛错
    const result = await engine.convert('你好');

    expect(result.items).toEqual([]);
    expect(result.sentence_non_manual).toBeUndefined();
  });
});
