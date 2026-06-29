/**
 * @file WorkerUtils.test.ts
 * @description 手势识别几何工具单元测试
 *
 * 测试覆盖：
 *   - dist 3D 距离计算
 *   - getFingerState 手指状态判断（伸直/弯曲/半弯）
 *   - matchFinger 约束匹配
 *   - matchRuleWithScore 置信度梯度
 *   - extractFeatures 特征提取
 */

import { describe, it, expect } from 'vitest';
import {
  dist,
  getFingerState,
  matchFinger,
  matchRule,
  matchRuleWithScore,
  extractFeatures,
  type FingerState,
  type FingerConstraint,
  type GestureRule,
  type HandFeatures,
} from './WorkerUtils';

/** 构造一个手指伸直的关键点序列（21 点） */
function makeExtendedFingerLandmarks(): { x: number; y: number; z: number }[] {
  // 简化：腕部在原点，mcp 在 (0, 0.1, 0)，tip 在 (0, 0.3, 0)
  // mcp→tip 与 mcp→wrist 反向，cos ≈ -1，伸直
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 21; i++) {
    pts.push({ x: 0, y: 0, z: 0 });
  }
  pts[0] = { x: 0, y: 0, z: 0 }; // wrist
  pts[5] = { x: 0, y: 0.1, z: 0 }; // 食指 mcp
  pts[8] = { x: 0, y: 0.3, z: 0 }; // 食指 tip（远离腕部）
  return pts;
}

/** 构造一个手指弯曲的关键点序列 */
function makeFoldedFingerLandmarks(): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 21; i++) {
    pts.push({ x: 0, y: 0, z: 0 });
  }
  pts[0] = { x: 0, y: 0, z: 0 }; // wrist
  pts[5] = { x: 0, y: 0.2, z: 0 }; // 食指 mcp
  pts[8] = { x: 0, y: 0.1, z: 0 }; // 食指 tip（贴近腕部，弯曲）
  return pts;
}

