/**
 * Worker 共享工具：几何特征提取 + 规则匹配 + 手势库加载
 * 被 recognition.worker.ts 和 RuleRecognizer.ts 共用
 */

import type { ClassificationResult } from '@/types/recognition';

/** 手指状态 */
export type FingerState = 'extended' | 'folded' | 'half';

/** JSON 规则中的手指约束 */
export type FingerConstraint = 'ext' | 'fold' | '!ext' | '!fold' | 'any';

/** 手势规则定义 */
export interface GestureRule {
  fingers: FingerConstraint[];
  thumb_index_dist_max?: number;
  thumb_index_dist_min?: number;
}

/** 手势定义（JSON 格式） */
export interface GestureDefinition {
  id: string;
  chinese: string;
  emoji: string;
  category?: string;
  rule: GestureRule;
}

/** 手势库文件格式 */
interface GestureLibrary {
  version: string;
  description?: string;
  gestures: GestureDefinition[];
}

/** 手部几何特征 */
export interface HandFeatures {
  fingers: [FingerState, FingerState, FingerState, FingerState, FingerState];
  thumb_index_dist: number;
  thumb_out: boolean;
  spread: number;
}

/** 3D 关键点类型 */
interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** 计算两点 3D 距离（含 z 轴，解决手指前后向混淆） */
export function dist(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 计算向量 a→b 与 a→c 的夹角余弦（纯几何，不依赖坐标轴方向） */
function cosineAngle(a: Point3D, b: Point3D, c: Point3D): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v1z = (b.z ?? 0) - (a.z ?? 0);
  const v2x = c.x - a.x;
  const v2y = c.y - a.y;
  const v2z = (c.z ?? 0) - (a.z ?? 0);
  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const n1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
  const n2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);
  if (n1 < 1e-6 || n2 < 1e-6) return 1; // 退化情况视为同向
  return Math.max(-1, Math.min(1, dot / (n1 * n2)));
}

/**
 * 判断单根手指状态（纯几何，不依赖 y 轴方向）
 * - extended：指尖远离腕部（tip-wrist 距离 > mcp-wrist × 1.4）且指尖相对 mcp 向外延伸
 * - folded：指尖贴近掌心（tip-mcp 距离 < mcp-wrist × 0.6）或指尖方向指向腕部
 * - half：介于两者之间
 *
 * 用"指尖→mcp 与 mcp→wrist 的夹角"替代原 y 轴硬编码：
 *   - 手指伸直时夹角接近 180°（mcp→tip 与 mcp→wrist 反向），cos ≈ -1
 *   - 手指弯曲时夹角接近 0°（mcp→tip 与 mcp→wrist 同向），cos ≈ 1
 */
export function getFingerState(
  landmarks: Point3D[],
  tipIdx: number,
  // pipIdx 不再使用（改用角度判断），保留参数以维持调用兼容性
  _pipIdx: number,
  mcpIdx: number,
  wristIdx = 0,
): FingerState {
  const tip = landmarks[tipIdx];
  const mcp = landmarks[mcpIdx];
  const wrist = landmarks[wristIdx];

  const tipToWrist = dist(tip, wrist);
  const mcpToWrist = dist(mcp, wrist);
  const tipToMcp = dist(tip, mcp);

  // 指尖→mcp 向量 与 mcp→wrist 向量的夹角余弦
  // 伸直时：mcp→tip 与 mcp→wrist 反向（指尖远离腕部），夹角≈180°，cos≈-1
  // 弯曲时：mcp→tip 与 mcp→wrist 同向（指尖朝向腕部），夹角≈0°，cos≈1
  const cosAngle = cosineAngle(mcp, tip, wrist);

  // 伸直：cos < -0.3（夹角 > 107.5°，指尖背离腕部）
  if (tipToWrist > mcpToWrist * 1.4 && cosAngle < -0.3) {
    return 'extended';
  }
  // 弯曲：cos > 0.3（夹角 < 72.5°，指尖朝向腕部）
  if (tipToMcp < mcpToWrist * 0.6 || cosAngle > 0.3) {
    return 'folded';
  }
  return 'half';
}

/** 判断拇指状态 */
export function getThumbState(
  landmarks: { x: number; y: number; z: number }[],
): { state: FingerState; isOut: boolean } {
  const tip = landmarks[4];
  const mcp = landmarks[2];
  const cmc = landmarks[1];
  const wrist = landmarks[0];

  const tipToCmc = dist(tip, cmc);
  const cmcToWrist = dist(cmc, wrist);
  const tipToWrist = dist(tip, wrist);

  let state: FingerState = 'half';
  if (tipToCmc > cmcToWrist * 1.4 && tipToWrist > cmcToWrist * 1.6) {
    state = 'extended';
  } else if (tipToCmc < cmcToWrist * 0.8) {
    state = 'folded';
  }

  const indexMcp = landmarks[5];
  const thumbToIndex = dist(mcp, indexMcp);
  const palmSize = dist(landmarks[0], landmarks[9]);
  const isOut = thumbToIndex > palmSize * 0.45;

  return { state, isOut };
}

