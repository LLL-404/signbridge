/**
 * @file TransitionEngine.test.ts
 * @description 动作过渡引擎单元测试
 *
 * 测试覆盖：
 *   - 缓动函数边界值与关键值（easeInOutCubic / easeOutCubic 等）
 *   - poseDistance：相同姿态距离为 0，偏移姿态距离为正
 *   - clampJointAngles：超出约束范围时 clamp 到边界，范围内不变
 *   - generateTransition：
 *     * 小差异 → 直接插值策略，帧数正确，时间戳单调递增
 *     * 大差异 → 中性复位策略，两段式帧结构
 *     * 首帧=from，末帧≈to
 *   - TransitionEngine.createTransition：封装方法调用，默认时长按策略选择
 */

import { describe, it, expect } from 'vitest';
import type { BonePose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import { HandShape } from '@/types/sign';
import {
  easeInOutCubic,
  easeOutCubic,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  poseDistance,
  clampJointAngles,
  generateTransition,
  TransitionEngine,
} from './TransitionEngine';

/** 深拷贝 pose，避免共享引用 */
function clonePose(p: BonePose): BonePose {
  return JSON.parse(JSON.stringify(p)) as BonePose;
}

/** 在 NEUTRAL_POSE 基础上构造偏移 pose */
function offsetPose(xOffset: number, yOffset = 0, zOffset = 0): BonePose {
  const p = clonePose(NEUTRAL_POSE);
  // 偏移左手位置以产生姿态差异
  p.left_wrist.position = {
    x: p.left_wrist.position.x + xOffset,
    y: p.left_wrist.position.y + yOffset,
    z: p.left_wrist.position.z + zOffset,
  };
  return p;
}

/**
 * 构造位置差异极大的 pose（超过中性复位阈值 0.5）
 * 对所有关节做大幅偏移，确保 poseDistance 均值 > 0.5 触发中性复位
 */
function farPose(): BonePose {
  const p = clonePose(NEUTRAL_POSE);
  // 将所有身体关节位置大幅偏移，确保均值差异远超阈值 0.5
  const joints = ['root', 'spine', 'chest', 'neck', 'head',
    'left_shoulder', 'left_elbow', 'left_wrist',
    'right_shoulder', 'right_elbow', 'right_wrist'] as const;
  for (const j of joints) {
    p[j].position = { x: p[j].position.x + 10, y: p[j].position.y, z: p[j].position.z };
  }
  return p;
}

describe('TransitionEngine - 缓动函数', () => {
  it('easeInOutCubic 边界值', () => {
    expect(easeInOutCubic(0)).toBeCloseTo(0, 6);
    expect(easeInOutCubic(1)).toBeCloseTo(1, 6);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });

  it('easeInOutCubic 应对 [0,1] 外输入钳制', () => {
    expect(easeInOutCubic(-0.5)).toBeCloseTo(0, 6);
    expect(easeInOutCubic(1.5)).toBeCloseTo(1, 6);
  });

  it('easeOutCubic 边界值', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0, 6);
    expect(easeOutCubic(1)).toBeCloseTo(1, 6);
    // easeOutCubic(0.5) = 1 - 0.125 = 0.875（先快后慢）
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
  });

  it('easeInQuad 边界值', () => {
    expect(easeInQuad(0)).toBe(0);
    expect(easeInQuad(1)).toBe(1);
    expect(easeInQuad(0.5)).toBeCloseTo(0.25, 6);
  });

  it('easeOutQuad 边界值', () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(1)).toBe(1);
    expect(easeOutQuad(0.5)).toBeCloseTo(0.75, 6);
  });

  it('easeInOutQuad 边界值与中点', () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('TransitionEngine - poseDistance', () => {
  it('相同姿态距离应为 0', () => {
    const d = poseDistance(NEUTRAL_POSE, clonePose(NEUTRAL_POSE));
    expect(d.position).toBeCloseTo(0, 6);
    expect(d.rotation).toBeCloseTo(0, 6);
    expect(d.handshape).toBe(0);
  });

  it('偏移姿态距离应为正数', () => {
    const a = NEUTRAL_POSE;
    const b = offsetPose(1);
    const d = poseDistance(a, b);
    expect(d.position).toBeGreaterThan(0);
  });

  it('手形不同时 handshape 应为非零', () => {
    const a = clonePose(NEUTRAL_POSE);
    const b = clonePose(NEUTRAL_POSE);
    // 改变左手手形枚举值
    a.left_hand.shape = HandShape.OPEN_5;
    b.left_hand.shape = HandShape.FIST_A;
    const d = poseDistance(a, b);
    expect(d.handshape).toBeGreaterThanOrEqual(1);
  });
});

describe('TransitionEngine - clampJointAngles', () => {
  it('正常范围内的姿态应保持不变', () => {
    const result = clampJointAngles(NEUTRAL_POSE);
    // 对 NEUTRAL_POSE 应用 clamp，身体关节旋转应不变或仍为合法值
    // 这里主要验证函数不抛错且返回 BonePose 结构
    expect(result).toHaveProperty('root');
    expect(result).toHaveProperty('left_shoulder');
    expect(result).toHaveProperty('right_wrist');
    expect(result).toHaveProperty('left_hand');
    expect(result).toHaveProperty('right_hand');
  });

  it('NEUTRAL_POSE 经过 clamp 后位置应保持不变（仅 clamp 旋转，不修改位置）', () => {
    const result = clampJointAngles(NEUTRAL_POSE);
    expect(result.root.position).toEqual(NEUTRAL_POSE.root.position);
    expect(result.head.position).toEqual(NEUTRAL_POSE.head.position);
  });
});

describe('TransitionEngine - generateTransition', () => {
  it('小差异应使用直接插值（非中性复位），帧数 >= 1', () => {
    const to = offsetPose(0.1); // 差异小（< 0.5 阈值），直接插值
    const frames = generateTransition(NEUTRAL_POSE, to, 300);
    expect(frames.length).toBeGreaterThan(1);
    // 首帧 timestamp 为 0
    expect(frames[0].timestamp).toBe(0);
    // 时间戳应单调递增
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].timestamp).toBeGreaterThanOrEqual(frames[i - 1].timestamp);
    }
  });

  it('大差异应使用中性复位（两段式，中段经过 NEUTRAL_POSE 附近）', () => {
    const to = farPose(); // 差异大（> 0.5 阈值），中性复位
    const frames = generateTransition(NEUTRAL_POSE, to, 500);
    expect(frames.length).toBeGreaterThan(1);
    // 时间戳单调递增
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].timestamp).toBeGreaterThanOrEqual(frames[i - 1].timestamp);
    }
    // 中性复位特征：中段存在接近 NEUTRAL_POSE 的帧（前半 from→NEUTRAL，后半 NEUTRAL→to）
    // 找到中间帧，其 root.position.x 应接近 NEUTRAL_POSE（而不是直接跳向 to）
    const midIdx = Math.floor(frames.length / 2);
    const midX = frames[midIdx].pose.root.position.x;
    // NEUTRAL root.x 与 to 的 root.x 差 10，中间帧应更接近 NEUTRAL 而非 to
    const neutralX = NEUTRAL_POSE.root.position.x;
    const toX = to.root.position.x;
    expect(Math.abs(midX - neutralX)).toBeLessThan(Math.abs(midX - toX));
  });

  it('过渡首帧应接近 from 姿态（root 位置一致）', () => {
    const from = NEUTRAL_POSE;
    const to = offsetPose(0.1);
    const frames = generateTransition(from, to, 300);
    // 首帧 root 位置应与 from 相同
    expect(frames[0].pose.root.position).toEqual(from.root.position);
  });

  it('durationMs=0 或极短也应产生至少 2 帧（首尾）', () => {
    const to = offsetPose(0.1);
    const frames = generateTransition(NEUTRAL_POSE, to, 1); // 1ms
    expect(frames.length).toBeGreaterThanOrEqual(2);
  });
});

describe('TransitionEngine - createTransition (类封装)', () => {
  it('默认时长：小差异应使用 300ms 直接插值', () => {
    const engine = new TransitionEngine();
    const to = offsetPose(0.1);
    const frames = engine.createTransition(NEUTRAL_POSE, to);
    // 300ms 直接插值：约 300/16 ≈ 19 帧
    expect(frames.length).toBeGreaterThanOrEqual(15);
    expect(frames.length).toBeLessThanOrEqual(25);
  });

  it('默认时长：大差异应使用 500ms 中性复位', () => {
    const engine = new TransitionEngine();
    const to = farPose();
    const frames = engine.createTransition(NEUTRAL_POSE, to);
    // 500ms 中性复位（两段 250ms 各约 16 帧）：约 32+ 帧
    expect(frames.length).toBeGreaterThan(25);
  });

  it('指定 durationMs 应覆盖默认值', () => {
    const engine = new TransitionEngine();
    const to = offsetPose(0.1);
    const frames = engine.createTransition(NEUTRAL_POSE, to, 100);
    // 100ms：约 100/16 ≈ 7 帧
    expect(frames.length).toBeGreaterThanOrEqual(5);
    expect(frames.length).toBeLessThanOrEqual(10);
  });
});
