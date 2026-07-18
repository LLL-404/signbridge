/**
 * @file JointLimits.test.ts
 * @description 关节角度限制工具单元测试
 *
 * 测试覆盖：
 *   - 常量正确性（角度换算）
 *   - clampRotationAngle：未超限克隆、超限钳制、单位四元数、不修改输入
 *   - constrainShoulderByDirection：rest pose 直返、T/A-pose 外展/前屈/后伸方向
 *   - computeHingeAxis：正交叉积、退化回退
 *   - constrainHingeJoint：伸直零旋转、超出 min/max 钳制
 *   - constrainForearmRotation：单位四元数直返、旋前/旋后钳制
 *   - applyVRMCConstraints：无约束直返、roll 约束按权重分布
 *   - VRM 约束缓存读写与 extractVRMCConstraints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  SHOULDER_ABDUCTION_MAX_RAD,
  SHOULDER_FLEXION_MAX_RAD,
  SHOULDER_EXTENSION_MAX_RAD,
  ELBOW_FLEXION_MIN_RAD,
  ELBOW_FLEXION_MAX_RAD,
  ELBOW_PRONATION_MAX_RAD,
  ELBOW_SUPINATION_MAX_RAD,
  clampRotationAngle,
  constrainShoulderByDirection,
  computeHingeAxis,
  constrainHingeJoint,
  constrainForearmRotation,
  applyVRMCConstraints,
  setVRMConstraintCache,
  getVRMConstraintCache,
  extractVRMCConstraints,
} from './JointLimits';
import type { VRM } from '@pixiv/three-vrm';

/** 两个四元数之间的角度距离（弧度），处理 q/-q 双覆盖 */
function quatAngle(a: THREE.Quaternion, b: THREE.Quaternion): number {
  const dot = Math.min(1, Math.max(0, Math.abs(a.dot(b))));
  return 2 * Math.acos(dot);
}

describe('JointLimits 常量', () => {
  it('肩关节外展限制应为 120° 弧度', () => {
    expect(SHOULDER_ABDUCTION_MAX_RAD).toBeCloseTo((120 * Math.PI) / 180, 6);
  });

  it('肩关节前屈限制应为 180° 弧度，后伸为 60° 弧度', () => {
    expect(SHOULDER_FLEXION_MAX_RAD).toBeCloseTo(Math.PI, 6);
    expect(SHOULDER_EXTENSION_MAX_RAD).toBeCloseTo((60 * Math.PI) / 180, 6);
  });

  it('肘关节屈曲范围应为 [0°, 150°]', () => {
    expect(ELBOW_FLEXION_MIN_RAD).toBe(0);
    expect(ELBOW_FLEXION_MAX_RAD).toBeCloseTo((150 * Math.PI) / 180, 6);
  });

  it('肘关节旋前/旋后最大角度均为 80° 弧度', () => {
    expect(ELBOW_PRONATION_MAX_RAD).toBeCloseTo((80 * Math.PI) / 180, 6);
    expect(ELBOW_SUPINATION_MAX_RAD).toBeCloseTo((80 * Math.PI) / 180, 6);
  });
});

