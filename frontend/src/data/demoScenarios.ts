/**
 * 演示场景脚本
 *
 * 用于 SignBridge 双向沟通演示：预设若干「健听人 ↔ 听障人」对话场景，
 * 每个步骤的中文文本可通过 GrammarEngine.convert(text) 转换为
 * 手语词汇序列（GlossSequence），expectedGlosses 给出该步骤预期命中
 * 的 gloss_id（与 public/data/vocabulary.json 中的词条对应），便于
 * 在演示 / 测试时做断言或高亮校对。
 *
 * 说明：
 * - speaker 为 'hearing' 的步骤由健听人说出中文（语音 / 文本输入）；
 *   speaker 为 'deaf' 的步骤由听障人用手语表达（文本为手语对应的中文释义）。
 * - expectedGlosses 仅收录 vocabulary.json 中已存在的 gloss_id；
 *   若某步骤包含未收录的专有词汇（如「三楼」「内科」「不客气」），
 *   会在 note 中说明，expectedGlosses 相应省略或仅保留已收录词条。
 */

/** 演示场景分类 */
export type DemoScenarioCategory = 'medical' | 'government' | 'social' | 'education';

/** 演示场景中的单步对话 */
export interface DemoStep {
  /** 说话方：hearing=健听人（中文语音/文本），deaf=听障人（手语） */
  speaker: 'hearing' | 'deaf';
  /** 中文文本 */
  text: string;
  /** 预期手语词汇（gloss_id），对应 vocabulary.json 中的词条 */
  expectedGlosses?: string[];
  /** 场景说明 / 备注 */
  note?: string;
}

/** 演示场景 */
export interface DemoScenario {
  /** 场景唯一标识 */
  id: string;
  /** 场景标题 */
  title: string;
  /** 场景描述 */
  description: string;
  /** 场景分类 */
  category: DemoScenarioCategory;
  /** 对话步骤序列 */
  steps: DemoStep[];
}

/**
 * 预设演示场景集合
 *
 * gloss_id 对照（摘自 vocabulary.json）：
 *  你好=gloss_001  谢谢=gloss_002  再见=gloss_003  对不起=gloss_004
 *  没关系=gloss_005  请=gloss_008  医院=gloss_009  医生=gloss_010
 *  看病=gloss_011  不舒服=gloss_013  疼痛=gloss_014  钱=gloss_018
 *  身份证=gloss_019  签字=gloss_020  办事=gloss_021  窗口=gloss_022
 *  排队=gloss_023  表格=gloss_024  去=gloss_030  我=gloss_033  你=gloss_034
 *  我们=gloss_037  朋友=gloss_041  老师=gloss_042  想=gloss_043
 *  要=gloss_044  是=gloss_045  有=gloss_046  看=gloss_047  说=gloss_049
 *  今天=gloss_054  明天=gloss_055  字=gloss_144  工作=gloss_146
 *  课=gloss_113  书=gloss_114  问题=gloss_132  学生=gloss_137  同学=gloss_138
 *  欢迎=gloss_342  几=gloss_383  哪里=gloss_426  好=gloss_461  头=gloss_511
 */
