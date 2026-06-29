// 手语数据类型定义

/**
 * 手语词汇数据格式
 * 描述一个手语词条的完整信息，含手动与非手动特征
 */
export interface SignGloss {
  gloss_id: string;
  chinese: string;
  english?: string;
  category: string;
  difficulty: 1 | 2 | 3;
  manual: {
    handshape_start: string;
    handshape_end: string;
    location_start: string;
    location_end: string;
    movement: string;
    palm_orientation: string;
    is_two_handed: boolean;
    dominant_hand: 'left' | 'right';
  };
  non_manual: {
    expression: string;
    head_movement: string;
    body_movement?: string;
  };
  duration_ms: number;
  source: string;
  keypoints?: number[][];
}

/** 手形枚举（中国手语常用手形） */
export enum HandShape {
  FLAT_B = 'flat_b',
  V_SHAPE = 'v_shape',
  FIST_A = 'fist_a',
  OPEN_5 = 'open_5',
  THUMB_UP = 'thumb_up',
  INDEX_POINT = 'index_point',
  C_SHAPE = 'c_shape',
  O_SHAPE = 'o_shape',
  HORNS = 'horns',
  THREE = 'three',
  FOUR = 'four',
  SIX = 'six',
  SEVEN = 'seven',
  EIGHT = 'eight',
  NINE = 'nine',
  TEN = 'ten',
}

/** 手指关节角度（单关节三自由度） */
export interface FingerPose {
  mcp: number; // 掌指关节角度
  pip: number; // 近端指间关节角度
  dip: number; // 远端指间关节角度
}

/** 手形定义（5 根手指的关节角度） */
export interface HandShapeDefinition {
  shape: HandShape;
  fingers: [FingerPose, FingerPose, FingerPose, FingerPose, FingerPose]; // 拇指、食指、中指、无名指、小指
}

/** 手部位置枚举（相对身体的空间区域） */
export enum HandLocation {
  NEUTRAL = 'neutral',
  CHEST_CENTER = 'chest_center',
  CHEST_LEFT = 'chest_left',
  CHEST_RIGHT = 'chest_right',
  SHOULDER_LEFT = 'shoulder_left',
  SHOULDER_RIGHT = 'shoulder_right',
  FACE_LEVEL = 'face_level',
  EYE_LEVEL = 'eye_level',
  MOUTH_LEVEL = 'mouth_level',
  CHIN_LEVEL = 'chin_level',
  FOREHEAD_LEVEL = 'forehead_level',
  ABDOMEN_LEVEL = 'abdomen_level',
  WAIST_LEVEL = 'waist_level',
}

/** 运动轨迹枚举 */
export enum Movement {
  STATIC = 'static',
  UPWARD = 'upward',
  DOWNWARD = 'downward',
  LEFTWARD = 'leftward',
  RIGHTWARD = 'rightward',
  UPWARD_ARC = 'upward_arc',
  DOWNWARD_ARC = 'downward_arc',
  HORIZONTAL_LINE = 'horizontal_line',
  VERTICAL_LINE = 'vertical_line',
  CIRCULAR = 'circular',
  ZIGZAG = 'zigzag',
  TOWARD_BODY = 'toward_body',
  AWAY_FROM_BODY = 'away_from_body',
}

/** 手掌朝向枚举 */
export enum PalmOrientation {
  INWARD = 'inward',
  OUTWARD = 'outward',
  UPWARD = 'upward',
  DOWNWARD = 'downward',
  LEFTWARD = 'leftward',
  RIGHTWARD = 'rightward',
}

/** 面部表情枚举 */
export enum FacialExpression {
  NEUTRAL = 'neutral',
  HAPPY = 'happy',
  SAD = 'sad',
  ANGRY = 'angry',
  SURPRISED = 'surprised',
  CONFUSED = 'confused',
  QUESTION = 'question',
  NEGATIVE = 'negative',
  EMPHASIS = 'emphasis',
}

/** 头部动作枚举 */
export enum HeadMovement {
  NONE = 'none',
  NOD = 'nod',
  SHAKE = 'shake',
  TILT_LEFT = 'tilt_left',
  TILT_RIGHT = 'tilt_right',
  SLIGHT_NOD = 'slight_nod',
}
