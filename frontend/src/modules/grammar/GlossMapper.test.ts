// GlossMapper 单元测试
// 通过 mock VocabularyStore.getByChinese 验证词汇映射逻辑

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlossMapper } from './GlossMapper';
import type { Token, GlossSequenceItem } from '@/types/grammar';
import type { VocabularyStore } from '@/modules/data/VocabularyStore';

describe('GlossMapper', () => {
  let getByChineseMock: ReturnType<typeof vi.fn>;
  let mockVocabStore: VocabularyStore;
  let glossMapper: GlossMapper;

  beforeEach(() => {
    getByChineseMock = vi.fn();
    mockVocabStore = {
      getByChinese: getByChineseMock,
    } as unknown as VocabularyStore;
    glossMapper = new GlossMapper(mockVocabStore);
  });

  describe('map', () => {
    it('成功映射：词汇库返回含 gloss_id 的数组时返回 GlossSequenceItem[]', async () => {
      // 按调用顺序依次返回
      getByChineseMock
        .mockResolvedValueOnce([{ gloss_id: 'g_wo', chinese: '我' }])
        .mockResolvedValueOnce([{ gloss_id: 'g_qu', chinese: '去' }]);

      const tokens: Token[] = [
        { word: '我', pos: 'r' },
        { word: '去', pos: 'v' },
      ];

      const result = await glossMapper.map(tokens);

      expect(result).toEqual<GlossSequenceItem[]>([
        { gloss_id: 'g_wo', chinese: '我' },
        { gloss_id: 'g_qu', chinese: '去' },
      ]);
      expect(getByChineseMock).toHaveBeenCalledTimes(2);
      expect(getByChineseMock).toHaveBeenNthCalledWith(1, '我');
      expect(getByChineseMock).toHaveBeenNthCalledWith(2, '去');
    });

    it('词汇库未找到：getByChinese 返回空数组时跳过该词', async () => {
      getByChineseMock
        .mockResolvedValueOnce([]) // “麒麟”未命中词汇库
        .mockResolvedValueOnce([{ gloss_id: 'g_kan', chinese: '看' }]); // “看”命中

      const tokens: Token[] = [
        { word: '麒麟', pos: 'x' },
        { word: '看', pos: 'v' },
      ];

      const result = await glossMapper.map(tokens);

      // 未找到的词被跳过，仅保留命中的词
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ gloss_id: 'g_kan', chinese: '看' });
    });

    it('空输入：返回空数组且不查询词汇库', async () => {
      const result = await glossMapper.map([]);

      expect(result).toEqual([]);
      expect(getByChineseMock).not.toHaveBeenCalled();
    });
  });

  describe('setMappings', () => {
    it('额外映射：词汇库找不到时从 extraMap 查找', async () => {
      // 词汇库始终返回空，迫使走 extraMap 分支
      getByChineseMock.mockResolvedValue([]);

      glossMapper.setMappings([{ chinese: '麒麟', gloss_id: 'g_unicorn' }]);

      const tokens: Token[] = [{ word: '麒麟', pos: 'x' }];
      const result = await glossMapper.map(tokens);

      expect(result).toEqual([{ gloss_id: 'g_unicorn', chinese: '麒麟' }]);
    });

    it('覆盖：再次调用 setMappings 清除旧映射', async () => {
      getByChineseMock.mockResolvedValue([]);

      // 第一次设置：麒麟 -> g_old
      glossMapper.setMappings([{ chinese: '麒麟', gloss_id: 'g_old' }]);
      // 第二次设置：应先清除旧映射，仅保留凤凰 -> g_phoenix
      glossMapper.setMappings([{ chinese: '凤凰', gloss_id: 'g_phoenix' }]);

      const tokens: Token[] = [
        { word: '麒麟', pos: 'x' },
        { word: '凤凰', pos: 'x' },
      ];
      const result = await glossMapper.map(tokens);

      // 旧映射（麒麟）已被清除，词汇库也找不到，应被跳过
      expect(result).toEqual([{ gloss_id: 'g_phoenix', chinese: '凤凰' }]);
    });

    it('同词多义取第一个', async () => {
      getByChineseMock.mockResolvedValue([]);

      // 同一个中文词 “打” 出现两次，应保留第一个映射
      glossMapper.setMappings([
        { chinese: '打', gloss_id: 'g_da_hit' },
        { chinese: '打', gloss_id: 'g_da_dozen' },
      ]);

      const tokens: Token[] = [{ word: '打', pos: 'v' }];
      const result = await glossMapper.map(tokens);

      expect(result).toEqual([{ gloss_id: 'g_da_hit', chinese: '打' }]);
    });
  });

  describe('词汇库优先于 extraMap', () => {
    it('词汇库有结果时优先使用词汇库的 gloss_id，不使用 extraMap', async () => {
      // 词汇库返回 g_vocab
      getByChineseMock.mockResolvedValue([{ gloss_id: 'g_vocab', chinese: '我' }]);
      // extraMap 中存在同词的不同映射
      glossMapper.setMappings([{ chinese: '我', gloss_id: 'g_extra' }]);

      const tokens: Token[] = [{ word: '我', pos: 'r' }];
      const result = await glossMapper.map(tokens);

      // 应使用词汇库的 g_vocab 而非 extraMap 的 g_extra
      expect(result).toEqual([{ gloss_id: 'g_vocab', chinese: '我' }]);
      expect(getByChineseMock).toHaveBeenCalledWith('我');
    });
  });
});