describe('clampRotationAngle', () => {
  it('旋转角度未超过最大值时应返回克隆', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 4, // 45°
    );
    const out = clampRotationAngle(q, Math.PI / 2);
    expect(quatAngle(out, q)).toBeLessThan(1e-6);
  });

  it('旋转角度超过最大值时应被钳制到 maxAngleRad', () => {
    // 旋转 180°，限制 90°
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI,
    );
    const out = clampRotationAngle(q, Math.PI / 2);
    const expectedAngle = Math.PI / 2;
    const actualAngle = 2 * Math.acos(Math.min(1, Math.abs(out.w)));
    expect(actualAngle).toBeCloseTo(expectedAngle, 5);
  });

  it('单位四元数应原样返回（角度为 0）', () => {
    const q = new THREE.Quaternion(); // 单位四元数
    const out = clampRotationAngle(q, Math.PI / 2);
    expect(quatAngle(out, q)).toBeLessThan(1e-6);
  });

  it('不应修改输入四元数', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI,
    );
    const qCopy = q.clone();
    clampRotationAngle(q, Math.PI / 4);
    expect(q.equals(qCopy)).toBe(true);
  });

  it('w < 0 的四元数应正确处理轴方向', () => {
    // 构造 w < 0 的四元数：旋转角度 > π 时 setFromAxisAngle 会产生等价的负 w 表示
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (3 * Math.PI) / 2, // 270°
    );
    const out = clampRotationAngle(q, Math.PI / 4);
    // 钳制后角度应等于 maxAngle
    const actualAngle = 2 * Math.acos(Math.min(1, Math.abs(out.w)));
    expect(actualAngle).toBeCloseTo(Math.PI / 4, 5);
  });
});

describe('constrainShoulderByDirection', () => {
  it('接近 rest pose 时应返回克隆', () => {
    const restDir = new THREE.Vector3(1, 0, 0); // T-pose 上臂方向
    // 极小旋转
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      1e-8,
    );
    const out = constrainShoulderByDirection(q, restDir);
    expect(quatAngle(out, q)).toBeLessThan(1e-6);
  });

  it('T-pose 外展方向（手臂上抬）应限制为 120°', () => {
    // rest 为 T-pose 水平方向 (1,0,0)，绕 Z 轴旋转 150° → 手臂大幅外展
    const restDir = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      (150 * Math.PI) / 180,
    );
    const out = constrainShoulderByDirection(q, restDir);
    // 旋转后的实际角度应不超过 120°
    const upperArmDir = restDir.clone().applyQuaternion(out);
    const angle = restDir.angleTo(upperArmDir);
    expect(angle).toBeLessThanOrEqual(SHOULDER_ABDUCTION_MAX_RAD + 1e-3);
  });

  it('A-pose 外展方向（手臂下垂到外侧）应限制为 120°', () => {
    // A-pose rest 方向 (0,-1,0) 手臂下垂；绕 Z 轴旋转使手臂外展到 150°
    const restDir = new THREE.Vector3(0, -1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      (150 * Math.PI) / 180,
    );
    const out = constrainShoulderByDirection(q, restDir);
    const upperArmDir = restDir.clone().applyQuaternion(out);
    const angle = restDir.angleTo(upperArmDir);
    expect(angle).toBeLessThanOrEqual(SHOULDER_ABDUCTION_MAX_RAD + 1e-3);
  });

  it('T-pose 前屈方向（绕 Y 轴旋转使手臂前伸）应限制为 180°', () => {
    // rest 为 (1,0,0)，绕 Y 轴旋转 200°（超过 180°）
    const restDir = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (200 * Math.PI) / 180,
    );
    const out = constrainShoulderByDirection(q, restDir);
    const upperArmDir = restDir.clone().applyQuaternion(out);
    const angle = restDir.angleTo(upperArmDir);
    expect(angle).toBeLessThanOrEqual(SHOULDER_FLEXION_MAX_RAD + 1e-3);
  });

  it('T-pose 后伸方向（手臂向后伸）应限制为 60°', () => {
    // rest 为 (1,0,0)，绕 +Y 轴正向旋转 100° → upperArmDir.z < 0 后伸方向
    const restDir = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (100 * Math.PI) / 180,
    );
    const out = constrainShoulderByDirection(q, restDir);
    const upperArmDir = restDir.clone().applyQuaternion(out);
    const angle = restDir.angleTo(upperArmDir);
    expect(angle).toBeLessThanOrEqual(SHOULDER_EXTENSION_MAX_RAD + 1e-3);
  });
});

