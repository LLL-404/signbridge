/**
 * @file SignLanguageRules.ts
 * @description 手语动作规律规则的抽象
 *
 * 规律来源：分析现有词汇库（CommonVocabulary 等）中手形、位置、运动、表情
 * 与语义的对应关系，提炼出可复用的语义标签映射表与词汇参数模板。
 *
 * 主要内容：
 *   1. 四张语义映射表（手形/位置/运动/表情 → 语义标签数组）
 *   2. 六类词汇参数模板（代词/问候/疑问/否定/情感/数字）
 *   3. 模板应用函数 applyVocabularyTemplate
 */

import type { SignGloss } from '@/types/sign';
import {
  HandShape,
  HandLocation,
  Movement,
  PalmOrientation,
  FacialExpression,
  HeadMovement,
} from '@/types/sign';

/** 词汇参数模板名称 */
export type VocabularyTemplateName =
  | 'PRONOUN_TEMPLATE'
  | 'GREETING_TEMPLATE'
  | 'QUESTION_TEMPLATE'
  | 'NEGATION_TEMPLATE'
  | 'EMOTION_TEMPLATE'
  | 'NUMBER_TEMPLATE';

/**
 * 手形 → 语义标签映射
 * 规律来源：归纳现有词汇中手形与语义类别的对应关系
 * 覆盖全部 17 个 HandShape 枚举值
 */
export const HANDSHAPE_SEMANTIC_MAP: Record<HandShape, string[]> = {
  // 开放/交流类：问候、感谢、否定
  [HandShape.OPEN_5]: ['开放', '交流', '问候', '感谢', '否定'],
  // 确定/力量类：是、学、对不起
  [HandShape.FIST_A]: ['确定', '力量', '动作'],
  // 指代/指向类：代词、疑问"谁"
  [HandShape.INDEX_POINT]: ['指代', '指向', '代词'],
  // 评价类：好
  [HandShape.THUMB_UP]: ['评价', '积极'],
  // 抓取/接触类：吃、有、名字、开心
  [HandShape.O_SHAPE]: ['抓取', '接触', '动作'],
  // 承托/平移类：帮助、今天
  [HandShape.FLAT_B]: ['承托', '平移', '展示'],
  // 勾连/关系类：朋友
  [HandShape.HOOK]: ['勾连', '关系'],
  // V 形：看（视觉相关）
  [HandShape.V_SHAPE]: ['视觉', '观察'],
  // C 形：医院、电话（容器/弧形）
  [HandShape.C_SHAPE]: ['容器', '弧形'],
  // 数字手形
  [HandShape.THREE]: ['数字', '三'],
  [HandShape.FOUR]: ['数字', '四'],
  [HandShape.SIX]: ['数字', '六'],
  [HandShape.SEVEN]: ['数字', '七'],
  [HandShape.EIGHT]: ['数字', '八'],
  [HandShape.NINE]: ['数字', '九'],
  [HandShape.TEN]: ['数字', '十'],
  // 角手势
  [HandShape.HORNS]: ['角形', '特殊'],
};

/**
 * 手部位置 → 语义标签映射
 * 规律来源：身体不同区域承载的语义功能差异
 * 覆盖全部 13 个 HandLocation 枚举值
 */
export const LOCATION_SEMANTIC_MAP: Record<HandLocation, string[]> = {
  // 中性位置：起始/过渡
  [HandLocation.NEUTRAL]: ['中性', '过渡', '前方'],
  // 胸部中心：自我/内心
  [HandLocation.CHEST_CENTER]: ['自我', '内心', '主体'],
  // 胸部两侧：群体/范围
  [HandLocation.CHEST_LEFT]: ['左侧', '群体'],
  [HandLocation.CHEST_RIGHT]: ['右侧', '群体'],
  // 肩部：他人/侧方
  [HandLocation.SHOULDER_LEFT]: ['左侧', '他人'],
  [HandLocation.SHOULDER_RIGHT]: ['右侧', '他人'],
  // 面部：交流/认知
  [HandLocation.FACE_LEVEL]: ['交流', '认知', '面部'],
  // 眼部：视觉/蓝色
  [HandLocation.EYE_LEVEL]: ['视觉', '眼部'],
  // 嘴部：口部动作/吃/红色
  [HandLocation.MOUTH_LEVEL]: ['口部', '进食', '红色'],
  // 下巴：表达/言语/绿色
  [HandLocation.CHIN_LEVEL]: ['表达', '言语', '绿色'],
  // 额头：思考/黄色/黑色
  [HandLocation.FOREHEAD_LEVEL]: ['思考', '额头', '黄色'],
  // 腹部：饥饿/生理
  [HandLocation.ABDOMEN_LEVEL]: ['腹部', '生理', '饥饿'],
  // 腰部：起始位置
  [HandLocation.WAIST_LEVEL]: ['腰部', '起始'],
};

