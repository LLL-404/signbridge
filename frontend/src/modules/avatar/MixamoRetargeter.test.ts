/**
 * @file MixamoRetargeter.test.ts
 * @description Mixamo 动画重定向器单元测试
 *
 * 测试覆盖：
 *   - 空轨道应返回空轨道
 *   - 标准 Mixamo → VRM 骨骼名映射（mixamorigHips → hips 等）
 *   - 无法解析的轨道名（无点号）应被跳过
 *   - 未映射的 Mixamo 骨骼（如手指骨）应被跳过
 *   - VRM 中不存在的骨骼节点应跳过
 *   - QuaternionKeyframeTrack 类型保留
 *   - VectorKeyframeTrack 类型保留
 *   - 通用 KeyframeTrack 兜底
 *   - 新轨道名为 node.name + '.property'
 *   - 输出 clip 的 name/duration/blendMode 与输入一致
 *   - 多轨道混合场景
 *
 * 通过 mock VRM.humanoid.getNormalizedBoneNode 隔离 VRM 加载。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

// Mock logger，避免依赖 import.meta.env
vi.mock('@/modules/debug/logger', () => ({
  logger: {
    module: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { retarget } from './MixamoRetargeter';

/** 构造最小化 VRM mock：boneName → node 名（与 VRM 标准骨骼同名） */
function makeVRM(boneMap: Record<string, string | null>): VRM {
  const humanoid = {
    getNormalizedBoneNode: vi.fn((name: string) => {
      const nodeName = boneMap[name];
      if (nodeName === null) return null;
      return { name: nodeName };
    }),
  };
  return { humanoid } as unknown as VRM;
}

/** 构造一个最小化的 AnimationClip */
function makeClip(
  tracks: THREE.KeyframeTrack[],
  name = 'testClip',
  duration = 1.0,
  blendMode: THREE.AnimationBlendMode = THREE.NormalAnimationBlendMode,
): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, tracks, blendMode);
}