describe('computeHingeAxis', () => {
  it('互相垂直的向量应给出归一化叉积', () => {
    const bone = new THREE.Vector3(1, 0, 0);
    const ref = new THREE.Vector3(0, 1, 0);
    const axis = computeHingeAxis(bone, ref);
    // (1,0,0) × (0,1,0) = (0,0,1)
    expect(axis.x).toBeCloseTo(0, 6);
    expect(axis.y).toBeCloseTo(0, 6);
    expect(axis.z).toBeCloseTo(1, 6);
    expect(axis.length()).toBeCloseTo(1, 6);
  });

  it('平行向量时应回退到正交参考方向（非零）', () => {
    // bone 与 ref 平行：bone=(0,1,0), ref=(0,1,0)
    const bone = new THREE.Vector3(0, 1, 0);
    const ref = new THREE.Vector3(0, 1, 0);
    const axis = computeHingeAxis(bone, ref);
    // 应回退到与 bone 正交的方向，结果应非零且归一化
    expect(axis.length()).toBeCloseTo(1, 6);
    expect(axis.lengthSq()).toBeGreaterThan(1e-6);
  });

  it('bone 接近 ±X 时应使用 (0,0,1) 作为回退参考', () => {
    const bone = new THREE.Vector3(1, 0, 0);
    const ref = new THREE.Vector3(1, 0, 0); // 与 bone 平行
    const axis = computeHingeAxis(bone, ref);
    expect(axis.length()).toBeCloseTo(1, 6);
    // 应与 X 轴正交（dot ≈ 0）
    expect(Math.abs(axis.x)).toBeLessThan(1e-6);
  });
});

describe('constrainHingeJoint', () => {
  it('restDir 与 targetDir 重合时返回零旋转', () => {
    const rest = new THREE.Vector3(1, 0, 0);
    const target = new THREE.Vector3(1, 0, 0);
    const hinge = new THREE.Vector3(0, 0, 1);
    const out = constrainHingeJoint(rest, target, hinge, 0, Math.PI / 2);
    // 单位四元数表示零旋转
    expect(quatAngle(out, new THREE.Quaternion())).toBeLessThan(1e-6);
  });

  it('弯曲角度超过 maxAngleRad 时被钳制', () => {
    const rest = new THREE.Vector3(1, 0, 0);
    // 绕 hinge 轴旋转 150°
    const target = rest.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), (150 * Math.PI) / 180);
    const hinge = new THREE.Vector3(0, 0, 1);
    // 限制 [0, 60°]
    const out = constrainHingeJoint(rest, target, hinge, 0, (60 * Math.PI) / 180);
    // 验证：将 rest 应用 out 后的角度不超过 60°
    const projected = rest.clone().applyQuaternion(out);
    const angle = rest.angleTo(projected);
    expect(angle).toBeLessThanOrEqual((60 * Math.PI) / 180 + 1e-3);
  });

  it('弯曲角度小于 minAngleRad 时被钳制到 min', () => {
    const rest = new THREE.Vector3(1, 0, 0);
    // 反向小角度（绕 hinge 反方向旋转 10°）
    const target = rest.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -(10 * Math.PI) / 180);
    const hinge = new THREE.Vector3(0, 0, 1);
    // min=30°，反向旋转 10° 应被钳制到 min
    const out = constrainHingeJoint(rest, target, hinge, (30 * Math.PI) / 180, (150 * Math.PI) / 180);
    const projected = rest.clone().applyQuaternion(out);
    const angle = rest.angleTo(projected);
    // 应等于 min
    expect(angle).toBeCloseTo((30 * Math.PI) / 180, 4);
  });

  it('弯曲角度在 [min, max] 之间时保持原值', () => {
    const rest = new THREE.Vector3(1, 0, 0);
    const target = rest.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), (45 * Math.PI) / 180);
    const hinge = new THREE.Vector3(0, 0, 1);
    const out = constrainHingeJoint(rest, target, hinge, 0, (90 * Math.PI) / 180);
    const projected = rest.clone().applyQuaternion(out);
    const angle = rest.angleTo(projected);
    expect(angle).toBeCloseTo((45 * Math.PI) / 180, 4);
  });
});

