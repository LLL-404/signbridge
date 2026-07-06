// HandShape.vrm.test.ts
import { describe, it, expect } from 'vitest';
import { HandShape } from '@/types/sign';
import { handShapeToBoneRotations } from './HandShape';

describe('handShapeToBoneRotations', () => {
  it('OPEN_5 应返回所有手指骨骼零旋转', () => {
    const result = handShapeToBoneRotations(HandShape.OPEN_5, 'right');
    // 每只手 5 指 × 3 关节 = 15 个骨骼
    expect(Object.keys(result)).toHaveLength(15);
    // 食指 proximal 应零旋转
    expect(result.rightIndexProximal).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('FIST_A 应返回食指 proximal 非零屈曲', () => {
    const result = handShapeToBoneRotations(HandShape.FIST_A, 'right');
    expect(result.rightIndexProximal.x).toBeGreaterThan(0.5);
    expect(result.rightIndexIntermediate.x).toBeGreaterThan(0.5);
  });

  it('左手应返回 left 前缀的骨骼名', () => {
    const result = handShapeToBoneRotations(HandShape.FIST_A, 'left');
    expect(result.leftIndexProximal).toBeDefined();
    expect(result.rightIndexProximal).toBeUndefined();
  });
});