/**
 * 运动轨迹 → 语义标签映射
 * 规律来源：运动方向与动作类型对应的语义倾向
 * 覆盖全部 20 个 Movement 枚举值
 */
export const MOVEMENT_SEMANTIC_MAP: Record<Movement, string[]> = {
  // 静止：指代/状态
  [Movement.STATIC]: ['静止', '指代', '状态'],
  // 向上：积极/上升
  [Movement.UPWARD]: ['积极', '上升', '问候'],
  // 向下：消极/下降
  [Movement.DOWNWARD]: ['消极', '下降', '结束'],
  // 左右：方向
  [Movement.LEFTWARD]: ['向左', '方向'],
  [Movement.RIGHTWARD]: ['向右', '方向'],
  // 弧形
  [Movement.UPWARD_ARC]: ['上升弧', '过渡'],
  [Movement.DOWNWARD_ARC]: ['下降弧', '过渡'],
  // 直线
  [Movement.HORIZONTAL_LINE]: ['水平', '展示', '范围'],
  [Movement.VERTICAL_LINE]: ['垂直', '展示'],
  // 圆形：循环/反复
  [Movement.CIRCULAR]: ['循环', '反复', '范围'],
  // 锯齿
  [Movement.ZIGZAG]: ['锯齿', '复杂'],
  // 朝向身体：吸引/过去
  [Movement.TOWARD_BODY]: ['吸引', '过去', '接近'],
  // 远离身体：传递/未来
  [Movement.AWAY_FROM_BODY]: ['传递', '未来', '外向'],
  // 摇摆：否定
  [Movement.WAVE]: ['摇摆', '否定', '拒绝'],
  // 触碰：强调
  [Movement.TAP]: ['触碰', '强调', '当前'],
  [Movement.TAP_TWICE]: ['双触', '强调', '复数'],
  // 向前：未来/明天
  [Movement.FORWARD]: ['向前', '未来', '明天'],
  // 勾连：关系
  [Movement.HOOK_TOGETHER]: ['勾连', '关系', '连接'],
  // 扭转：手语专有
  [Movement.WAVE_TWIST]: ['扭转', '手语'],
  // 左右摇摆：疑问
  [Movement.SIDE_TO_SIDE]: ['左右', '疑问', '不确定'],
};

/**
 * 面部表情 → 语义标签映射
 * 规律来源：表情在非手动信号中的语义功能
 * 覆盖全部 9 个 FacialExpression 枚举值
 */
export const EXPRESSION_SEMANTIC_MAP: Record<FacialExpression, string[]> = {
  // 中性：陈述
  [FacialExpression.NEUTRAL]: ['中性', '陈述'],
  // 开心：问候/感谢/积极
  [FacialExpression.HAPPY]: ['开心', '问候', '感谢', '积极'],
  // 难过：歉意/悲伤
  [FacialExpression.SAD]: ['难过', '歉意', '悲伤'],
  // 生气：愤怒
  [FacialExpression.ANGRY]: ['生气', '愤怒'],
  // 惊讶：意外
  [FacialExpression.SURPRISED]: ['惊讶', '意外'],
  // 困惑
  [FacialExpression.CONFUSED]: ['困惑', '不确定'],
  // 疑问
  [FacialExpression.QUESTION]: ['疑问', '询问'],
  // 否定
  [FacialExpression.NEGATIVE]: ['否定', '拒绝'],
  // 强调
  [FacialExpression.EMPHASIS]: ['强调', '重要'],
};

