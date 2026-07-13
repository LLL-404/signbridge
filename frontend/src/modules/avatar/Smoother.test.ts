/**
 * @file Smoother.test.ts
 * @description 平滑器单元测试
 *
 * 测试覆盖：
 *   - QuaternionSmoother 正常平滑行为（连续相似旋转，输出应平滑）
 *   - QuaternionSmoother.reset() 方法（reset 后第一帧直接返回输入值）
 *   - slerpQuat 函数（t=0 返回 a，t=1 返回 b，t=0.5 返回中间值）
 *   - 快速运动自适应（快速变化时平滑减少，高 beta 响应更快）
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { QuaternionSmoother, slerpQuat } from './Smoother';

/**
 * 计算两个四元数之间的角度距离（弧度）
 * 处理 q 与 -q 表示同一旋转的情况，使用 |dot| 计算
 */
function quatAngle(a: THREE.Quaternion, b: THREE.Quaternion): number {
  const dot = Math.abs(a.dot(b));
  // 钳制到 [0, 1] 避免 acos 出现 NaN
  const clamped = Math.min(1, Math.max(0, dot));
  return 2 * Math.acos(clamped);
}

describe('slerpQuat', () => {
  it('t=0 应返回起始四元数 a', () => {
    const a = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    const b = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.0, 0.5, 0.2));
    const result = slerpQuat(a, b, 0);
    // 四元数角度距离应为 0
    expect(quatAngle(result, a)).toBeLessThan(1e-6);
  });

  it('t=1 应返回目标四元数 b', () => {
    const a = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    const b = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.0, 0.5, 0.2));
    const result = slerpQuat(a, b, 1);
    expect(quatAngle(result, b)).toBeLessThan(1e-6);
  });

  it('t=0.5 应返回中间值（角度为 a-b 的一半）', () => {
    const a = new THREE.Quaternion(); // 单位四元数
    // 绕 Y 轴旋转 90 度
    const b = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const mid = slerpQuat(a, b, 0.5);
    // 中间值应绕 Y 轴旋转 45 度
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    expect(quatAngle(mid, expected)).toBeLessThan(1e-6);
  });

  it('不应修改输入四元数', () => {
    const a = new THREE.Quaternion(0.1, 0.2, 0.3, 0.4).normalize();
    const b = new THREE.Quaternion(0.5, 0.6, 0.7, 0.8).normalize();
    const aCopy = a.clone();
    const bCopy = b.clone();
    slerpQuat(a, b, 0.5);
    expect(a.equals(aCopy)).toBe(true);
    expect(b.equals(bCopy)).toBe(true);
  });
});

describe('QuaternionSmoother', () => {
  it('首次调用应直接返回输入（单位四元数）', () => {
    const smoother = new QuaternionSmoother();
    const input = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    const result = smoother.smoothQuaternion('head', input, 0);
    // 首帧应直接返回输入（normalize 后应相等）
    expect(quatAngle(result, input)).toBeLessThan(1e-6);
  });

  it('连续相似旋转输入应产生平滑输出（输出介于前后值之间）', () => {
    const smoother = new QuaternionSmoother();
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.1, 0.1));
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.11, 0.1));

    // 首帧
    smoother.smoothQuaternion('arm', q0, 0);
    // 第二帧：输入 q1，输出应介于 q0 和 q1 之间（被平滑）
    const out = smoother.smoothQuaternion('arm', q1, 16);

    const distToQ0 = quatAngle(out, q0);
    const distToQ1 = quatAngle(out, q1);
    // 输出应朝 q1 移动，但尚未到达 q1（被平滑）
    expect(distToQ1).toBeGreaterThan(1e-6);
    // 输出应在 q0 和 q1 之间：到 q1 的距离小于到 q0 的距离
    expect(distToQ1).toBeLessThan(distToQ0);
  });

  it('欧拉角接口 smooth 应返回与输入接近的结果（首帧）', () => {
    const smoother = new QuaternionSmoother();
    const rot = { x: 0.1, y: 0.2, z: 0.3 };
    const out = smoother.smooth('spine', rot, 0);
    // 首帧经欧拉->四元数->欧拉转换后应近似相等
    expect(out.x).toBeCloseTo(rot.x, 5);
    expect(out.y).toBeCloseTo(rot.y, 5);
    expect(out.z).toBeCloseTo(rot.z, 5);
  });

  it('不同骨骼应维护独立的滤波器状态', () => {
    const smoother = new QuaternionSmoother();
    const qA = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0));
    const qB = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.0, 0, 0));

    // 骨骼 A 首帧
    const outA1 = smoother.smoothQuaternion('boneA', qA, 0);
    // 骨骼 B 首帧（应独立初始化，直接返回 qB）
    const outB1 = smoother.smoothQuaternion('boneB', qB, 0);

    expect(quatAngle(outA1, qA)).toBeLessThan(1e-6);
    expect(quatAngle(outB1, qB)).toBeLessThan(1e-6);
  });

  it('reset 后第一帧应直接返回输入值', () => {
    const smoother = new QuaternionSmoother();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.6, 0.7));

    // 首帧
    smoother.smoothQuaternion('arm', q1, 0);
    // 第二帧：被平滑，不等于 q2
    const outBeforeReset = smoother.smoothQuaternion('arm', q2, 16);
    expect(quatAngle(outBeforeReset, q2)).toBeGreaterThan(1e-6);

    // 重置后首帧应直接返回输入
    smoother.reset();
    const outAfterReset = smoother.smoothQuaternion('arm', q2, 32);
    expect(quatAngle(outAfterReset, q2)).toBeLessThan(1e-6);
  });

  it('快速运动自适应：快速变化时平滑减少', () => {
    // 两个 smoother 参数相同，分别测试快速和慢速变化
    const smootherFast = new QuaternionSmoother(1.5, 0.01);
    const smootherSlow = new QuaternionSmoother(1.5, 0.01);

    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.0, 0.0, 0.0));
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.0, 0.0, 0.0));

    // 初始化（首帧直接返回输入）
    smootherFast.smoothQuaternion('arm', q1, 0);
    smootherSlow.smoothQuaternion('arm', q1, 0);

    // 快速变化：短时间（16ms）内大幅变化
    const outFast = smootherFast.smoothQuaternion('arm', q2, 16);
    // 慢速变化：长时间（1000ms）内相同幅度变化
    const outSlow = smootherSlow.smoothQuaternion('arm', q2, 1000);

    const distFast = quatAngle(outFast, q2);
    const distSlow = quatAngle(outSlow, q2);
    // 快速变化时，输出应更接近 q2（平滑更少）；慢速变化时输出更接近 q1（平滑更多）
    expect(distFast).toBeLessThan(distSlow);
  });
});
