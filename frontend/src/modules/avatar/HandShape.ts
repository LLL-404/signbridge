// 手形定义与插值函数
// 定义中国手语常用手形的手指关节角度，并提供手形之间的插值能力
import { HandShape } from '@/types/sign';
import type { HandShapeDefinition, FingerPose } from '@/types/sign';

/** 角度转弧度 */
const deg = (d: number): number => (d * Math.PI) / 180;

/** 创建 FingerPose 辅助函数 */
const fp = (mcp: number, pip: number, dip: number): FingerPose => ({ mcp, pip, dip });

/**
 * 全部手形定义表
 * 手指顺序：[拇指, 食指, 中指, 无名指, 小指]
 * 每根手指包含 MCP（掌指）/ PIP（近端指间）/ DIP（远端指间）三个关节角度（弧度）
 * 角度值参考人体手部自然活动范围，屈曲为正
 */
const HAND_SHAPE_DEFINITIONS: Record<HandShape, HandShapeDefinition> = {
  // 张开五指：所有关节伸展
  [HandShape.OPEN_5]: {
    shape: HandShape.OPEN_5,
    fingers: [fp(0, 0, 0), fp(0, 0, 0), fp(0, 0, 0), fp(0, 0, 0), fp(0, 0, 0)],
  },
  // 握拳 A：拇指压在食指上方，其余四指完全屈曲
  [HandShape.FIST_A]: {
    shape: HandShape.FIST_A,
    fingers: [
      fp(deg(30), deg(60), deg(60)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
    ],
  },
  // 食指指向：仅食指伸展，其余屈曲
  [HandShape.INDEX_POINT]: {
    shape: HandShape.INDEX_POINT,
    fingers: [
      fp(deg(20), deg(40), deg(40)),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
    ],
  },
  // V 形（剪刀手）：食指与中指伸展，其余屈曲
  [HandShape.V_SHAPE]: {
    shape: HandShape.V_SHAPE,
    fingers: [
      fp(deg(20), deg(40), deg(40)),
      fp(0, 0, 0),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
    ],
  },
  // 平掌 B：五指并拢伸直，拇指微屈
  [HandShape.FLAT_B]: {
    shape: HandShape.FLAT_B,
    fingers: [
      fp(0, deg(10), deg(10)),
      fp(0, deg(5), deg(5)),
      fp(0, deg(5), deg(5)),
      fp(0, deg(5), deg(5)),
      fp(0, deg(5), deg(5)),
    ],
  },
  // 竖拇指：仅拇指伸展，其余四指屈曲
  [HandShape.THUMB_UP]: {
    shape: HandShape.THUMB_UP,
    fingers: [
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
    ],
  },
  // C 形：五指微屈形成 C 字弧
  [HandShape.C_SHAPE]: {
    shape: HandShape.C_SHAPE,
    fingers: [
      fp(deg(20), deg(30), deg(30)),
      fp(deg(30), deg(40), deg(30)),
      fp(deg(30), deg(40), deg(30)),
      fp(deg(30), deg(40), deg(30)),
      fp(deg(30), deg(40), deg(30)),
    ],
  },
  // O 形：拇指与食指尖相触形成 O 字
  [HandShape.O_SHAPE]: {
    shape: HandShape.O_SHAPE,
    fingers: [
      fp(deg(40), deg(50), deg(50)),
      fp(deg(60), deg(70), deg(60)),
      fp(deg(60), deg(70), deg(60)),
      fp(deg(60), deg(70), deg(60)),
      fp(deg(60), deg(70), deg(60)),
    ],
  },
  // 数字三：拇指、食指、中指伸展，其余屈曲
  [HandShape.THREE]: {
    shape: HandShape.THREE,
    fingers: [
      fp(0, 0, 0),
      fp(0, 0, 0),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
    ],
  },
  // 角手势（摇滚）：食指与小指伸展，其余屈曲
  [HandShape.HORNS]: {
    shape: HandShape.HORNS,
    fingers: [
      fp(deg(20), deg(40), deg(40)),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(0, 0, 0),
    ],
  },
  // 以下手形未在 Skeleton3D 中定义，使用合理默认值
  [HandShape.FOUR]: {
    shape: HandShape.FOUR,
    fingers: [
      fp(deg(20), deg(40), deg(40)),
      fp(0, 0, 0),
      fp(0, 0, 0),
      fp(0, 0, 0),
      fp(0, 0, 0),
    ],
  },
  [HandShape.SIX]: {
    shape: HandShape.SIX,
    fingers: [
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(0, 0, 0),
    ],
  },
  [HandShape.SEVEN]: {
    shape: HandShape.SEVEN,
    fingers: [
      fp(deg(20), deg(40), deg(40)),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(0, 0, 0),
    ],
  },
  [HandShape.EIGHT]: {
    shape: HandShape.EIGHT,
    fingers: [
      fp(0, 0, 0),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(0, 0, 0),
    ],
  },
  [HandShape.NINE]: {
    shape: HandShape.NINE,
    fingers: [
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(0, 0, 0),
    ],
  },
  [HandShape.TEN]: {
    shape: HandShape.TEN,
    fingers: [
      fp(0, 0, 0),
      fp(0, 0, 0),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
      fp(deg(90), deg(100), deg(90)),
    ],
  },
  // 勾连手形：食指弯曲如钩，其余四指完全屈曲，用于"朋友"等勾连动作
  [HandShape.HOOK]: {
    shape: HandShape.HOOK,
    fingers: [
      fp(deg(30), deg(40), deg(40)),     // 拇指微屈贴向食指
      fp(deg(60), deg(90), deg(60)),     // 食指中节弯曲形成钩状
      fp(deg(90), deg(100), deg(90)),    // 中指屈曲
      fp(deg(90), deg(100), deg(90)),    // 无名指屈曲
      fp(deg(90), deg(100), deg(90)),    // 小指屈曲
    ],
  },
};

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 缓动函数（ease-in-out） */
export function easeInOut(t: number): number {
  // 限制范围 [0,1]，避免越界
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}

/** 获取指定手形的定义 */
export function getHandShapeDefinition(shape: HandShape): HandShapeDefinition {
  return HAND_SHAPE_DEFINITIONS[shape] ?? HAND_SHAPE_DEFINITIONS[HandShape.OPEN_5];
}

/** 单个 FingerPose 插值 */
function interpolateFinger(from: FingerPose, to: FingerPose, t: number): FingerPose {
  return {
    mcp: lerp(from.mcp, to.mcp, t),
    pip: lerp(from.pip, to.pip, t),
    dip: lerp(from.dip, to.dip, t),
  };
}

/**
 * 手形插值：在两个手形之间逐关节线性插值并应用缓动
 * @param from 起始手形
 * @param to 目标手形
 * @param progress 进度 0.0~1.0
 * @returns 插值后的手形定义（shape 取目标手形）
 */
export function interpolateHandshape(
  from: HandShape,
  to: HandShape,
  progress: number,
): HandShapeDefinition {
  const fromDef = getHandShapeDefinition(from);
  const toDef = getHandShapeDefinition(to);
  const t = easeInOut(progress);
  const fingers = fromDef.fingers.map((f, i) =>
    interpolateFinger(f, toDef.fingers[i], t),
  ) as HandShapeDefinition['fingers'];
  return { shape: to, fingers };
}

// ===== VRM 手指骨骼映射 =====
import type { Vec3 } from '@/types/avatar';

/** VRM 手指骨骼名（单手 15 个） */
const FINGER_BONE_NAMES = [
  'ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal',
  'IndexProximal', 'IndexIntermediate', 'IndexDistal',
  'MiddleProximal', 'MiddleIntermediate', 'MiddleDistal',
  'RingProximal', 'RingIntermediate', 'RingDistal',
  'LittleProximal', 'LittleIntermediate', 'LittleDistal',
] as const;

/**
 * 将 HandShape 转为 VRM 手指骨骼旋转
 * @param shape 手形枚举
 * @param side 'left' | 'right'
 * @returns VRM 骨骼名 → 旋转（仅 X 轴屈曲，Y/Z 为 0）
 */
export function handShapeToBoneRotations(
  shape: HandShape,
  side: 'left' | 'right',
): Partial<Record<string, Vec3>> {
  const def = getHandShapeDefinition(shape);
  const prefix = side === 'left' ? 'left' : 'right';
  const result: Partial<Record<string, Vec3>> = {};

  def.fingers.forEach((finger, i) => {
    const baseName = FINGER_BONE_NAMES[i * 3];     // proximal/metacarpal
    const midName = FINGER_BONE_NAMES[i * 3 + 1];  // intermediate/proximal
    const tipName = FINGER_BONE_NAMES[i * 3 + 2];  // distal

    // 拇指：mcp→Metacarpal, pip→Proximal, dip→Distal
    // 其他指：mcp→Proximal, pip→Intermediate, dip→Distal
    result[`${prefix}${baseName}`] = { x: finger.mcp, y: 0, z: 0 };
    result[`${prefix}${midName}`] = { x: finger.pip, y: 0, z: 0 };
    result[`${prefix}${tipName}`] = { x: finger.dip, y: 0, z: 0 };
  });

  return result;
}