/**
 * 词汇参数模板默认值
 * 每个模板提供 manual 与 non_manual 的部分字段，用于快速构造词汇
 */
export const VOCABULARY_TEMPLATES: Record<
  VocabularyTemplateName,
  { manual: Partial<SignGloss['manual']>; non_manual: Partial<SignGloss['non_manual']> }
> = {
  // 代词模板：食指指向 + 静止
  PRONOUN_TEMPLATE: {
    manual: {
      handshape_start: HandShape.INDEX_POINT,
      handshape_end: HandShape.INDEX_POINT,
      movement: Movement.STATIC,
      palm_orientation: PalmOrientation.INWARD,
      is_two_handed: false,
      dominant_hand: 'right',
    },
    non_manual: {
      expression: FacialExpression.NEUTRAL,
      head_movement: HeadMovement.NONE,
    },
  },
  // 问候模板：开放手形 + 向上/向外 + 开心
  GREETING_TEMPLATE: {
    manual: {
      handshape_start: HandShape.OPEN_5,
      handshape_end: HandShape.OPEN_5,
      movement: Movement.UPWARD,
      palm_orientation: PalmOrientation.INWARD,
      is_two_handed: false,
      dominant_hand: 'right',
    },
    non_manual: {
      expression: FacialExpression.HAPPY,
      head_movement: HeadMovement.SLIGHT_NOD,
    },
  },
  // 疑问模板：疑问表情 + 头部倾斜
  QUESTION_TEMPLATE: {
    manual: {
      movement: Movement.SIDE_TO_SIDE,
      palm_orientation: PalmOrientation.UPWARD,
      is_two_handed: false,
      dominant_hand: 'right',
    },
    non_manual: {
      expression: FacialExpression.QUESTION,
      head_movement: HeadMovement.TILT,
    },
  },
  // 否定模板：开放→握拳 + 摇摆 + 否定表情
  NEGATION_TEMPLATE: {
    manual: {
      handshape_start: HandShape.OPEN_5,
      handshape_end: HandShape.FIST_A,
      movement: Movement.WAVE,
      palm_orientation: PalmOrientation.OUTWARD,
      is_two_handed: false,
      dominant_hand: 'right',
    },
    non_manual: {
      expression: FacialExpression.NEGATIVE,
      head_movement: HeadMovement.SHAKE,
    },
  },
  // 情感模板：双手 + 静止 + 对应表情
  EMOTION_TEMPLATE: {
    manual: {
      movement: Movement.STATIC,
      is_two_handed: true,
      dominant_hand: 'right',
    },
    non_manual: {
      head_movement: HeadMovement.NONE,
    },
  },
  // 数字模板：对应数字手形 + 静止
  NUMBER_TEMPLATE: {
    manual: {
      location_start: HandLocation.CHEST_CENTER,
      location_end: HandLocation.CHEST_CENTER,
      movement: Movement.STATIC,
      palm_orientation: PalmOrientation.OUTWARD,
      is_two_handed: false,
      dominant_hand: 'right',
    },
    non_manual: {
      expression: FacialExpression.NEUTRAL,
      head_movement: HeadMovement.NONE,
    },
  },
};

/**
 * 应用词汇参数模板：合并模板默认值与传入覆盖值
 * @param name 模板名称
 * @param overrides manual 和 non_manual 的覆盖字段
 * @returns 合并后的 manual 和 non_manual 对象
 */
export function applyVocabularyTemplate(
  name: VocabularyTemplateName,
  overrides: {
    manual?: Partial<SignGloss['manual']>;
    non_manual?: Partial<SignGloss['non_manual']>;
  },
): { manual: Partial<SignGloss['manual']>; non_manual: Partial<SignGloss['non_manual']> } {
  const template = VOCABULARY_TEMPLATES[name];
  return {
    manual: { ...template.manual, ...overrides.manual },
    non_manual: { ...template.non_manual, ...overrides.non_manual },
  };
}
