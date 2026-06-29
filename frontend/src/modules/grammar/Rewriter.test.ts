/**
 * @file Rewriter.test.ts
 * @description 语法重写器 Rewriter 单元测试
 *
 * 测试覆盖：
 *   - 宾语前移：方向/目标动词 + 名词 → 名词 + 动词
 *   - 否定词后置：否定词移到动词后
 *   - 疑问词后置：疑问词移到句末
 *   - 功能词去除：去除量词(q)、语气词(u)、介词(p)
 *   - 配置开关：单独关闭某条规则（构造器 + setConfig）
 *   - 空输入处理
 *   - 静态方法：isEmphasisWord / isNegationWord / isQuestionWord
 *   - 多规则组合执行（按优先级）
 */

import { describe, it, expect } from 'vitest';
import type { Token } from '@/types/grammar';
import { Rewriter } from './Rewriter';

/** 构造 token 的辅助函数 */
const tok = (word: string, pos: string): Token => ({ word, pos });

/** 提取 token 序列的词列表，便于断言 */
const words = (tokens: Token[]): string[] => tokens.map((t) => t.word);

describe('Rewriter', () => {
  describe('宾语前移', () => {
    it('应将方向动词后的名词前移到动词前（去医院 → 医院去）', () => {
      const rewriter = new Rewriter();
      const input = [tok('去', 'v'), tok('医院', 'n')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['医院', '去']);
    });

    it('应处理多个方向动词 + 名词的组合', () => {
      const rewriter = new Rewriter();
      const input = [tok('去', 'v'), tok('医院', 'n'), tok('回', 'v'), tok('学校', 'n')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['医院', '去', '学校', '回']);
    });

    it('非方向动词后的名词不应前移（看书 → 看书）', () => {
      const rewriter = new Rewriter();
      const input = [tok('看', 'v'), tok('书', 'n')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['看', '书']);
    });

    it('方向动词后不跟名词时不应前移', () => {
      const rewriter = new Rewriter();
      const input = [tok('我', 'r'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['我', '去']);
    });
  });

  describe('否定词后置', () => {
    it('应将否定词移到动词后（我不去 → 我去 不）', () => {
      const rewriter = new Rewriter();
      const input = [tok('我', 'r'), tok('不', 'neg'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['我', '去', '不']);
    });

    it('动词前的否定词应后置（不去 → 去 不）', () => {
      const rewriter = new Rewriter();
      const input = [tok('不', 'neg'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['去', '不']);
    });

    it('无动词时否定词应追加到末尾', () => {
      const rewriter = new Rewriter();
      const input = [tok('不', 'neg'), tok('我', 'r')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['我', '不']);
    });

    it('否定词已位于动词后时应保持不变', () => {
      const rewriter = new Rewriter();
      const input = [tok('去', 'v'), tok('不', 'neg')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['去', '不']);
    });
  });

  describe('疑问词后置', () => {
    it('应将疑问词移到句末（哪里去 → 去 哪里）', () => {
      const rewriter = new Rewriter();
      const input = [tok('哪里', 'qst'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['去', '哪里']);
    });

    it('应将句首疑问词移到句末（什么你去 → 你去 什么）', () => {
      const rewriter = new Rewriter();
      const input = [tok('什么', 'qst'), tok('你', 'r'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['你', '去', '什么']);
    });

    it('多个疑问词应按原顺序追加到句末', () => {
      const rewriter = new Rewriter();
      const input = [tok('什么', 'qst'), tok('哪里', 'qst'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['去', '什么', '哪里']);
    });

    it('非 qst 词性的疑问词（基于词表）也应后置', () => {
      // '谁' 在疑问词集合中，但此处词性标为 x，仍应被识别并后置
      const rewriter = new Rewriter();
      const input = [tok('谁', 'x'), tok('来', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['来', '谁']);
    });
  });

  describe('功能词去除', () => {
    it('应去除量词(q)、语气词(u)、介词(p)', () => {
      const rewriter = new Rewriter();
      const input = [
        tok('我', 'r'),
        tok('在', 'p'),
        tok('家', 'n'),
        tok('个', 'q'),
        tok('吧', 'u'),
      ];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['我', '家']);
    });

    it('应保留非功能词（名词、动词、代词、数词等）', () => {
      const rewriter = new Rewriter();
      const input = [tok('一', 'm'), tok('个', 'q'), tok('人', 'n')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['一', '人']);
    });

    it('应去除句中所有功能词', () => {
      const rewriter = new Rewriter();
      const input = [tok('在', 'p'), tok('学校', 'n'), tok('的', 'u'), tok('本', 'q')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['学校']);
    });
  });

  describe('配置开关', () => {
    it('关闭宾语前移时不应前移名词', () => {
      const rewriter = new Rewriter({ enableObjectFronting: false });
      const input = [tok('去', 'v'), tok('医院', 'n')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['去', '医院']);
    });

    it('关闭否定词后置时否定词应保持原位', () => {
      const rewriter = new Rewriter({ enableNegationRear: false });
      const input = [tok('我', 'r'), tok('不', 'neg'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['我', '不', '去']);
    });

    it('关闭疑问词后置时疑问词应保持原位', () => {
      const rewriter = new Rewriter({ enableQuestionRear: false });
      const input = [tok('哪里', 'qst'), tok('去', 'v')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['哪里', '去']);
    });

    it('关闭功能词去除时功能词应保留', () => {
      const rewriter = new Rewriter({ enableFunctionWordRemoval: false });
      const input = [tok('我', 'r'), tok('去', 'v'), tok('吧', 'u')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['我', '去', '吧']);
    });

    it('setConfig 应能动态关闭规则', () => {
      const rewriter = new Rewriter();
      // 初始默认开启，宾语前移生效
      expect(words(rewriter.rewrite([tok('去', 'v'), tok('医院', 'n')]))).toEqual([
        '医院',
        '去',
      ]);
      // 动态关闭宾语前移
      rewriter.setConfig({ enableObjectFronting: false });
      expect(words(rewriter.rewrite([tok('去', 'v'), tok('医院', 'n')]))).toEqual([
        '去',
        '医院',
      ]);
    });
  });

  describe('空输入处理', () => {
    it('空数组应原样返回空数组', () => {
      const rewriter = new Rewriter();
      const result = rewriter.rewrite([]);
      expect(result).toEqual([]);
    });

    it('空输入不应抛出异常', () => {
      const rewriter = new Rewriter();
      expect(() => rewriter.rewrite([])).not.toThrow();
    });
  });

  describe('静态方法', () => {
    describe('isQuestionWord', () => {
      it('应识别疑问词', () => {
        ['什么', '哪里', '哪儿', '谁', '怎么', '为什么', '几', '多少', '哪'].forEach(
          (w) => {
            expect(Rewriter.isQuestionWord(w)).toBe(true);
          },
        );
      });

      it('应拒绝非疑问词', () => {
        ['去', '是', '吗', '不', '很'].forEach((w) => {
          expect(Rewriter.isQuestionWord(w)).toBe(false);
        });
      });
    });

    describe('isNegationWord', () => {
      it('应识别否定词', () => {
        ['不', '没', '没有', '别', '勿', '未', '莫'].forEach((w) => {
          expect(Rewriter.isNegationWord(w)).toBe(true);
        });
      });

      it('应拒绝非否定词', () => {
        ['是', '去', '很', '什么'].forEach((w) => {
          expect(Rewriter.isNegationWord(w)).toBe(false);
        });
      });
    });

    describe('isEmphasisWord', () => {
      it('应识别强调词', () => {
        ['很', '非常', '太', '特别', '十分', '极其', '尤其', '更', '最'].forEach((w) => {
          expect(Rewriter.isEmphasisWord(w)).toBe(true);
        });
      });

      it('应拒绝非强调词', () => {
        ['是', '去', '不', '什么'].forEach((w) => {
          expect(Rewriter.isEmphasisWord(w)).toBe(false);
        });
      });
    });
  });

  describe('多规则组合执行（按优先级）', () => {
    it('应按优先级依次执行：宾语前移 > 否定词后置 > 疑问词后置 > 功能词去除', () => {
      // 输入：不(neg) 去(v) 医院(n) 什么(qst) 吗(u)
      // 优先级执行链：
      //   1. 宾语前移(100):  [不,去,医院,什么,吗] → [不,医院,去,什么,吗]
      //   2. 否定后置(90):   → [医院,去,不,什么,吗]   （"不"移到"去"之后）
      //   3. 疑问后置(80):   → [医院,去,不,吗,什么]   （"什么"移到句末；"吗"非 qst 不动）
      //   4. 功能词去除(50): → [医院,去,不,什么]      （"吗"被去除）
      const rewriter = new Rewriter();
      const input = [
        tok('不', 'neg'),
        tok('去', 'v'),
        tok('医院', 'n'),
        tok('什么', 'qst'),
        tok('吗', 'u'),
      ];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['医院', '去', '不', '什么']);
    });

    it('宾语前移须先于否定后置执行（验证优先级不可交换）', () => {
      // 若否定后置先执行，"不去医院"会变成"去 不 医院"，宾语无法再前移；
      // 正确优先级下应得到 "医院去 不"
      const rewriter = new Rewriter();
      const input = [tok('不', 'neg'), tok('去', 'v'), tok('医院', 'n')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['医院', '去', '不']);
    });

    it('全部规则关闭时应原样返回（仅保留功能词去除以外的内容）', () => {
      const rewriter = new Rewriter({
        enableObjectFronting: false,
        enableNegationRear: false,
        enableQuestionRear: false,
        enableFunctionWordRemoval: false,
      });
      const input = [tok('我', 'r'), tok('不', 'neg'), tok('去', 'v'), tok('吧', 'u')];
      const result = rewriter.rewrite(input);
      expect(words(result)).toEqual(['我', '不', '去', '吧']);
    });
  });
});
