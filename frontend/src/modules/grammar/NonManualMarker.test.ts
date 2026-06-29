/**
 * @file NonManualMarker.test.ts
 * @description 非手动标记器 NonManualMarker 单元测试
 *
 * 测试覆盖：
 *   - 疑问句检测：含疑问词(qst)或"吗" → 返回 question 表情 + 头势
 *   - 否定句检测：含否定词(neg) → 返回 negation 表情 + 头势
 *   - 强调句检测：含强调词(emph) → 返回 emphasis 表情 + 头势
 *   - 陈述句：无触发词 → 返回 undefined
 *   - 优先级：疑问 > 否定 > 强调 > 陈述
 *   - setRules()：自定义规则覆盖默认规则
 *   - 空数组 setRules 回退到默认规则
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Token, GlossSequenceItem } from '@/types/grammar';
import { FacialExpression, HeadMovement } from '@/types/sign';
import { NonManualMarker } from './NonManualMarker';

/** 构造 token 的辅助函数 */
const tok = (word: string, pos: string): Token => ({ word, pos });

describe('NonManualMarker', () => {
  let marker: NonManualMarker;

  beforeEach(() => {
    // 每个用例使用全新的实例，避免 setRules 状态泄漏
    marker = new NonManualMarker();
  });

  /** mark 的第二参数 _items 当前未使用，统一传空数组 */
  const EMPTY_ITEMS: GlossSequenceItem[] = [];

  describe('疑问句检测', () => {
    it('含 qst 词性的疑问词应返回 question 表情 + 头势', () => {
      const result = marker.mark([tok('什么', 'qst')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.QUESTION);
      expect(result?.head_movement).toBe(HeadMovement.SLIGHT_NOD);
    });

    it('含"吗"字应识别为疑问句（基于词形）', () => {
      // "吗" 词性为 u，但 detectSentenceType 通过 word === '吗' 识别
      const result = marker.mark([tok('吗', 'u')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.QUESTION);
      expect(result?.head_movement).toBe(HeadMovement.SLIGHT_NOD);
    });

    it('非 qst 词性但属于疑问词表的词也应识别为疑问句', () => {
      // "哪里" 词性标为 x，但 Rewriter.isQuestionWord('哪里') === true
      const result = marker.mark([tok('哪里', 'x')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.QUESTION);
    });

    it('正常句子 + 疑问词应识别为疑问句', () => {
      const result = marker.mark(
        [tok('你', 'r'), tok('去', 'v'), tok('哪里', 'qst')],
        EMPTY_ITEMS,
      );
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.QUESTION);
      expect(result?.head_movement).toBe(HeadMovement.SLIGHT_NOD);
    });
  });

  describe('否定句检测', () => {
    it('含 neg 词性的否定词应返回 negation 表情 + 头势', () => {
      const result = marker.mark([tok('不', 'neg')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.NEGATIVE);
      expect(result?.head_movement).toBe(HeadMovement.SHAKE);
    });

    it('非 neg 词性但属于否定词表的词也应识别为否定句', () => {
      // "没有" 词性标为 x，但 Rewriter.isNegationWord('没有') === true
      const result = marker.mark([tok('没有', 'x')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.NEGATIVE);
      expect(result?.head_movement).toBe(HeadMovement.SHAKE);
    });

    it('正常句子 + 否定词应识别为否定句', () => {
      const result = marker.mark(
        [tok('我', 'r'), tok('不', 'neg'), tok('去', 'v')],
        EMPTY_ITEMS,
      );
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.NEGATIVE);
      expect(result?.head_movement).toBe(HeadMovement.SHAKE);
    });
  });

  describe('强调句检测', () => {
    it('含 emph 词性的强调词应返回 emphasis 表情 + 头势', () => {
      const result = marker.mark([tok('很', 'emph')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.EMPHASIS);
      expect(result?.head_movement).toBe(HeadMovement.NONE);
    });

    it('非 emph 词性但属于强调词表的词也应识别为强调句', () => {
      // "非常" 词性标为 x，但 Rewriter.isEmphasisWord('非常') === true
      const result = marker.mark([tok('非常', 'x')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.EMPHASIS);
      expect(result?.head_movement).toBe(HeadMovement.NONE);
    });

    it('正常句子 + 强调词应识别为强调句', () => {
      const result = marker.mark(
        [tok('我', 'r'), tok('很', 'emph'), tok('喜欢', 'v')],
        EMPTY_ITEMS,
      );
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.EMPHASIS);
    });
  });

  describe('陈述句', () => {
    it('无任何触发词时应返回 undefined', () => {
      const result = marker.mark(
        [tok('我', 'r'), tok('去', 'v'), tok('学校', 'n')],
        EMPTY_ITEMS,
      );
      expect(result).toBeUndefined();
    });

    it('仅含普通词的序列应返回 undefined', () => {
      const result = marker.mark([tok('是', 'v')], EMPTY_ITEMS);
      expect(result).toBeUndefined();
    });

    it('空 token 序列应返回 undefined（陈述句）', () => {
      const result = marker.mark([], EMPTY_ITEMS);
      expect(result).toBeUndefined();
    });
  });

  describe('优先级：疑问 > 否定 > 强调 > 陈述', () => {
    it('同时含疑问词与否定词时应判定为疑问句', () => {
      const result = marker.mark([tok('不', 'neg'), tok('什么', 'qst')], EMPTY_ITEMS);
      expect(result?.expression).toBe(FacialExpression.QUESTION);
    });

    it('同时含否定词与强调词时应判定为否定句', () => {
      const result = marker.mark([tok('不', 'neg'), tok('很', 'emph')], EMPTY_ITEMS);
      expect(result?.expression).toBe(FacialExpression.NEGATIVE);
    });

    it('同时含疑问词与强调词时应判定为疑问句', () => {
      const result = marker.mark([tok('什么', 'qst'), tok('很', 'emph')], EMPTY_ITEMS);
      expect(result?.expression).toBe(FacialExpression.QUESTION);
    });

    it('同时含三种触发词时应判定为疑问句（最高优先级）', () => {
      const result = marker.mark(
        [tok('不', 'neg'), tok('什么', 'qst'), tok('很', 'emph')],
        EMPTY_ITEMS,
      );
      expect(result?.expression).toBe(FacialExpression.QUESTION);
      expect(result?.head_movement).toBe(HeadMovement.SLIGHT_NOD);
    });

    it('仅含强调词时应判定为强调句', () => {
      const result = marker.mark([tok('很', 'emph')], EMPTY_ITEMS);
      expect(result?.expression).toBe(FacialExpression.EMPHASIS);
    });
  });

  describe('setRules() 自定义规则', () => {
    it('自定义规则应覆盖默认规则', () => {
      marker.setRules([
        {
          trigger: 'question',
          expression: 'custom_expr',
          head_movement: 'custom_head',
        },
      ]);

      const result = marker.mark([tok('什么', 'qst')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe('custom_expr');
      expect(result?.head_movement).toBe('custom_head');
    });

    it('未提供对应触发类型的自定义规则时应返回 undefined', () => {
      // 仅提供 question 规则，缺少 negation 规则
      marker.setRules([
        {
          trigger: 'question',
          expression: 'custom_expr',
          head_movement: 'custom_head',
        },
      ]);

      // 否定句类型在自定义规则中找不到对应规则
      const result = marker.mark([tok('不', 'neg')], EMPTY_ITEMS);
      expect(result).toBeUndefined();
    });

    it('自定义规则可覆盖全部三种触发类型', () => {
      marker.setRules([
        { trigger: 'question', expression: 'q_expr', head_movement: 'q_head' },
        { trigger: 'negation', expression: 'n_expr', head_movement: 'n_head' },
        { trigger: 'emphasis', expression: 'e_expr', head_movement: 'e_head' },
      ]);

      expect(marker.mark([tok('什么', 'qst')], EMPTY_ITEMS)?.expression).toBe('q_expr');
      expect(marker.mark([tok('不', 'neg')], EMPTY_ITEMS)?.expression).toBe('n_expr');
      expect(marker.mark([tok('很', 'emph')], EMPTY_ITEMS)?.expression).toBe('e_expr');
    });
  });

  describe('空数组 setRules 回退到默认规则', () => {
    it('setRules([]) 后应回退到默认规则', () => {
      // 先注入自定义规则，再用空数组回退
      marker.setRules([
        { trigger: 'question', expression: 'temp_expr', head_movement: 'temp_head' },
      ]);
      marker.setRules([]);

      const result = marker.mark([tok('什么', 'qst')], EMPTY_ITEMS);
      expect(result).toBeDefined();
      expect(result?.expression).toBe(FacialExpression.QUESTION);
      expect(result?.head_movement).toBe(HeadMovement.SLIGHT_NOD);
    });

    it('空数组回退后否定句与强调句仍使用默认规则', () => {
      marker.setRules([]);

      expect(marker.mark([tok('不', 'neg')], EMPTY_ITEMS)?.expression).toBe(
        FacialExpression.NEGATIVE,
      );
      expect(marker.mark([tok('很', 'emph')], EMPTY_ITEMS)?.expression).toBe(
        FacialExpression.EMPHASIS,
      );
    });

    it('空数组回退后陈述句仍返回 undefined', () => {
      marker.setRules([]);
      const result = marker.mark([tok('我', 'r'), tok('去', 'v')], EMPTY_ITEMS);
      expect(result).toBeUndefined();
    });
  });
});