describe('WorkerUtils - dist', () => {
  it('计算 3D 距离正确', () => {
    expect(dist({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5, 6);
  });

  it('含 z 轴的距离', () => {
    expect(dist({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 })).toBeCloseTo(5, 6);
  });

  it('z 缺省时按 0 处理', () => {
    // Point3D 要求 z，此处显式传 0
    expect(dist({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5, 6);
  });

  it('相同点距离为 0', () => {
    expect(dist({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
  });
});

describe('WorkerUtils - getFingerState', () => {
  it('伸直的手指应返回 extended', () => {
    const landmarks = makeExtendedFingerLandmarks();
    const state = getFingerState(landmarks, 8, 6, 5, 0);
    expect(state).toBe('extended');
  });

  it('弯曲的手指应返回 folded', () => {
    const landmarks = makeFoldedFingerLandmarks();
    const state = getFingerState(landmarks, 8, 6, 5, 0);
    expect(state).toBe('folded');
  });
});

describe('WorkerUtils - matchFinger', () => {
  it('ext 约束只匹配 extended', () => {
    expect(matchFinger('extended', 'ext')).toBe(true);
    expect(matchFinger('folded', 'ext')).toBe(false);
    expect(matchFinger('half', 'ext')).toBe(false);
  });

  it('fold 约束只匹配 folded', () => {
    expect(matchFinger('folded', 'fold')).toBe(true);
    expect(matchFinger('extended', 'fold')).toBe(false);
  });

  it('!ext 约束匹配非 extended', () => {
    expect(matchFinger('folded', '!ext')).toBe(true);
    expect(matchFinger('half', '!ext')).toBe(true);
    expect(matchFinger('extended', '!ext')).toBe(false);
  });

  it('!fold 约束匹配非 folded', () => {
    expect(matchFinger('extended', '!fold')).toBe(true);
    expect(matchFinger('half', '!fold')).toBe(true);
    expect(matchFinger('folded', '!fold')).toBe(false);
  });

  it('any 约束匹配所有状态', () => {
    const states: FingerState[] = ['extended', 'folded', 'half'];
    for (const s of states) {
      expect(matchFinger(s, 'any')).toBe(true);
    }
  });
});

/** 构造 HandFeatures，fingers 为 tuple */
function makeFeatures(
  fingers: [FingerState, FingerState, FingerState, FingerState, FingerState],
  thumb_index_dist = 0.3,
  thumb_out = false,
  spread = 1.0,
): HandFeatures {
  return { fingers, thumb_index_dist, thumb_out, spread };
}

describe('WorkerUtils - matchRule', () => {
  it('所有约束满足时返回 true', () => {
    const features = makeFeatures(['extended', 'extended', 'folded', 'folded', 'folded'], 0.3);
    const rule: GestureRule = {
      fingers: ['ext', 'ext', 'fold', 'fold', 'fold'] as FingerConstraint[],
      thumb_index_dist_max: 0.5,
    };
    expect(matchRule(features, rule)).toBe(true);
  });

  it('任一约束不满足时返回 false', () => {
    const features = makeFeatures(['extended', 'folded', 'folded', 'folded', 'folded']);
    const rule: GestureRule = {
      fingers: ['ext', 'ext', 'fold', 'fold', 'fold'] as FingerConstraint[],
    };
    expect(matchRule(features, rule)).toBe(false);
  });

  it('距离超限返回 false', () => {
    const features = makeFeatures(['extended', 'extended', 'folded', 'folded', 'folded'], 0.8);
    const rule: GestureRule = {
      fingers: ['ext', 'ext', 'fold', 'fold', 'fold'] as FingerConstraint[],
      thumb_index_dist_max: 0.5,
    };
    expect(matchRule(features, rule)).toBe(false);
  });
});

describe('WorkerUtils - matchRuleWithScore', () => {
  it('不匹配返回 null', () => {
    const features = makeFeatures(['folded', 'extended', 'extended', 'extended', 'extended']);
    const rule: GestureRule = {
      fingers: ['ext', 'ext', 'ext', 'ext', 'ext'] as FingerConstraint[],
    };
    expect(matchRuleWithScore(features, rule)).toBeNull();
  });

  it('匹配返回 0.5~1.0 的置信度', () => {
    const features = makeFeatures(['extended', 'extended', 'extended', 'extended', 'extended']);
    const rule: GestureRule = {
      fingers: ['ext', 'ext', 'ext', 'ext', 'ext'] as FingerConstraint[],
    };
    const score = matchRuleWithScore(features, rule);
    expect(score).not.toBeNull();
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('5 指全 ext 命中 + 距离约束满足应得高分', () => {
    const features = makeFeatures(['extended', 'extended', 'extended', 'extended', 'extended'], 0.3);
    const rule: GestureRule = {
      fingers: ['ext', 'ext', 'ext', 'ext', 'ext'] as FingerConstraint[],
      thumb_index_dist_max: 0.5,
      thumb_index_dist_min: 0.1,
    };
    const score = matchRuleWithScore(features, rule);
    // 基础 0.5 + 5×0.08 + 0.05 + 0.05 = 1.0
    expect(score).toBeCloseTo(1.0, 2);
  });

  it('宽松约束（any）得分应低于精确约束', () => {
    const features = makeFeatures(['extended', 'extended', 'extended', 'extended', 'extended']);
    const preciseRule: GestureRule = {
      fingers: ['ext', 'ext', 'ext', 'ext', 'ext'] as FingerConstraint[],
    };
    const looseRule: GestureRule = {
      fingers: ['any', 'any', 'any', 'any', 'any'] as FingerConstraint[],
    };
    const preciseScore = matchRuleWithScore(features, preciseRule);
    const looseScore = matchRuleWithScore(features, looseRule);
    expect(preciseScore).toBeGreaterThan(looseScore!);
  });
});

describe('WorkerUtils - extractFeatures', () => {
  it('应返回 5 指状态和距离特征', () => {
    const landmarks = makeExtendedFingerLandmarks();
    const features = extractFeatures(landmarks);
    expect(features.fingers).toHaveLength(5);
    expect(typeof features.thumb_index_dist).toBe('number');
    expect(typeof features.spread).toBe('number');
    expect(typeof features.thumb_out).toBe('boolean');
  });
});
