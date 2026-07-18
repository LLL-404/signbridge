// HandShape.vrm.test.ts
import { describe, it, expect } from 'vitest';
import { HandShape } from '@/types/sign';
import { handShapeToBoneRotations } from './HandShape';

describe('handShapeToBoneRotations', () => {
  it('OPEN_5 应返回所有手指骨骼屈曲为零，外展非零', () => {
    const result = handShapeToBoneRotations(HandShape.OPEN_5, 'right');
    // 每只手 5 指 × 3 关节 = 15 个骨骼
    expect(Object.keys(result)).toHaveLength(15);
    // 食指 proximal X 屈曲应为零
    expect(result.rightIndexProximal!.x).toBe(0);
    // 食指 proximal Y 外展应非零（OPEN_5 手指张开）
    expect(result.rightIndexProximal!.y).not.toBe(0);
    // 中指 proximal Y 外展应为零（中指为基准指）
    expect(result.rightMiddleProximal!.y).toBe(0);
  });

  it('FIST_A 应返回食指 proximal 非零屈曲', () => {
    const result = handShapeToBoneRotations(HandShape.FIST_A, 'right');
    expect(result.rightIndexProximal!.x).toBeGreaterThan(0.5);
    expect(result.rightIndexIntermediate!.x).toBeGreaterThan(0.5);
  });

  it('左手应返回 left 前缀的骨骼名', () => {
    const result = handShapeToBoneRotations(HandShape.FIST_A, 'left');
    expect(result.leftIndexProximal).toBeDefined();
    expect(result.rightIndexProximal).toBeUndefined();
  });
});
