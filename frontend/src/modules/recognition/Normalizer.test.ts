/**
 * @file Normalizer.test.ts
 * @description 序列归一化器单元测试
 *
 * 测试覆盖：
 *   - 空序列处理
 *   - 空间归一化（腕部为原点 + 手掌大小缩放）
 *   - 时间重采样（变长 → 固定 30 帧）
 *   - 输出维度正确性
 */

import { describe, it, expect } from 'vitest';
import { Normalizer } from './Normalizer';
import type { KeypointSequence } from '@/types/recognition';

/** 构造单手 21 关键点，腕部在 (wx, wy, wz) */
function makeHand(wx: number, wy: number, wz: number): { x: number; y: number; z: number }[] {
  const hand: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 21; i++) {
    hand.push({ x: wx + i * 0.01, y: wy + i * 0.01, z: wz });
  }
  return hand;
}

/** 构造一个 KeypointSequence，n 帧，每帧双手 */
function makeSequence(n: number): KeypointSequence {
  const frames = [];
  for (let i = 0; i < n; i++) {
    frames.push({
      left_hand: makeHand(0.1, 0.2, 0),
      right_hand: makeHand(0.3, 0.4, 0),
      timestamp: i * 33,
    });
  }
  return { frames, fps: 30 };
}

describe('Normalizer', () => {
  it('空序列应返回全零的 30 帧', () => {
    const normalizer = new Normalizer();
    const result = normalizer.normalize({ frames: [], fps: 30 });
    expect(result.length).toBe(30);
    // 每帧 126 维，全零
    expect(result.data.length).toBe(30 * 126);
  });

  it('输出长度应为 30 帧 × 126 维', () => {
    const normalizer = new Normalizer();
    const seq = makeSequence(10);
    const result = normalizer.normalize(seq);
    expect(result.length).toBe(30);
    expect(result.data.length).toBe(30 * 126);
  });

  it('单帧序列应复制到 30 帧', () => {
    const normalizer = new Normalizer();
    const seq = makeSequence(1);
    const result = normalizer.normalize(seq);
    expect(result.length).toBe(30);
    expect(result.data.length).toBe(30 * 126);
  });

  it('30 帧序列应保持原长度', () => {
    const normalizer = new Normalizer();
    const seq = makeSequence(30);
    const result = normalizer.normalize(seq);
    expect(result.length).toBe(30);
  });

  it('空间归一化后腕部应为原点（前 3 个值为 0）', () => {
    const normalizer = new Normalizer();
    const seq = makeSequence(5);
    const result = normalizer.normalize(seq);
    // 第一帧左手腕部（data[0..2]）归一化后应为 0
    expect(result.data[0]).toBeCloseTo(0, 6);
    expect(result.data[1]).toBeCloseTo(0, 6);
    expect(result.data[2]).toBeCloseTo(0, 6);
  });

  it('空手（null）应补零', () => {
    const normalizer = new Normalizer();
    const seq: KeypointSequence = {
      frames: [
        {
          left_hand: null,
          right_hand: makeHand(0.3, 0.4, 0),
          timestamp: 0,
        },
      ],
      fps: 30,
    };
    const result = normalizer.normalize(seq);
    // 左手 63 维应为 0
    for (let i = 0; i < 63; i++) {
      expect(result.data[i]).toBe(0);
    }
  });

  it('变长序列重采样到 30 帧后数据应连续（非全相同）', () => {
    const normalizer = new Normalizer();
    // 构造一个有明显形状变化的序列：手指逐渐伸展
    const frames = [];
    for (let i = 0; i < 50; i++) {
      const leftHand = makeHand(0, 0, 0);
      // 改变中指 mcp（点 9）的位置，影响手掌大小，从而影响缩放归一化结果
      leftHand[9] = { x: 0.05 + i * 0.001, y: 0.05, z: 0 };
      frames.push({
        left_hand: leftHand,
        right_hand: makeHand(0, 0, 0),
        timestamp: i * 33,
      });
    }
    const seq: KeypointSequence = { frames, fps: 30 };
    const result = normalizer.normalize(seq);
    expect(result.length).toBe(30);
    // 第 1 帧和第 30 帧不应完全相同（手掌大小不同导致归一化结果不同）
    const firstFrame = result.data.slice(0, 126);
    const lastFrame = result.data.slice(29 * 126, 30 * 126);
    const allSame = firstFrame.every((v, i) => Math.abs(v - lastFrame[i]) < 1e-9);
    expect(allSame).toBe(false);
  });
});