export const demoScenarios: DemoScenario[] = [
  // ---------------------------------------------------------------- medical
  {
    id: 'medical-registration',
    title: '医院问诊',
    description: '健听患者前往医院挂号问诊，听障医护人员用手语接待并指引就诊科室。',
    category: 'medical',
    steps: [
      {
        speaker: 'hearing',
        text: '你好，我挂号',
        expectedGlosses: ['gloss_001', 'gloss_033'],
        note: '「挂号」暂无对应手语词条，演示时可结合「医院」与「办事」类手势近似表达。',
      },
      {
        speaker: 'deaf',
        text: '你好，哪里不舒服？',
        expectedGlosses: ['gloss_001', 'gloss_426', 'gloss_013'],
        note: '疑问句，引擎应在句子层标注抬眉等非手动标记。',
      },
      {
        speaker: 'hearing',
        text: '我头疼，想看医生',
        expectedGlosses: ['gloss_033', 'gloss_511', 'gloss_014', 'gloss_043', 'gloss_047', 'gloss_010'],
        note: '「头疼」分词为「头」+「疼痛」，对应 gloss_511 与 gloss_014。',
      },
      {
        speaker: 'deaf',
        text: '请到三楼内科',
        expectedGlosses: ['gloss_008'],
        note: '「到」「三楼」「内科」暂未收录，演示时可结合数字手势与方位指认补足。',
      },
      {
        speaker: 'hearing',
        text: '谢谢',
        expectedGlosses: ['gloss_002'],
      },
      {
        speaker: 'deaf',
        text: '不客气',
        note: '「不客气」暂无对应词条，演示时可使用近义词「没关系」(gloss_005) 表达。',
      },
    ],
  },

  // ------------------------------------------------------------- government
  {
    id: 'government-service',
    title: '政务大厅办事',
    description: '健听市民前往政务大厅办理业务，听障窗口工作人员用手语引导填表与签字。',
    category: 'government',
    steps: [
      {
        speaker: 'hearing',
        text: '你好，我要办事',
        expectedGlosses: ['gloss_001', 'gloss_033', 'gloss_044', 'gloss_021'],
      },
      {
        speaker: 'deaf',
        text: '请出示身份证',
        expectedGlosses: ['gloss_008', 'gloss_019'],
        note: '「出示」暂无对应词条，演示时以「给 / 递出」类手势近似表达。',
      },
      {
        speaker: 'hearing',
        text: '好，给你',
        expectedGlosses: ['gloss_461', 'gloss_034'],
      },
      {
        speaker: 'deaf',
        text: '请填表格',
        expectedGlosses: ['gloss_008', 'gloss_024'],
        note: '「填」暂无对应词条，演示时以书写动作示意。',
      },
      {
        speaker: 'hearing',
        text: '填好了，在哪里签字？',
        expectedGlosses: ['gloss_461', 'gloss_426', 'gloss_020'],
        note: '疑问句，引擎应在句子层标注疑问非手动标记。',
      },
      {
        speaker: 'deaf',
        text: '在这里签字，谢谢',
        expectedGlosses: ['gloss_020', 'gloss_002'],
        note: '「这里」暂无对应词条，演示时以食指指认当前位置示意。',
      },
    ],
  },

  // ----------------------------------------------------------------- social
  {
    id: 'social-meeting',
    title: '日常社交',
    description: '健听人与听障朋友街头偶遇，互致问候并约定下次见面。',
    category: 'social',
    steps: [
      {
        speaker: 'hearing',
        text: '你好，朋友！',
        expectedGlosses: ['gloss_001', 'gloss_041'],
      },
      {
        speaker: 'deaf',
        text: '你好，好久不见',
        expectedGlosses: ['gloss_001'],
        note: '「好久不见」暂无整词词条，演示时可拆分为「长时间」+「看」+「否定」近似表达。',
      },
      {
        speaker: 'hearing',
        text: '今天工作忙吗？',
        expectedGlosses: ['gloss_054', 'gloss_146'],
        note: '「忙」「吗」暂无对应词条，疑问语气由非手动标记（抬眉）体现。',
      },
      {
        speaker: 'deaf',
        text: '还好，你呢？',
        expectedGlosses: ['gloss_461', 'gloss_034'],
        note: '「还」「呢」暂无对应词条，疑问由非手动标记体现。',
      },
      {
        speaker: 'hearing',
        text: '我也很好，明天见',
        expectedGlosses: ['gloss_033', 'gloss_461', 'gloss_055'],
        note: '「见」暂无对应词条，演示时以挥手或食指对碰示意「见面」。',
      },
      {
        speaker: 'deaf',
        text: '再见',
        expectedGlosses: ['gloss_003'],
      },
    ],
  },

  // -------------------------------------------------------------- education
  {
    id: 'education-classroom',
    title: '课堂教学',
    description: '健听教师授课，听障学生用手语提问，教师予以回应，展示融合课堂的双向沟通。',
    category: 'education',
    steps: [
      {
        speaker: 'hearing',
        text: '同学们好，上课了',
        expectedGlosses: ['gloss_138', 'gloss_461', 'gloss_113'],
        note: '「上」「了」暂无对应词条，演示时以「课」配合开始手势示意。',
      },
      {
        speaker: 'deaf',
        text: '老师好',
        expectedGlosses: ['gloss_042', 'gloss_461'],
      },
      {
        speaker: 'hearing',
        text: '请打开书',
        expectedGlosses: ['gloss_008', 'gloss_114'],
        note: '「打开」暂无对应词条，演示时以双手翻开动作示意。',
      },
      {
        speaker: 'deaf',
        text: '老师，我有问题',
        expectedGlosses: ['gloss_042', 'gloss_033', 'gloss_046', 'gloss_132'],
      },
      {
        speaker: 'hearing',
        text: '好，请说',
        expectedGlosses: ['gloss_461', 'gloss_008', 'gloss_049'],
      },
      {
        speaker: 'deaf',
        text: '这个字怎么读？',
        expectedGlosses: ['gloss_144', 'gloss_130'],
        note: '「这个」「怎么」暂无对应词条，疑问由非手动标记体现；「读」对应 gloss_130。',
      },
    ],
  },
];

/**
 * 按 ID 获取演示场景。
 * @param id 场景唯一标识
 * @returns 命中的场景；未找到时返回 undefined
 */
export function getScenario(id: string): DemoScenario | undefined {
  return demoScenarios.find((scenario) => scenario.id === id);
}

/**
 * 获取全部预设演示场景。
 * @returns 场景数组的只读视图
 */
export function getAllScenarios(): readonly DemoScenario[] {
  return demoScenarios;
}

/**
 * 按分类筛选演示场景。
 * @param category 场景分类
 * @returns 属于该分类的场景数组
 */
export function getScenariosByCategory(category: DemoScenarioCategory): DemoScenario[] {
  return demoScenarios.filter((scenario) => scenario.category === category);
}