describe('MixamoRetargeter retarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('空轨道应返回空轨道的新 clip', () => {
    const vrm = makeVRM({ hips: 'hips' });
    const input = makeClip([]);
    const out = retarget(input, vrm);
    expect(out.tracks.length).toBe(0);
    // name/duration/blendMode 应保留
    expect(out.name).toBe('testClip');
    expect(out.duration).toBe(1.0);
  });

  it('标准 mixamorigHips.quaternion 应映射到 hips 节点并保留类型', () => {
    const vrm = makeVRM({ hips: 'hips' });
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigHips.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1],
    );
    const input = makeClip([track]);
    const out = retarget(input, vrm);
    expect(out.tracks.length).toBe(1);
    expect(out.tracks[0].name).toBe('hips.quaternion');
    expect(out.tracks[0]).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
  });

  it('mixamorigSpine1 → chest 映射应正确', () => {
    const vrm = makeVRM({ chest: 'chest' });
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigSpine1.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks.length).toBe(1);
    expect(out.tracks[0].name).toBe('chest.quaternion');
  });

  it('mixamorigLeftArm → leftUpperArm 映射应正确', () => {
    const vrm = makeVRM({ leftUpperArm: 'leftUpperArm' });
    const track = new THREE.VectorKeyframeTrack(
      'mixamorigLeftArm.position',
      [0, 1],
      [0, 0, 0, 0.1, 0.1, 0.1],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks.length).toBe(1);
    expect(out.tracks[0].name).toBe('leftUpperArm.position');
    expect(out.tracks[0]).toBeInstanceOf(THREE.VectorKeyframeTrack);
  });

  it('mixamorigRightForeArm → rightLowerArm 映射应正确', () => {
    const vrm = makeVRM({ rightLowerArm: 'rightLowerArm' });
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigRightForeArm.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks[0].name).toBe('rightLowerArm.quaternion');
  });

  it('腿部 mixamorigLeftUpLeg → leftUpperLeg 映射应正确', () => {
    const vrm = makeVRM({ leftUpperLeg: 'leftUpperLeg' });
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigLeftUpLeg.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks[0].name).toBe('leftUpperLeg.quaternion');
  });

  it('无法解析的轨道名（无点号）应被跳过', () => {
    const vrm = makeVRM({ hips: 'hips' });
    // 用通用 KeyframeTrack 直接构造一个无点号的轨道
    const track = new THREE.KeyframeTrack(
      'invalidTrackName',
      [0],
      [1, 2, 3],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks.length).toBe(0);
  });

  it('未映射的 Mixamo 骨骼（如手指骨）应被跳过', () => {
    const vrm = makeVRM({ hips: 'hips' });
    // mixamorigLeftHandThumb1 不在映射表中
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigLeftHandThumb1.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks.length).toBe(0);
  });

  it('VRM 中不存在的骨骼节点应被跳过', () => {
    // VRM 中无 hips 节点（返回 null）
    const vrm = makeVRM({ hips: null });
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigHips.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks.length).toBe(0);
  });

  it('通用 KeyframeTrack（非 Quaternion/Vector）应兜底重建', () => {
    const vrm = makeVRM({ hips: 'hips' });
    // NumberKeyframeTrack 是非 Quaternion/Vector 的具体子类
    const track = new THREE.NumberKeyframeTrack(
      'mixamorigHips.scale',
      [0, 1],
      [1, 2],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks.length).toBe(1);
    expect(out.tracks[0].name).toBe('hips.scale');
    // 重建后类型保留为 NumberKeyframeTrack（兜底使用通用 KeyframeTrack 构造）
    expect(out.tracks[0]).toBeInstanceOf(THREE.KeyframeTrack);
  });

  it('输出 clip 的 name/duration/blendMode 应与输入一致', () => {
    const vrm = makeVRM({ hips: 'hips' });
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigHips.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const input = makeClip([track], 'customName', 3.5, THREE.AdditiveAnimationBlendMode);
    const out = retarget(input, vrm);
    expect(out.name).toBe('customName');
    expect(out.duration).toBe(3.5);
    expect(out.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
  });

  it('多轨道混合场景：有效轨道、无效轨道、未映射轨道同时存在', () => {
    const vrm = makeVRM({
      hips: 'hips',
      spine: 'spine',
      head: 'head',
    });
    const valid1 = new THREE.QuaternionKeyframeTrack(
      'mixamorigHips.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const valid2 = new THREE.QuaternionKeyframeTrack(
      'mixamorigSpine.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const invalid = new THREE.KeyframeTrack('noDot', [0], [0]); // 无点号
    const unmapped = new THREE.QuaternionKeyframeTrack(
      'mixamorigLeftHandThumb1.quaternion',
      [0],
      [0, 0, 0, 1],
    ); // 未映射
    const valid3 = new THREE.QuaternionKeyframeTrack(
      'mixamorigHead.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const input = makeClip([valid1, valid2, invalid, unmapped, valid3]);
    const out = retarget(input, vrm);
    // 应只有 3 条有效映射
    expect(out.tracks.length).toBe(3);
    expect(out.tracks[0].name).toBe('hips.quaternion');
    expect(out.tracks[1].name).toBe('spine.quaternion');
    expect(out.tracks[2].name).toBe('head.quaternion');
  });

  it('应保留原始 times 和 values 数据', () => {
    const vrm = makeVRM({ hips: 'hips' });
    const times = [0, 0.5, 1.0];
    const values = [0, 0, 0, 1, 0.1, 0.1, 0.1, 0.9, 0, 0, 0, 1];
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigHips.quaternion',
      times,
      values,
    );
    const out = retarget(makeClip([track]), vrm);
    const newTrack = out.tracks[0] as THREE.QuaternionKeyframeTrack;
    // times 与 values 应被复制（Float32Array 存在精度损失，使用 toBeCloseTo 容忍）
    const newTimes = Array.from(newTrack.times);
    const newValues = Array.from(newTrack.values);
    expect(newTimes.length).toBe(times.length);
    newTimes.forEach((t, i) => expect(t).toBeCloseTo(times[i], 5));
    expect(newValues.length).toBe(values.length);
    newValues.forEach((v, i) => expect(v).toBeCloseTo(values[i], 5));
  });

  it('新轨道名使用 VRM node.name 而非 VRM 骨骼规范名', () => {
    // VRM 节点 name 与规范骨骼名不同（如 'J_Bip_Hips'）
    const vrm = makeVRM({ hips: 'J_Bip_Hips' });
    const track = new THREE.QuaternionKeyframeTrack(
      'mixamorigHips.quaternion',
      [0],
      [0, 0, 0, 1],
    );
    const out = retarget(makeClip([track]), vrm);
    expect(out.tracks[0].name).toBe('J_Bip_Hips.quaternion');
  });
});
