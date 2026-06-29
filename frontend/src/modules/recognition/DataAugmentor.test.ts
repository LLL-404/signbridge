/**
 * @file DataAugmentor.test.ts
 * @description 高级数据增强器单元测试
 *
 * 测试覆盖：
 *   - 配置管理：默认配置、自定义配置、setConfig
 *   - augment 综合增强：禁用时不修改、启用时输出维度一致
 *   - mirrorHands：左右手交换、x 坐标翻转
 *   - frameDropout：帧数不变、被丢弃帧全零、首尾帧不丢
 *   - keypointOcclusion：帧数不变、遮挡关键点为零
 *   - mixup：输出维度一致、值在两者之间
 *   - addGaussianNoise：维度不变、值有微小偏移
 *   - temporalJitter：帧数不变
 */

import { describe, it, expect } from 'vitest';
import { DataAugmentor } from './DataAugmentor';

/** 生成测试用的帧序列 [帧数, 126] */
function makeTestFrames(frameCount: number = 30): number[][] {
  const frames: number[][] = [];
  for (let t = 0; t < frameCount; t++) {
    const frame: number[] = [];
    for (let d = 0; d < 126; d++) {
      frame.push(0.5 + t * 0.01 + d * 0.001);
    }
    frames.push(frame);
  }
  return frames;
}