describe('constrainForearmRotation', () => {
  it('单位四元数应直接返回克隆', () => {
    const q = new THREE.Quaternion();
    const hinge = new THREE.Vector3(1, 0, 0);
    const out = constrainForearmRotation(q, hinge);
    expect(quatAngle(out, q)).toBeLessThan(1e-6);
  });

  it('旋前角度超过 80° 时被钳制', () => {
    // 绕 hinge 轴旋转 120°（旋前方向）
    const hinge = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(hinge, (120 * Math.PI) / 180);
    const out = constrainForearmRotation(q, hinge);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(out.w)));
    expect(angle).toBeLessThanOrEqual(ELBOW_PRONATION_MAX_RAD + 1e-3);
  });

  it('旋后角度超过 80° 时被钳制', () => {
    // 绕 hinge 轴反向旋转 120°（旋后方向）
    const hinge = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(hinge, -(120 * Math.PI) / 180);
    const out = constrainForearmRotation(q, hinge);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(out.w)));
    expect(angle).toBeLessThanOrEqual(ELBOW_SUPINATION_MAX_RAD + 1e-3);
  });

  it('自定义旋前/旋后参数应生效', () => {
    const hinge = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(hinge, (90 * Math.PI) / 180);
    // 旋前限制 30°
    const out = constrainForearmRotation(q, hinge, (30 * Math.PI) / 180, (80 * Math.PI) / 180);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(out.w)));
    expect(angle).toBeLessThanOrEqual((30 * Math.PI) / 180 + 1e-3);
  });

  it('不应修改输入四元数', () => {
    const hinge = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(hinge, (120 * Math.PI) / 180);
    const qCopy = q.clone();
    constrainForearmRotation(q, hinge);
    expect(q.equals(qCopy)).toBe(true);
  });
});

describe('applyVRMCConstraints', () => {
  it('无约束时应返回原四元数克隆且 applied=false', () => {
    const upper = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    const lower = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.5, 0.6));
    const constraints = new Map();
    const result = applyVRMCConstraints(upper, lower, 'leftUpperArm', 'leftLowerArm', constraints);
    expect(result.applied).toBe(false);
    expect(quatAngle(result.upper, upper)).toBeLessThan(1e-6);
    expect(quatAngle(result.lower, lower)).toBeLessThan(1e-6);
  });

  it('roll 约束 weight=0 时应不应用并返回 applied=false', () => {
    const upper = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    const lower = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.5, 0.6));
    const constraints = new Map([
      ['leftUpperArm', { type: 'roll' as const, rollAxis: 'x' as const, rollWeight: 0 }],
    ]);
    const result = applyVRMCConstraints(upper, lower, 'leftUpperArm', 'leftLowerArm', constraints);
    expect(result.applied).toBe(false);
  });

  it('roll 约束 weight=0.5 时应将 roll 分量按比例分布到 lowerArm', () => {
    // upperArm 仅绕 X 轴旋转 1.0 弧度
    const upper = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.0);
    const lower = new THREE.Quaternion(); // 单位四元数
    const constraints = new Map([
      ['leftUpperArm', { type: 'roll' as const, rollAxis: 'x' as const, rollWeight: 0.5 }],
    ]);
    const result = applyVRMCConstraints(upper, lower, 'leftUpperArm', 'leftLowerArm', constraints);
    expect(result.applied).toBe(true);
    // upper 应保留 0.5 弧度，lower 应叠加 0.5 弧度
    const upperAngle = 2 * Math.acos(Math.min(1, Math.abs(result.upper.w)));
    const lowerAngle = 2 * Math.acos(Math.min(1, Math.abs(result.lower.w)));
    expect(upperAngle).toBeCloseTo(0.5, 4);
    expect(lowerAngle).toBeCloseTo(0.5, 4);
  });

  it('非 roll 类型约束（aim/rotation）应回退为 applied=false', () => {
    const upper = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    const lower = new THREE.Quaternion();
    const constraints = new Map([
      ['leftUpperArm', { type: 'rotation' as const }],
    ]);
    const result = applyVRMCConstraints(upper, lower, 'leftUpperArm', 'leftLowerArm', constraints);
    expect(result.applied).toBe(false);
  });
});

