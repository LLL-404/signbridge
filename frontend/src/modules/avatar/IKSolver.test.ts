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
import * as THREE from 'three';
import type { Vec3 } from '@/types/avatar';
import { solve, solveLeg, solveFABRIK, solveFABRIKMultiChain, type ArmIKTarget } from './IKSolver';

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

describe('solveLeg (下肢 IK)', () => {
  it('目标在腿长范围内应返回有效解', () => {
    const result = solveLeg(
      { x: 0, y: 1.0, z: 0 },    // 髋
      { x: 0, y: 0.1, z: 0 },    // 脚踝目标
      0.46,                        // 大腿长
      0.48,                        // 小腿长
    );
    expect(result.hipRotation).toBeDefined();
    expect(result.kneeRotation).toBeDefined();
    expect(Number.isFinite(result.kneeRotation.x)).toBe(true);
  });

  it('目标距离超过总腿长应被钳制（不产生 NaN）', () => {
    const result = solveLeg(
      { x: 0, y: 1.0, z: 0 },
      { x: 0, y: -10, z: 0 },
      0.46, 0.48,
    );
    expect(Number.isNaN(result.hipRotation.x)).toBe(false);
    expect(Number.isNaN(result.kneeRotation.x)).toBe(false);
  });

  it('膝盖弯曲方向应为正向屈曲（X 轴正角）', () => {
    const result = solveLeg(
      { x: 0, y: 1.0, z: 0 },
      { x: 0, y: 0.1, z: 0.1 },  // 脚向前
      0.46, 0.48,
    );
    expect(result.kneeRotation.x).toBeGreaterThan(0);
  });
});

import { solveSpine } from './IKSolver';

describe('solveSpine (躯干弯曲)', () => {
  it('前倾应产生 spine + chest 正向 X 旋转', () => {
    const result = solveSpine('forward', 0.3);  // 前倾 0.3 弧度
    expect(result.spine.x).toBeGreaterThan(0);
    expect(result.chest.x).toBeGreaterThan(0);
    expect(result.upperChest?.x).toBeGreaterThan(0);
  });

  it('侧弯应产生 Z 轴旋转', () => {
    const result = solveSpine('left', 0.2);
    expect(Math.abs(result.spine.z)).toBeGreaterThan(0);
  });

  it('零角度应返回零旋转', () => {
    const result = solveSpine('forward', 0);
    expect(result.spine.x).toBe(0);
    expect(result.chest.x).toBe(0);
  });
});

// ===== FABRIK IK 测试 =====

/**
 * FK 辅助：根据 IKResult 重建腕部世界位置，用于验证 IK 精度
 * 约定与 Skeleton3D 一致：骨骼 rest 方向为 -Y，父子层级 worldRot = parentRot * localRot
 */
function fkWristPos(
  result: { shoulderRotation: Vec3; elbowRotation: Vec3 },
  shoulderPos: Vec3,
  L1: number,
  L2: number,
): THREE.Vector3 {
  const shoulderQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(result.shoulderRotation.x, result.shoulderRotation.y, result.shoulderRotation.z, 'XYZ'),
  );
  const elbowQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(result.elbowRotation.x, result.elbowRotation.y, result.elbowRotation.z, 'XYZ'),
  );
  // 上臂方向 = rest(-Y) 应用肩旋转
  const upperArmDir = new THREE.Vector3(0, -1, 0).applyQuaternion(shoulderQuat);
  const elbowPos = new THREE.Vector3(shoulderPos.x, shoulderPos.y, shoulderPos.z)
    .addScaledVector(upperArmDir, L1);
  // 前臂方向 = rest(-Y) 先经肘本地旋转，再经肩旋转（父子层级）
  const forearmDir = new THREE.Vector3(0, -1, 0)
    .applyQuaternion(elbowQuat)
    .applyQuaternion(shoulderQuat);
  return elbowPos.addScaledVector(forearmDir, L2);
}