/** 从 21 关键点提取几何特征 */
export function extractFeatures(landmarks: { x: number; y: number; z: number }[]): HandFeatures {
  const thumb = getThumbState(landmarks);
  const index = getFingerState(landmarks, 8, 6, 5);
  const middle = getFingerState(landmarks, 12, 10, 9);
  const ring = getFingerState(landmarks, 16, 14, 13);
  const pinky = getFingerState(landmarks, 20, 18, 17);

  const palmSize = dist(landmarks[0], landmarks[9]);
  const thumb_index_dist = dist(landmarks[4], landmarks[8]) / palmSize;
  const spread =
    (dist(landmarks[4], landmarks[8]) +
      dist(landmarks[8], landmarks[12]) +
      dist(landmarks[12], landmarks[16]) +
      dist(landmarks[16], landmarks[20])) /
    palmSize;

  return {
    fingers: [thumb.state, index, middle, ring, pinky],
    thumb_index_dist,
    thumb_out: thumb.isOut,
    spread,
  };
}

/** 检查单个手指是否满足约束 */
export function matchFinger(state: FingerState, constraint: FingerConstraint): boolean {
  switch (constraint) {
    case 'ext':
      return state === 'extended';
    case 'fold':
      return state === 'folded';
    case '!ext':
      return state !== 'extended';
    case '!fold':
      return state !== 'folded';
    case 'any':
      return true;
    default:
      return false;
  }
}

/** 检查特征是否匹配规则 */
export function matchRule(features: HandFeatures, rule: GestureRule): boolean {
  for (let i = 0; i < 5; i++) {
    if (!matchFinger(features.fingers[i], rule.fingers[i])) {
      return false;
    }
  }
  if (rule.thumb_index_dist_max !== undefined) {
    if (features.thumb_index_dist > rule.thumb_index_dist_max) return false;
  }
  if (rule.thumb_index_dist_min !== undefined) {
    if (features.thumb_index_dist < rule.thumb_index_dist_min) return false;
  }
  return true;
}

/**
 * 带置信度梯度的规则匹配
 * - 不匹配返回 null
 * - 匹配返回 0.5~1.0 的置信度：
 *   - 基础分 0.5（命中即得）
 *   - 每根精确约束（ext/fold）的手指匹配 +0.08（最多 5 根 = +0.4）
 *   - 距离约束满足 +0.1（最多 1 个）
 *
 * 这样 5 指全中且距离满足 = 1.0，边界情况（!ext/!fold 这种宽松约束）置信度更低
 */
export function matchRuleWithScore(
  features: HandFeatures,
  rule: GestureRule,
): number | null {
  let score = 0.5; // 命中基础分

  for (let i = 0; i < 5; i++) {
    const constraint = rule.fingers[i];
    if (!matchFinger(features.fingers[i], constraint)) {
      return null;
    }
    // 精确约束（ext/fold）给更高分，宽松约束（!ext/!fold/any）不给分
    if (constraint === 'ext' || constraint === 'fold') {
      score += 0.08;
    }
  }

  if (rule.thumb_index_dist_max !== undefined) {
    if (features.thumb_index_dist > rule.thumb_index_dist_max) return null;
    score += 0.05;
  }
  if (rule.thumb_index_dist_min !== undefined) {
    if (features.thumb_index_dist < rule.thumb_index_dist_min) return null;
    score += 0.05;
  }

  return Math.min(1, score);
}

/** 加载手势库（默认 + 用户自定义） */
export async function loadGestureLibrary(): Promise<GestureDefinition[]> {
  let gestures: GestureDefinition[] = [];

  // 默认手势库
  try {
    const res = await fetch('/gestures.json');
    const lib: GestureLibrary = await res.json();
    gestures = lib.gestures;
  } catch (err) {
    console.error('[workerUtils] 加载手势库失败:', err);
  }

  // 用户自定义手势（IndexedDB）
  try {
    const custom = await new Promise<GestureDefinition[]>((resolve) => {
      const req = indexedDB.open('signbridge-custom-gestures', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('gestures', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('gestures', 'readonly');
        const getAll = tx.objectStore('gestures').getAll();
        getAll.onsuccess = () => resolve(getAll.result as GestureDefinition[]);
        getAll.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
    if (custom.length > 0) {
      gestures = [...gestures, ...custom];
    }
  } catch {
    // 静默忽略
  }

  return gestures;
}

/** 识别结果类型（重导出） */
export type { ClassificationResult };
