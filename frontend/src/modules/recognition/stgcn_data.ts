/**
 * ST-GCN 手势识别 —— 合成训练数据生成器
 *
 * 由于缺乏真实标注数据，使用参数化模板 + 随机增强生成合成训练样本。
 * 每种手势定义"模板关键点"（基于手部几何），通过添加随机噪声、平移、
 * 旋转、缩放生成变体，确保模型能学习区分不同手势的空间结构。
 *
 * 输出格式：
 *   x: (num_samples, 30, 21, 2) — 30 帧、21 关键点、2 坐标(x,y)
 *   y: (num_samples, 10) — one-hot 编码
 */

import * as tf from '@tensorflow/tfjs';

// ===== 模型维度常量 =====

/** 手部关键点数（MediaPipe Hands 21 点） */
export const NUM_KEYPOINTS = 21;
/** 时序帧数 */
export const NUM_FRAMES = 30;
/** 坐标维度（x, y） */
export const COORD_DIM = 2;
/** 手势类别数 */
export const NUM_CLASSES = 10;

// ===== 手势标签 =====

/** 手势标签列表（索引对应模型输出类别） */
export const GESTURE_LABELS = [
  'fist',
  'open_palm',
  'point_up',
  'thumb_up',
  'thumb_down',
  'victory',
  'i_love_you',
  'pinch',
  'three',
  'horn',
] as const;

/** 手势中文显示名映射 */
export const GESTURE_CHINESE: Record<string, string> = {
  fist: '✊ 握拳',
  open_palm: '🖐 张开手掌',
  point_up: '☝️ 食指上指',
  thumb_up: '👍 点赞',
  thumb_down: '👎 反对',
  victory: '✌️ 胜利',
  i_love_you: '🤟 我爱你',
  pinch: '🤏 捏合',
  three: '3️⃣ 三',
  horn: '🤘 角',
};

// ===== 手部骨骼图定义 =====

/**
 * MediaPipe 手部 21 关键点的骨骼连接（无向边）
 * 拇指: 0-1-2-3-4, 食指: 0-5-6-7-8, 中指: 0-9-10-11-12,
 * 无名指: 0-13-14-15-16, 小指: 0-17-18-19-20, 掌间: 5-9, 9-13, 13-17
 */
export const HAND_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // 拇指
  [0, 5], [5, 6], [6, 7], [7, 8],          // 食指
  [0, 9], [9, 10], [10, 11], [11, 12],     // 中指
  [0, 13], [13, 14], [14, 15], [15, 16],   // 无名指
  [0, 17], [17, 18], [18, 19], [19, 20],   // 小指
  [5, 9], [9, 13], [13, 17],               // 掌间连接
];

// ===== 手势模板关键点 =====

/** 开放手形（五指伸展），以腕部为原点，y 负方向为指尖方向 */
const OPEN_PALM: number[][] = [
  [0, 0], [-0.04, -0.02], [-0.07, -0.04], [-0.09, -0.06], [-0.10, -0.08],
  [-0.03, -0.08], [-0.03, -0.12], [-0.03, -0.15], [-0.03, -0.18],
  [0, -0.08], [0, -0.13], [0, -0.16], [0, -0.19],
  [0.03, -0.08], [0.03, -0.12], [0.03, -0.15], [0.03, -0.17],
  [0.06, -0.07], [0.06, -0.10], [0.06, -0.12], [0.06, -0.14],
];

/** 折叠单根手指：将 PIP/DIP/TIP 向掌心方向弯曲 */
function foldFinger(
  template: number[][],
  mcpIdx: number,
  pipIdx: number,
  dipIdx: number,
  tipIdx: number,
): number[][] {
  const r = template.map((p) => [...p]);
  const mcp = r[mcpIdx];
  r[pipIdx] = [mcp[0], mcp[1] + 0.02];
  r[dipIdx] = [mcp[0], mcp[1] + 0.04];
  r[tipIdx] = [mcp[0], mcp[1] + 0.05];
  return r;
}

/** 折叠拇指：将 IP/TIP 收回掌心 */
function foldThumb(template: number[][]): number[][] {
  const r = template.map((p) => [...p]);
  r[3] = [-0.05, -0.01];
  r[4] = [-0.03, 0.0];
  return r;
}

/** 生成握拳模板：所有手指折叠 */
function makeFist(): number[][] {
  let t = foldThumb(OPEN_PALM);
  t = foldFinger(t, 5, 6, 7, 8);
  t = foldFinger(t, 9, 10, 11, 12);
  t = foldFinger(t, 13, 14, 15, 16);
  t = foldFinger(t, 17, 18, 19, 20);
  return t;
}

/** 食指上指：仅食指伸展 */
function makePointUp(): number[][] {
  let t = foldThumb(OPEN_PALM);
  t = foldFinger(t, 9, 10, 11, 12);
  t = foldFinger(t, 13, 14, 15, 16);
  t = foldFinger(t, 17, 18, 19, 20);
  return t;
}

/** 点赞：握拳 + 拇指上指 */
function makeThumbUp(): number[][] {
  const t = makeFist();
  t[1] = [-0.02, -0.03];
  t[2] = [-0.01, -0.06];
  t[3] = [0, -0.09];
  t[4] = [0, -0.12];
  return t;
}