describe('solveFABRIK', () => {
  it('可达目标应精确收敛（FK 重建误差 ≤ 1e-3）', () => {
    const shoulder = { x: 0, y: 0.5, z: 0 };
    const target = { x: 0.3, y: 0.5, z: 0 };
    const L1 = 0.28, L2 = 0.26;
    const result = solveFABRIK(shoulder, target, L1, L2, 'left', undefined, 10);
    const wrist = fkWristPos(result, shoulder, L1, L2);
    const err = wrist.distanceTo(new THREE.Vector3(target.x, target.y, target.z));
    expect(err).toBeLessThanOrEqual(1e-3);
  });

  it('不可达目标应 fallback 到解析法（不报错）', () => {
    const shoulder = { x: 0, y: 0.5, z: 0 };
    // 距离 1.0 > 总臂长 0.54，不可达
    const target = { x: 0, y: 0.5, z: 1.0 };
    const result = solveFABRIK(shoulder, target, 0.28, 0.26, 'left', undefined, 10);
    expect(Number.isFinite(result.shoulderRotation.x)).toBe(true);
    expect(Number.isNaN(result.elbowRotation.x)).toBe(false);
  });

  it('零长度骨骼应 fallback 到解析法', () => {
    const shoulder = { x: 0, y: 0.5, z: 0 };
    const target = { x: 0.3, y: 0.5, z: 0 };
    const result = solveFABRIK(shoulder, target, 0, 0.26, 'left');
    expect(Number.isFinite(result.shoulderRotation.x)).toBe(true);
    expect(Number.isNaN(result.elbowRotation.x)).toBe(false);
  });

  it('负方向目标应正常求解', () => {
    const shoulder = { x: 0, y: 0.5, z: 0 };
    // target.y < shoulder.y，腕部目标在肩下方
    const target = { x: 0, y: 0.1, z: 0 };
    const L1 = 0.28, L2 = 0.26;
    const result = solveFABRIK(shoulder, target, L1, L2, 'left', undefined, 10);
    const wrist = fkWristPos(result, shoulder, L1, L2);
    const err = wrist.distanceTo(new THREE.Vector3(target.x, target.y, target.z));
    expect(err).toBeLessThanOrEqual(1e-3);
  });

  it('iterations=10 足以收敛可达目标', () => {
    const shoulder = { x: 0, y: 0.5, z: 0 };
    const target = { x: 0.2, y: 0.3, z: 0.15 };
    const L1 = 0.28, L2 = 0.26;
    const result = solveFABRIK(shoulder, target, L1, L2, 'right', undefined, 10);
    const wrist = fkWristPos(result, shoulder, L1, L2);
    const err = wrist.distanceTo(new THREE.Vector3(target.x, target.y, target.z));
    expect(err).toBeLessThanOrEqual(1e-3);
  });

  it('传入 restDir 应影响求解结果（T-pose 水平臂 vs 默认垂直臂）', () => {
    const shoulder = { x: 0, y: 0.5, z: 0 };
    const target = { x: 0.3, y: 0.3, z: 0 };
    const L1 = 0.28, L2 = 0.26;

    // 默认 rest direction (0,-1,0) — 垂直向下
    const resultDefault = solveFABRIK(shoulder, target, L1, L2, 'right', undefined, 10);

    // T-pose rest direction (1,0,0) — 水平向外（VRM T-pose 上臂方向）
    const restDirTPose = new THREE.Vector3(1, 0, 0);
    const resultTPose = solveFABRIK(shoulder, target, L1, L2, 'right', undefined, 10, restDirTPose);

    // 两种 rest direction 应产生不同的肩部旋转
    const diff = Math.abs(resultDefault.shoulderRotation.x - resultTPose.shoulderRotation.x)
                + Math.abs(resultDefault.shoulderRotation.y - resultTPose.shoulderRotation.y)
                + Math.abs(resultDefault.shoulderRotation.z - resultTPose.shoulderRotation.z);
    expect(diff).toBeGreaterThan(0.01);
  });
});

describe('solveFABRIKMultiChain', () => {
  it('左右臂协同应分别返回有效结果', () => {
    const left: ArmIKTarget = {
      shoulderPos: { x: -0.18, y: 1.4, z: 0 },
      wristTargetPos: { x: -0.3, y: 0.9, z: 0.2 },
      upperArmLength: 0.28,
      forearmLength: 0.26,
    };
    const right: ArmIKTarget = {
      shoulderPos: { x: 0.18, y: 1.4, z: 0 },
      wristTargetPos: { x: 0.3, y: 0.9, z: 0.2 },
      upperArmLength: 0.28,
      forearmLength: 0.26,
    };
    const result = solveFABRIKMultiChain({ left, right });
    expect(result.left).toBeDefined();
    expect(result.right).toBeDefined();
    expect(Number.isFinite(result.left!.shoulderRotation.x)).toBe(true);
    expect(Number.isFinite(result.right!.shoulderRotation.x)).toBe(true);
  });

  it('仅传一侧应只返回一侧结果', () => {
    const left: ArmIKTarget = {
      shoulderPos: { x: -0.18, y: 1.4, z: 0 },
      wristTargetPos: { x: -0.3, y: 0.9, z: 0.2 },
      upperArmLength: 0.28,
      forearmLength: 0.26,
    };
    const result = solveFABRIKMultiChain({ left });
    expect(result.left).toBeDefined();
    expect(result.right).toBeUndefined();
  });
});
