/**
 * @file IKSolver.test.ts
 * @description IK 逆向运动学求解器单元测试
 *
 * 测试覆盖：
 *   - 目标在臂长范围内时的求解
 *   - 目标超出臂长时的钳制
 *   - 肘部屈曲角度正确性
 *   - 肩部旋转方向
 */

import { describe, it, expect } from 'vitest';
import { solve } from './IKSolver';

describe('IKSolver', () => {
  it('目标在臂长范围内应返回有效解', () => {
    // 肩部在原点，腕部目标在正前方距离 0.5
    const result = solve(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0.5 },
      0.3, // 上臂
      0.3, // 前臂
    );
    expect(result.shoulderRotation).toBeDefined();
    expect(result.elbowRotation).toBeDefined();
    expect(Number.isFinite(result.elbowRotation.x)).toBe(true);
  });

  it('目标距离超过总臂长应被钳制（不产生 NaN）', () => {
    // 总臂长 0.6，目标距离 10（远超）
    const result = solve(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 10 },
      0.3,
      0.3,
    );
    // 不应产生 NaN
    expect(Number.isNaN(result.elbowRotation.x)).toBe(false);
    expect(Number.isNaN(result.shoulderRotation.x)).toBe(false);
  });

  it('目标在正前方时肘部应屈曲（非零）', () => {
    // 肩到腕距离 0.4，总臂长 0.6，需要屈曲
    const result = solve(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0.4 },
      0.3,
      0.3,
    );
    // 肘部屈曲角应 > 0（伸直为 0）
    expect(result.elbowRotation.x).toBeGreaterThan(0);
  });

  it('目标在最大伸展位置时肘部接近伸直', () => {
    // 目标距离 = 总臂长，肘部应接近伸直（屈曲角接近 0）
    const result = solve(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0.59 }, // 接近总臂长 0.6
      0.3,
      0.3,
    );
    // 屈曲角应较小
    expect(result.elbowRotation.x).toBeLessThan(0.5);
  });

  it('目标在侧方时肩部应外展', () => {
    // 目标在 X 轴正方向（身体侧方）
    const result = solve(
      { x: 0, y: 0, z: 0 },
      { x: 0.4, y: 0, z: 0 },
      0.3,
      0.3,
    );
    // 肩部外展角（绕 Z 轴）应为正
    expect(result.shoulderRotation.z).toBeGreaterThan(0);
  });

  it('肩部与目标重合时应安全返回（不除零）', () => {
    const result = solve(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      0.3,
      0.3,
    );
    expect(Number.isNaN(result.shoulderRotation.x)).toBe(false);
    expect(Number.isNaN(result.elbowRotation.x)).toBe(false);
  });

  it('角度应在 [-π, π] 范围内', () => {
    const result = solve(
      { x: 0, y: 0, z: 0 },
      { x: 0.2, y: -0.3, z: 0.4 },
      0.3,
      0.3,
    );
    expect(result.shoulderRotation.x).toBeGreaterThanOrEqual(-Math.PI);
    expect(result.shoulderRotation.x).toBeLessThanOrEqual(Math.PI);
    expect(result.shoulderRotation.z).toBeGreaterThanOrEqual(-Math.PI);
    expect(result.shoulderRotation.z).toBeLessThanOrEqual(Math.PI);
    expect(result.elbowRotation.x).toBeGreaterThanOrEqual(-Math.PI);
    expect(result.elbowRotation.x).toBeLessThanOrEqual(Math.PI);
  });
});
