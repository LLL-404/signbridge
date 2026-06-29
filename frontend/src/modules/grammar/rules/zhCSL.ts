// 中国手语（CSL）规则包
// 定义中文 ↔ 中国手语的语法规则、词汇映射、非手动规则

import type { GrammarRulePack, GrammarRule, GlossMapping, NonManualRule } from '@/types/grammar';
import { FacialExpression, HeadMovement } from '@/types/sign';

/**
 * 中国手语语法重写规则集
 * 规则按优先级排序，高优先级先执行
 */
const rules: GrammarRule[] = [
  {
    id: 'csl_object_fronting',
    name: '宾语前移',
    description: '方向/目标动词后的名词宾语前移到动词前（如"去医院" → "医院去"）',
    pattern: [{ pos: 'v' }, { pos: 'n' }],
    action: { type: 'reorder', params: { mode: 'object_fronting' } },
    priority: 100,
  },
  {
    id: 'csl_negation_rear',
    name: '否定词后置',
    description: '否定词移到动词后（如"我不去" → "我去 不"）',
    pattern: [{ pos: 'neg' }],
    action: { type: 'reorder', params: { mode: 'negation_rear' } },
    priority: 90,
  },
  {
    id: 'csl_question_rear',
    name: '疑问词后置',
    description: '疑问词移到句末',
    pattern: [{ pos: 'qst' }],
    action: { type: 'reorder', params: { mode: 'question_rear' } },
    priority: 80,
  },
  {
    id: 'csl_function_word_removal',
    name: '去除功能词',
    description: '去除量词、语气词、部分介词',
    pattern: [{ pos: 'q' }],
    action: { type: 'remove', params: { pos_list: ['q', 'u', 'p'] } },
    priority: 50,
  },
];

/**
 * 基础词汇映射表（中文词 → gloss_id）
 * 完整词汇库从 vocabulary.json 加载到 IndexedDB
 * 此处仅保留规则包级别的补充映射，用于词汇库未覆盖的常用词
 */
const mappings: GlossMapping[] = [
  // 代词
  { chinese: '我', gloss_id: 'gloss_pronoun_wo' },
  { chinese: '你', gloss_id: 'gloss_pronoun_ni' },
  { chinese: '他', gloss_id: 'gloss_pronoun_ta' },
  { chinese: '她', gloss_id: 'gloss_pronoun_ta' },
  { chinese: '我们', gloss_id: 'gloss_pronoun_women' },
  { chinese: '你们', gloss_id: 'gloss_pronoun_nimen' },
  { chinese: '他们', gloss_id: 'gloss_pronoun_tamen' },
  // 常用动词
  { chinese: '是', gloss_id: 'gloss_verb_shi' },
  { chinese: '有', gloss_id: 'gloss_verb_you' },
  { chinese: '去', gloss_id: 'gloss_verb_qu' },
  { chinese: '来', gloss_id: 'gloss_verb_lai' },
  { chinese: '看', gloss_id: 'gloss_verb_kan' },
  { chinese: '说', gloss_id: 'gloss_verb_shuo' },
  // 疑问词
  { chinese: '什么', gloss_id: 'gloss_qst_shenme' },
  { chinese: '谁', gloss_id: 'gloss_qst_shui' },
  { chinese: '哪里', gloss_id: 'gloss_qst_nali' },
  { chinese: '怎么', gloss_id: 'gloss_qst_zenme' },
  { chinese: '为什么', gloss_id: 'gloss_qst_weishenme' },
  // 否定词
  { chinese: '不', gloss_id: 'gloss_neg_bu' },
  { chinese: '没', gloss_id: 'gloss_neg_mei' },
  { chinese: '没有', gloss_id: 'gloss_neg_meiyou' },
];

/**
 * 非手动规则集（中国手语）
 * 定义不同句子类型对应的表情和头势
 */
const nonManualRules: NonManualRule[] = [
  {
    trigger: 'question',
    expression: FacialExpression.QUESTION,
    head_movement: HeadMovement.SLIGHT_NOD,
  },
  {
    trigger: 'negation',
    expression: FacialExpression.NEGATIVE,
    head_movement: HeadMovement.SHAKE,
  },
  {
    trigger: 'emphasis',
    expression: FacialExpression.EMPHASIS,
    head_movement: HeadMovement.NONE,
  },
  {
    trigger: 'conditional',
    expression: FacialExpression.CONFUSED,
    head_movement: HeadMovement.SLIGHT_NOD,
  },
];

/**
 * 中国手语规则包
 * 包含中文 ↔ 中国手语的完整规则集
 */
export const zhCSLRulePack: GrammarRulePack = {
  id: 'zhCSL',
  name: '中国手语',
  source_lang: 'zh',
  target_lang: 'csl',
  rules,
  mappings,
  non_manual_rules: nonManualRules,
};

/**
 * 疑问词列表（供外部模块使用）
 */
export const ZH_CSL_QUESTION_WORDS = ['什么', '哪里', '哪儿', '谁', '怎么', '为什么', '几', '多少', '哪'];

/**
 * 否定词列表（供外部模块使用）
 */
export const ZH_CSL_NEGATION_WORDS = ['不', '没', '没有', '别', '勿', '未', '莫'];

/**
 * 强调词列表（供外部模块使用）
 */
export const ZH_CSL_EMPHASIS_WORDS = ['很', '非常', '太', '特别', '十分', '极其', '尤其', '更', '最'];