/** 反对：握拳 + 拇指下指 */
function makeThumbDown(): number[][] {
  const t = makeFist();
  t[1] = [-0.02, 0.03];
  t[2] = [-0.01, 0.06];
  t[3] = [0, 0.09];
  t[4] = [0, 0.12];
  return t;
}

/** 胜利：食指 + 中指伸展 */
function makeVictory(): number[][] {
  let t = foldThumb(OPEN_PALM);
  t = foldFinger(t, 13, 14, 15, 16);
  t = foldFinger(t, 17, 18, 19, 20);
  return t;
}

/** 我爱你：拇指 + 食指 + 小指伸展 */
function makeILoveYou(): number[][] {
  let t = OPEN_PALM.map((p) => [...p]);
  t = foldFinger(t, 9, 10, 11, 12);
  t = foldFinger(t, 13, 14, 15, 16);
  return t;
}

/** 捏合：拇指与食指尖相接，其余折叠 */
function makePinch(): number[][] {
  let t = OPEN_PALM.map((p) => [...p]);
  t = foldFinger(t, 9, 10, 11, 12);
  t = foldFinger(t, 13, 14, 15, 16);
  t = foldFinger(t, 17, 18, 19, 20);
  const meet = [-0.05, -0.08];
  t[3] = [-0.06, -0.05];
  t[4] = meet;
  t[6] = [-0.03, -0.12];
  t[7] = [-0.04, -0.10];
  t[8] = meet;
  return t;
}

/** 三：食指 + 中指 + 无名指伸展 */
function makeThree(): number[][] {
  let t = foldThumb(OPEN_PALM);
  t = foldFinger(t, 17, 18, 19, 20);
  return t;
}

/** 角：食指 + 小指伸展 */
function makeHorn(): number[][] {
  let t = foldThumb(OPEN_PALM);
  t = foldFinger(t, 9, 10, 11, 12);
  t = foldFinger(t, 13, 14, 15, 16);
  return t;
}

/** 手势模板定义（gloss_id → 21×2 关键点） */
export const GESTURE_TEMPLATES: Record<string, number[][]> = {
  fist: makeFist(),
  open_palm: OPEN_PALM.map((p) => [...p]),
  point_up: makePointUp(),
  thumb_up: makeThumbUp(),
  thumb_down: makeThumbDown(),
  victory: makeVictory(),
  i_love_you: makeILoveYou(),
  pinch: makePinch(),
  three: makeThree(),
  horn: makeHorn(),
};

// ===== 数据增强 =====

/** 生成单条时序样本：对模板施加随机增强并生成 NUM_FRAMES 帧 */
function generateSequence(template: number[][]): number[][][] {
  // 序列级随机增强参数（同一序列内保持一致）
  const angle = (Math.random() - 0.5) * 0.3;       // 旋转 ±0.15 弧度
  const scale = 0.85 + Math.random() * 0.3;        // 缩放 0.85-1.15
  const tx = (Math.random() - 0.5) * 0.08;         // 平移 x
  const ty = (Math.random() - 0.5) * 0.08;         // 平移 y
  const noiseLevel = 0.003 + Math.random() * 0.005; // 噪声幅度
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    // 帧间微小抖动（模拟手部轻微移动）
    const jitterX = (Math.random() - 0.5) * 0.002;
    const jitterY = (Math.random() - 0.5) * 0.002;

    const frame: number[][] = template.map((kp) => {
      let [x, y] = kp;
      x *= scale;
      y *= scale;
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      x = rx + tx + jitterX + (Math.random() - 0.5) * noiseLevel;
      y = ry + ty + jitterY + (Math.random() - 0.5) * noiseLevel;
      return [x, y];
    });
    frames.push(frame);
  }
  return frames;
}

/** 将类别索引转为 one-hot 向量 */
function oneHot(index: number, numClasses: number): number[] {
  const v = new Array(numClasses).fill(0);
  v[index] = 1;
  return v;
}

/**
 * 生成完整训练数据集
 * 对每种手势生成 samplesPerGesture 个增强样本
 *
 * @param samplesPerGesture 每种手势的样本数，默认 120
 * @returns x: (N, 30, 21, 2), y: (N, 10) one-hot
 */
export function generateTrainingData(samplesPerGesture = 120): {
  x: tf.Tensor4D;
  y: tf.Tensor2D;
} {
  const xData: number[][][][] = [];
  const yData: number[][] = [];

  for (let g = 0; g < GESTURE_LABELS.length; g++) {
    const glossId = GESTURE_LABELS[g];
    const template = GESTURE_TEMPLATES[glossId];
    for (let s = 0; s < samplesPerGesture; s++) {
      xData.push(generateSequence(template));
      yData.push(oneHot(g, NUM_CLASSES));
    }
  }

  // 打乱数据集
  const indices = xData.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const shuffledX = indices.map((i) => xData[i]);
  const shuffledY = indices.map((i) => yData[i]);

  return {
    x: tf.tensor4d(shuffledX.flat(4), [shuffledX.length, NUM_FRAMES, NUM_KEYPOINTS, COORD_DIM], 'float32'),
    y: tf.tensor2d(shuffledY, [shuffledY.length, NUM_CLASSES], 'float32'),
  };
}