describe('DataAugmentor', () => {
  describe('配置管理', () => {
    it('应使用默认配置', () => {
      const aug = new DataAugmentor();
      const cfg = aug.getConfig();
      expect(cfg.mirrorProb).toBe(0.3);
      expect(cfg.frameDropProb).toBe(0.1);
      expect(cfg.occlusionProb).toBe(0.05);
      expect(cfg.mixupProb).toBe(0.15);
      expect(cfg.gaussianNoiseStd).toBe(0.008);
      expect(cfg.temporalJitterFrames).toBe(2);
      expect(cfg.enabled).toBe(true);
    });

    it('应接受自定义配置', () => {
      const aug = new DataAugmentor({ mirrorProb: 0.5, enabled: false });
      const cfg = aug.getConfig();
      expect(cfg.mirrorProb).toBe(0.5);
      expect(cfg.enabled).toBe(false);
    });

    it('setConfig 应合并更新', () => {
      const aug = new DataAugmentor();
      aug.setConfig({ mirrorProb: 0.8, frameDropProb: 0.2 });
      const cfg = aug.getConfig();
      expect(cfg.mirrorProb).toBe(0.8);
      expect(cfg.frameDropProb).toBe(0.2);
      // 其他配置保持不变
      expect(cfg.occlusionProb).toBe(0.05);
    });
  });

  describe('augment 综合增强', () => {
    it('禁用时应返回原始数据（深拷贝）', () => {
      const aug = new DataAugmentor({ enabled: false });
      const frames = makeTestFrames(10);
      const result = aug.augment(frames);
      expect(result).toEqual(frames);
      expect(result).not.toBe(frames); // 应为深拷贝
    });

    it('启用时应保持帧数不变', () => {
      const aug = new DataAugmentor({ enabled: true });
      const frames = makeTestFrames(20);
      const result = aug.augment(frames);
      expect(result.length).toBe(20);
    });

    it('空序列应直接返回', () => {
      const aug = new DataAugmentor();
      const result = aug.augment([]);
      expect(result).toEqual([]);
    });

    it('每帧维度应为 126', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(15);
      const result = aug.augment(frames);
      for (const frame of result) {
        expect(frame.length).toBe(126);
      }
    });
  });

  describe('mirrorHands', () => {
    it('应交换左右手并翻转 x 坐标', () => {
      const aug = new DataAugmentor({ enabled: false });
      // 构造已知帧：左手 x=0.2, 右手 x=0.8
      const frame: number[] = new Array(126).fill(0);
      frame[0] = 0.2; // 左手 wrist x
      frame[63] = 0.8; // 右手 wrist x
      const result = aug.mirrorHands([frame]);
      expect(result[0][0]).toBeCloseTo(1 - 0.8, 5); // 右手→左手，翻转 x
      expect(result[0][63]).toBeCloseTo(1 - 0.2, 5); // 左手→右手，翻转 x
    });

    it('应保持帧数不变', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(10);
      const result = aug.mirrorHands(frames);
      expect(result.length).toBe(10);
    });

    it('y 和 z 坐标不应改变', () => {
      const aug = new DataAugmentor();
      const frame: number[] = new Array(126).fill(0);
      frame[0] = 0.3; // x
      frame[1] = 0.4; // y
      frame[2] = 0.5; // z
      const result = aug.mirrorHands([frame]);
      expect(result[0][64]).toBeCloseTo(0.4, 5); // y 不变（右手位置）
      expect(result[0][65]).toBeCloseTo(0.5, 5); // z 不变
    });
  });

  describe('frameDropout', () => {
    it('应保持帧数不变', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(20);
      const result = aug.frameDropout(frames);
      expect(result.length).toBe(20);
    });

    it('被丢弃的帧应全零', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(30);
      const result = aug.frameDropout(frames);
      // 至少有一个中间帧被置零
      let hasZeroFrame = false;
      for (let i = 1; i < result.length - 1; i++) {
        if (result[i].every((v) => v === 0)) {
          hasZeroFrame = true;
          break;
        }
      }
      expect(hasZeroFrame).toBe(true);
    });

    it('首尾帧不应被丢弃', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(30);
      const result = aug.frameDropout(frames);
      expect(result[0].some((v) => v !== 0)).toBe(true);
      expect(result[result.length - 1].some((v) => v !== 0)).toBe(true);
    });

    it('短序列（<=2帧）应原样返回', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(2);
      const result = aug.frameDropout(frames);
      expect(result).toEqual(frames);
    });
  });

  describe('keypointOcclusion', () => {
    it('应保持帧数和维度不变', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(15);
      const result = aug.keypointOcclusion(frames);
      expect(result.length).toBe(15);
      for (const frame of result) {
        expect(frame.length).toBe(126);
      }
    });

    it('被遮挡的关键点应为零', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(20);
      const result = aug.keypointOcclusion(frames);
      // 检查是否有某些关键点在所有帧中都被置零
      let hasOccludedKp = false;
      for (let kp = 0; kp < 21; kp++) {
        const leftBase = kp * 3;
        const rightBase = 63 + kp * 3;
        const leftAllZero = result.every((f) => f[leftBase] === 0 && f[leftBase + 1] === 0);
        const rightAllZero = result.every((f) => f[rightBase] === 0 && f[rightBase + 1] === 0);
        if (leftAllZero || rightAllZero) {
          hasOccludedKp = true;
          break;
        }
      }
      expect(hasOccludedKp).toBe(true);
    });
  });

  describe('mixup', () => {
    it('应保持帧数不变', () => {
      const aug = new DataAugmentor();
      const framesA = makeTestFrames(20);
      const framesB = makeTestFrames(20);
      const result = aug.mixup(framesA, framesB);
      expect(result.length).toBe(20);
    });

    it('混合值应在两个输入之间', () => {
      const aug = new DataAugmentor();
      const framesA: number[][] = [[...new Array(126).fill(0.3)]];
      const framesB: number[][] = [[...new Array(126).fill(0.7)]];
      const result = aug.mixup(framesA, framesB);
      // λ ∈ [0.7, 0.9]，结果应在 0.3*λ + 0.7*(1-λ) 范围内
      // λ=0.7 → 0.42, λ=0.9 → 0.34
      for (let d = 0; d < 126; d++) {
        expect(result[0][d]).toBeGreaterThanOrEqual(0.33);
        expect(result[0][d]).toBeLessThanOrEqual(0.43);
      }
    });

    it('长度不同时取较短长度', () => {
      const aug = new DataAugmentor();
      const framesA = makeTestFrames(30);
      const framesB = makeTestFrames(20);
      const result = aug.mixup(framesA, framesB);
      expect(result.length).toBe(20);
    });
  });

  describe('addGaussianNoise', () => {
    it('应保持维度不变', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(10);
      const result = aug.addGaussianNoise(frames, 0.01);
      expect(result.length).toBe(10);
      for (const frame of result) {
        expect(frame.length).toBe(126);
      }
    });

    it('值应在原始值附近（噪声有限）', () => {
      const aug = new DataAugmentor();
      const frames: number[][] = [[...new Array(126).fill(0.5)]];
      const result = aug.addGaussianNoise(frames, 0.001);
      // 3σ 原则：99.7% 的值在 ±0.003 内
      for (let d = 0; d < 126; d++) {
        expect(Math.abs(result[0][d] - 0.5)).toBeLessThan(0.02);
      }
    });

    it('std=0 时应不改变值', () => {
      const aug = new DataAugmentor();
      const frames = makeTestFrames(5);
      const result = aug.addGaussianNoise(frames, 0);
      for (let t = 0; t < 5; t++) {
        for (let d = 0; d < 126; d++) {
          expect(result[t][d]).toBeCloseTo(frames[t][d], 10);
        }
      }
    });
  });

  describe('temporalJitter', () => {
    it('应保持帧数不变', () => {
      const aug = new DataAugmentor({ temporalJitterFrames: 2 });
      const frames = makeTestFrames(30);
      const result = aug.temporalJitter(frames);
      expect(result.length).toBe(30);
    });

    it('jitter=0 时应原样返回', () => {
      const aug = new DataAugmentor({ temporalJitterFrames: 0 });
      const frames = makeTestFrames(10);
      const result = aug.temporalJitter(frames);
      expect(result).toEqual(frames);
    });

    it('短序列应原样返回', () => {
      const aug = new DataAugmentor({ temporalJitterFrames: 2 });
      const frames = makeTestFrames(2);
      const result = aug.temporalJitter(frames);
      expect(result).toEqual(frames);
    });
  });
});