describe('VRM 约束缓存', () => {
  // 使用最小化的 VRM mock 满足 WeakMap 用法
  function makeVRMMock(): VRM {
    return { humanoid: {} } as unknown as VRM;
  }

  beforeEach(() => {
    // 通过新 VRM 实例避免污染
  });

  it('setVRMConstraintCache 后 getVRMConstraintCache 应返回相同 Map', () => {
    const vrm = makeVRMMock();
    const constraints = new Map([
      ['leftUpperArm', { type: 'roll' as const, rollAxis: 'x' as const, rollWeight: 0.5 }],
    ]);
    setVRMConstraintCache(vrm, constraints);
    const got = getVRMConstraintCache(vrm);
    expect(got).toBe(constraints);
    expect(got.get('leftUpperArm')?.rollWeight).toBe(0.5);
  });

  it('未设置缓存的 VRM 应返回空 Map', () => {
    const vrm = makeVRMMock();
    const got = getVRMConstraintCache(vrm);
    expect(got.size).toBe(0);
  });
});

describe('extractVRMCConstraints', () => {
  /** 构造最小化 VRM mock：humanoid.getNormalizedBoneNode 返回带 userData 的节点 */
  function makeVRMWithNodes(
    nodes: Record<string, { userData?: unknown } | null>,
  ): VRM {
    const humanoid = {
      getNormalizedBoneNode: vi.fn((name: string) => {
        const n = nodes[name];
        if (!n) return null;
        return n.userData !== undefined ? { userData: n.userData } : {};
      }),
    };
    return { humanoid } as unknown as VRM;
  }

  it('VRM 无任何约束时应返回空 Map', () => {
    const vrm = makeVRMWithNodes({
      leftUpperArm: { userData: {} },
      rightUpperArm: { userData: {} },
    });
    const result = extractVRMCConstraints(vrm);
    expect(result.size).toBe(0);
  });

  it('应从 userData.VRMC_node_constraint 提取 roll 约束', () => {
    const vrm = makeVRMWithNodes({
      leftUpperArm: {
        userData: {
          VRMC_node_constraint: {
            roll: { rollAxis: 'x', weight: 0.7 },
          },
        },
      },
    });
    const result = extractVRMCConstraints(vrm);
    expect(result.size).toBe(1);
    const c = result.get('leftUpperArm');
    expect(c?.type).toBe('roll');
    expect(c?.rollAxis).toBe('x');
    expect(c?.rollWeight).toBeCloseTo(0.7, 6);
  });

  it('应从 userData.gltfExtensions.VRMC_node_constraint 提取约束（兼容路径）', () => {
    const vrm = makeVRMWithNodes({
      rightLowerArm: {
        userData: {
          gltfExtensions: {
            VRMC_node_constraint: {
              roll: { rollAxis: 'y', weight: 0.3 },
            },
          },
        },
      },
    });
    const result = extractVRMCConstraints(vrm);
    expect(result.size).toBe(1);
    const c = result.get('rightLowerArm');
    expect(c?.type).toBe('roll');
    expect(c?.rollAxis).toBe('y');
  });

  it('humanoid 抛出异常时应返回空 Map（不抛出）', () => {
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn(() => {
          throw new Error('humanoid 未初始化');
        }),
      },
    } as unknown as VRM;
    expect(() => extractVRMCConstraints(vrm)).not.toThrow();
    const result = extractVRMCConstraints(vrm);
    expect(result.size).toBe(0);
  });
});
