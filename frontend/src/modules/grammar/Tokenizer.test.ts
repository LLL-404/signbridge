import { describe, it, expect } from 'vitest';
import { PosTagger } from './Tokenizer';

describe('PosTagger', () => {
  const tagger = new PosTagger();

  describe('tagWord - predefined word lists', () => {
    it('should tag pronouns as "r"', () => {
      expect(tagger.tagWord('我')).toBe('r');
      expect(tagger.tagWord('你')).toBe('r');
      expect(tagger.tagWord('他')).toBe('r');
      expect(tagger.tagWord('我们')).toBe('r');
      expect(tagger.tagWord('自己')).toBe('r');
    });

    it('should tag verbs as "v"', () => {
      expect(tagger.tagWord('是')).toBe('v');
      expect(tagger.tagWord('有')).toBe('v');
      expect(tagger.tagWord('看')).toBe('v');
      expect(tagger.tagWord('喜欢')).toBe('v');
      expect(tagger.tagWord('可以')).toBe('v');
    });

    it('should tag classifiers as "q"', () => {
      expect(tagger.tagWord('个')).toBe('q');
      expect(tagger.tagWord('只')).toBe('q');
      expect(tagger.tagWord('本')).toBe('q');
      expect(tagger.tagWord('张')).toBe('q');
    });

    it('should tag particles as "u"', () => {
      expect(tagger.tagWord('吗')).toBe('u');
      expect(tagger.tagWord('呢')).toBe('u');
      expect(tagger.tagWord('吧')).toBe('u');
      expect(tagger.tagWord('啊')).toBe('u');
    });

    it('should tag prepositions as "p"', () => {
      expect(tagger.tagWord('在')).toBe('p');
      expect(tagger.tagWord('到')).toBe('p');
      expect(tagger.tagWord('从')).toBe('p');
      expect(tagger.tagWord('把')).toBe('p');
    });

    it('should tag negations as "neg"', () => {
      expect(tagger.tagWord('不')).toBe('neg');
      expect(tagger.tagWord('没')).toBe('neg');
      expect(tagger.tagWord('没有')).toBe('neg');
      expect(tagger.tagWord('别')).toBe('neg');
    });

    it('should tag question words as "qst"', () => {
      expect(tagger.tagWord('什么')).toBe('qst');
      expect(tagger.tagWord('谁')).toBe('qst');
      expect(tagger.tagWord('怎么')).toBe('qst');
      expect(tagger.tagWord('为什么')).toBe('qst');
    });

    it('should tag emphasis words as "emph"', () => {
      expect(tagger.tagWord('很')).toBe('emph');
      expect(tagger.tagWord('非常')).toBe('emph');
      expect(tagger.tagWord('太')).toBe('emph');
      expect(tagger.tagWord('最')).toBe('emph');
    });
  });

  describe('tagWord - category-based tagging', () => {
    it('should tag words with verb category as "v"', () => {
      expect(tagger.tagWord('跑', '动词')).toBe('v');
      expect(tagger.tagWord('跳', 'verb')).toBe('v');
      expect(tagger.tagWord('走', '动作动词')).toBe('v');
    });

    it('should tag words with noun category as "n"', () => {
      expect(tagger.tagWord('苹果', '名词')).toBe('n');
      expect(tagger.tagWord('书', 'noun')).toBe('n');
      expect(tagger.tagWord('桌子', '普通名词')).toBe('n');
    });

    it('should tag words with adjective category as "a"', () => {
      expect(tagger.tagWord('红', '形容词')).toBe('a');
      expect(tagger.tagWord('大', 'adj')).toBe('a');
    });

    it('should tag words with number category as "m"', () => {
      expect(tagger.tagWord('一', '数词')).toBe('m');
      expect(tagger.tagWord('百', 'num')).toBe('m');
    });
  });

  describe('tagWord - default tagging', () => {
    it('should tag unknown words without category as "x"', () => {
      expect(tagger.tagWord('麒麟')).toBe('x');
      expect(tagger.tagWord('未知词')).toBe('x');
    });

    it('should tag unknown words with unrecognized category as "x"', () => {
      expect(tagger.tagWord('xyz', 'unknown_category')).toBe('x');
    });
  });

  describe('tagWord - priority', () => {
    it('should prioritize predefined word lists over category', () => {
      expect(tagger.tagWord('我', '名词')).toBe('r');
      expect(tagger.tagWord('是', '名词')).toBe('v');
      expect(tagger.tagWord('不', '动词')).toBe('neg');
    });
  });
});
