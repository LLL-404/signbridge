/**
 * @file ClipBuilder.sign-correctness.test.ts
 * @description 验证骨骼动作能正确表示手语动作的端到端测试
 *
 * 测试覆盖：
 *   1. buildHeadMovementTrack: 验证头部动作轨道的实际输出
 *   2. buildFingerTracks: 验证手指三轴旋转（含外展）的实际输出
 *   3. buildClip 端到端: 验证完整 clip 包含正确的轨道结构
 *
 * 参考项目：
 *   - MMS-Player (DFKI): 参数化手语动画，强调手形精确性
 *   - DexAvatar: 强调"精确手形和方向是手语意义的关键"
 *   - VulcanV3: 手指外展是手语关键自由度（食指/小指 100°，中指/无名指 45°）
 *   - IK-AUG: 使用 FABRIK 进行生物力学合理的 IK 求解
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { ClipBuilder, buildHeadMovementTrack, buildFingerTracks } from './ClipBuilder';
import { HandShape, HeadMovement } from '@/types/sign';
import type { SignGloss } from '@/types/sign';

// ===== VRM Mock 工厂 =====

/**
 * 创建模拟的 VRM 骨骼节点
 * 每个节点是一个 THREE.Object3D，设置了 .name 属性供 buildTrackName 使用
 */
function createMockBoneNode(name: string): THREE.Object3D {
  const node = new THREE.Object3D();
  node.name = name;
  // 设置位置使 IK 计算不退化
  node.position.set(0, 0, 0);
  return node;
}

/** 所有需要的 VRM 骨骼名 */
const ALL_BONE_NAMES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  // 手指骨骼（每手 15 个）
  ...['left', 'right'].flatMap(prefix => [
    `${prefix}ThumbMetacarpal`, `${prefix}ThumbProximal`, `${prefix}ThumbDistal`,
    `${prefix}IndexProximal`, `${prefix}IndexIntermediate`, `${prefix}IndexDistal`,
    `${prefix}MiddleProximal`, `${prefix}MiddleIntermediate`, `${prefix}MiddleDistal`,
    `${prefix}RingProximal`, `${prefix}RingIntermediate`, `${prefix}RingDistal`,
    `${prefix}LittleProximal`, `${prefix}LittleIntermediate`, `${prefix}LittleDistal`,
  ]),
];

/**
 * 创建完整的 VRM mock 对象
 * 包含 humanoid（带 getNormalizedBoneNode）、scene、expressionManager
 */
function createMockVRM(): VRM {
  // 创建所有骨骼节点
  const boneMap = new Map<string, THREE.Object3D>();
  for (const name of ALL_BONE_NAMES) {
    boneMap.set(name, createMockBoneNode(name));
  }

  // 设置合理的骨骼层级位置（T-pose）
  const hips = boneMap.get('hips')!;
  hips.position.set(0, 0.9, 0);

  const spine = boneMap.get('spine')!;
  spine.position.set(0, 0.1, 0);

  const chest = boneMap.get('chest')!;
  chest.position.set(0, 0.15, 0);

  const neck = boneMap.get('neck')!;
  neck.position.set(0, 0.2, 0);

  const head = boneMap.get('head')!;
  head.position.set(0, 0.1, 0);

  const leftUpperArm = boneMap.get('leftUpperArm')!;
  leftUpperArm.position.set(-0.15, 0.05, 0);

  const rightUpperArm = boneMap.get('rightUpperArm')!;
  rightUpperArm.position.set(0.15, 0.05, 0);

  const leftLowerArm = boneMap.get('leftLowerArm')!;
  leftLowerArm.position.set(-0.28, 0, 0);

  const rightLowerArm = boneMap.get('rightLowerArm')!;
  rightLowerArm.position.set(0.28, 0, 0);

  // 构建 scene
  const scene = new THREE.Scene();
  // 将骨骼添加到场景
  for (const [, node] of boneMap) {
    scene.add(node);
  }

  // 构建 humanoid mock
  const humanoid = {
    getNormalizedBoneNode(name: string): THREE.Object3D | null {
      return boneMap.get(name) ?? null;
    },
  };

  // 构建 expressionManager mock
  const expressionValues: Record<string, number> = {};
  const expressionManager = {
    setValue(preset: string, value: number): void {
      expressionValues[preset] = value;
    },
    getValue(preset: string): number {
      return expressionValues[preset] ?? 0;
    },
  };

  // 给 scene 添加 expressionManager 代理（与 ClipBuilder 中的用法一致）
  const expressionProxy = new THREE.Object3D();
  expressionProxy.name = 'expressionManager';
  scene.add(expressionProxy);

  return {
    humanoid,
    scene,
    expressionManager,
  } as unknown as VRM;
}

// ===== 测试 =====

describe('buildHeadMovementTrack — 头部动作轨道验证', () => {
  const vrm = createMockVRM();
  const durationSec = 1.2;

  it('NONE 应返回空数组', () => {
    const tracks = buildHeadMovementTrack(HeadMovement.NONE, vrm, durationSec);
    expect(tracks).toHaveLength(0);
  });

  it('NOD 应生成 neck + head 两条轨道', () => {
    const tracks = buildHeadMovementTrack(HeadMovement.NOD, vrm, durationSec);
    expect(tracks).toHaveLength(2);
    // 轨道名应包含 neck 和 head
    const trackNames = tracks.map(t => t.name);
    expect(trackNames.some(n => n.includes('neck'))).toBe(true);
    expect(trackNames.some(n => n.includes('head'))).toBe(true);
  });

  it('NOD 轨道的四元数应为非零旋转（X 轴点头）', () => {
    const tracks = buildHeadMovementTrack(HeadMovement.NOD, vrm, durationSec);
    const neckTrack = tracks.find(t => t.name.includes('neck'));
    expect(neckTrack).toBeDefined();
    // 关键帧值：每 4 个数字为一个四元数 [x, y, z, w]
    const values = neckTrack!.values;
    // 至少有一个关键帧的 X 分量（索引 0, 4, 8...）应非零
    let hasNonZeroX = false;
    for (let i = 0; i < values.length; i += 4) {
      if (Math.abs(values[i]) > 1e-6) hasNonZeroX = true;
    }
    expect(hasNonZeroX).toBe(true);
  });

  it('SHAKE 应生成 Y 轴旋转（摇头）', () => {
    const tracks = buildHeadMovementTrack(HeadMovement.SHAKE, vrm, durationSec);
    const neckTrack = tracks.find(t => t.name.includes('neck'));
    expect(neckTrack).toBeDefined();
    const values = neckTrack!.values;
    // 至少有一个关键帧的 Y 分量（索引 1, 5, 9...）应非零
    let hasNonZeroY = false;
    for (let i = 0; i < values.length; i += 4) {
      if (Math.abs(values[i + 1]) > 1e-6) hasNonZeroY = true;
    }
    expect(hasNonZeroY).toBe(true);
  });

  it('TILT_LEFT 应生成 Z 轴旋转', () => {
    const tracks = buildHeadMovementTrack(HeadMovement.TILT_LEFT, vrm, durationSec);
    const neckTrack = tracks.find(t => t.name.includes('neck'));
    const values = neckTrack!.values;
    let hasNonZeroZ = false;
    for (let i = 0; i < values.length; i += 4) {
      if (Math.abs(values[i + 2]) > 1e-6) hasNonZeroZ = true;
    }
    expect(hasNonZeroZ).toBe(true);
  });

  it('SLIGHT_BOW 应生成持续前俯（中间帧 X 非零且不回零）', () => {
    const tracks = buildHeadMovementTrack(HeadMovement.SLIGHT_BOW, vrm, durationSec);
    const neckTrack = tracks.find(t => t.name.includes('neck'));
    const values = neckTrack!.values;
    // SLIGHT_BOW 的 amplitude 序列为 [0, -1, -1, -0.5]
    // 第 2 个关键帧（index 1）的 X 应非零（持续前俯）
    const secondKeyframeX = values[4]; // 第 2 个四元数的 x
    expect(Math.abs(secondKeyframeX)).toBeGreaterThan(1e-6);
  });

  it('neck 旋转幅度应为 head 的 1.5 倍（60% vs 40%）', () => {
    const tracks = buildHeadMovementTrack(HeadMovement.NOD, vrm, durationSec);
    const neckTrack = tracks.find(t => t.name.includes('neck'));
    const headTrack = tracks.find(t => t.name.includes('head'));
    // 取第 2 个关键帧的 X 分量
    const neckX = Math.abs(neckTrack!.values[4]);
    const headX = Math.abs(headTrack!.values[4]);
    // neck 应大于 head（60% > 40%）
    expect(neckX).toBeGreaterThan(headX);
  });
});

describe('buildFingerTracks — 手指三轴旋转验证', () => {
  const vrm = createMockVRM();
  const durationSec = 1.0;

  it('OPEN_5 应生成 15 条手指轨道', () => {
    const tracks = buildFingerTracks(vrm, 'right', HandShape.OPEN_5, HandShape.OPEN_5, durationSec);
    expect(tracks).toHaveLength(15);
  });

  it('OPEN_5 食指 proximal 应有非零 Y 分量（外展）', () => {
    const tracks = buildFingerTracks(vrm, 'right', HandShape.OPEN_5, HandShape.OPEN_5, durationSec);
    // 找到 rightIndexProximal 轨道
    const indexProxTrack = tracks.find(t => t.name.includes('rightIndexProximal'));
    expect(indexProxTrack).toBeDefined();
    const values = indexProxTrack!.values;
    // 起始关键帧的 Y 分量（索引 1）应非零
    const startY = values[1];
    expect(Math.abs(startY)).toBeGreaterThan(1e-6);
  });

  it('OPEN_5 中指 proximal 的 Y 分量应为零（基准指）', () => {
    const tracks = buildFingerTracks(vrm, 'right', HandShape.OPEN_5, HandShape.OPEN_5, durationSec);
    const middleProxTrack = tracks.find(t => t.name.includes('rightMiddleProximal'));
    expect(middleProxTrack).toBeDefined();
    const values = middleProxTrack!.values;
    // 中指是基准指，Y 外展 = 0
    expect(Math.abs(values[1])).toBeLessThan(1e-10);
  });

  it('V_SHAPE 食指和中指应有相反方向的 Y 外展', () => {
    const tracks = buildFingerTracks(vrm, 'right', HandShape.V_SHAPE, HandShape.V_SHAPE, durationSec);
    const indexTrack = tracks.find(t => t.name.includes('rightIndexProximal'));
    const middleTrack = tracks.find(t => t.name.includes('rightMiddleProximal'));
    expect(indexTrack).toBeDefined();
    expect(middleTrack).toBeDefined();
    const indexY = indexTrack!.values[1];
    const middleY = middleTrack!.values[1];
    // 食指 Y = -15°，中指 Y = +15°，方向相反
    expect(indexY * middleY).toBeLessThan(0);
  });

  it('左手 Y 外展应与右手镜像（符号相反）', () => {
    const rightTracks = buildFingerTracks(vrm, 'right', HandShape.OPEN_5, HandShape.OPEN_5, durationSec);
    const leftTracks = buildFingerTracks(vrm, 'left', HandShape.OPEN_5, HandShape.OPEN_5, durationSec);
    const rightIndex = rightTracks.find(t => t.name.includes('rightIndexProximal'));
    const leftIndex = leftTracks.find(t => t.name.includes('leftIndexProximal'));
    const rightY = rightIndex!.values[1];
    const leftY = leftIndex!.values[1];
    // 左右手 Y 符号应相反
    expect(rightY * leftY).toBeLessThan(0);
  });

  it('FIST_A 食指 proximal 应有非零 X 分量（屈曲）', () => {
    const tracks = buildFingerTracks(vrm, 'right', HandShape.FIST_A, HandShape.FIST_A, durationSec);
    const indexProxTrack = tracks.find(t => t.name.includes('rightIndexProximal'));
    const values = indexProxTrack!.values;
    // X 分量（屈曲）应大于 0.5 弧度
    expect(values[0]).toBeGreaterThan(0.5);
  });
});

describe('ClipBuilder.buildClip — 端到端轨道结构验证', () => {
  const vrm = createMockVRM();

  it('包含 head_movement 的词汇应生成 neck/head 轨道', () => {
    const gloss: SignGloss = {
      gloss_id: 'test_001',
      chinese: '你好',
      english: 'hello',
      category: '日常问候',
      difficulty: 1,
      manual: {
        handshape_start: 'open_5',
        handshape_end: 'open_5',
        location_start: 'chest_center',
        location_end: 'face_level',
        movement: 'upward',
        palm_orientation: 'inward',
        is_two_handed: false,
        dominant_hand: 'right',
      },
      non_manual: {
        expression: 'happy',
        head_movement: 'nod',
      },
      duration_ms: 1200,
      source: 'test',
    };

    const clip = ClipBuilder.buildClip(gloss, vrm);

    // clip 应有轨道
    expect(clip.tracks.length).toBeGreaterThan(0);

    // 应包含 neck 或 head 轨道
    const hasHeadTrack = clip.tracks.some(
      t => t.name.includes('neck') || t.name.includes('head')
    );
    expect(hasHeadTrack).toBe(true);
  });

  it('head_movement 为 none 时不应生成 head 轨道', () => {
    const gloss: SignGloss = {
      gloss_id: 'test_002',
      chinese: '再见',
      english: 'goodbye',
      category: '日常问候',
      difficulty: 1,
      manual: {
        handshape_start: 'open_5',
        handshape_end: 'open_5',
        location_start: 'face_level',
        location_end: 'face_level',
        movement: 'horizontal_line',
        palm_orientation: 'outward',
        is_two_handed: false,
        dominant_hand: 'right',
      },
      non_manual: {
        expression: 'neutral',
        head_movement: 'none',
      },
      duration_ms: 1500,
      source: 'test',
    };

    const clip = ClipBuilder.buildClip(gloss, vrm);

    // 不应包含 neck 或 head 轨道
    const hasHeadTrack = clip.tracks.some(
      t => t.name.includes('neck') || t.name.includes('head')
    );
    expect(hasHeadTrack).toBe(false);
  });

  it('clip 应包含手指轨道（至少 15 条）', () => {
    const gloss: SignGloss = {
      gloss_id: 'test_003',
      chinese: '谢谢',
      english: 'thank_you',
      category: '日常问候',
      difficulty: 1,
      manual: {
        handshape_start: 'open_5',
        handshape_end: 'open_5',
        location_start: 'chin_level',
        location_end: 'neutral',
        movement: 'away_from_body',
        palm_orientation: 'outward',
        is_two_handed: false,
        dominant_hand: 'right',
      },
      non_manual: {
        expression: 'happy',
        head_movement: 'slight_nod',
      },
      duration_ms: 1400,
      source: 'test',
    };

    const clip = ClipBuilder.buildClip(gloss, vrm);

    // 统计手指轨道（名称包含 Proximal/Intermediate/Distal/Metacarpal）
    const fingerTracks = clip.tracks.filter(
      t => t.name.includes('Proximal') || t.name.includes('Intermediate') ||
           t.name.includes('Distal') || t.name.includes('Metacarpal')
    );
    expect(fingerTracks.length).toBeGreaterThanOrEqual(15);
  });

  it('双手词汇应生成 30 条手指轨道', () => {
    const gloss: SignGloss = {
      gloss_id: 'test_004',
      chinese: '朋友',
      english: 'friend',
      category: '日常问候',
      difficulty: 2,
      manual: {
        handshape_start: 'hook',
        handshape_end: 'hook',
        location_start: 'chest_right',
        location_end: 'chest_left',
        movement: 'hook_together',
        palm_orientation: 'inward',
        is_two_handed: true,
        dominant_hand: 'right',
      },
      non_manual: {
        expression: 'happy',
        head_movement: 'slight_nod',
      },
      duration_ms: 1600,
      source: 'test',
    };

    const clip = ClipBuilder.buildClip(gloss, vrm);

    // 双手应有 30 条手指轨道
    const fingerTracks = clip.tracks.filter(
      t => t.name.includes('Proximal') || t.name.includes('Intermediate') ||
           t.name.includes('Distal') || t.name.includes('Metacarpal')
    );
    expect(fingerTracks.length).toBe(30);
  });

  it('clip duration 应与词汇 duration_ms 一致', () => {
    const gloss: SignGloss = {
      gloss_id: 'test_005',
      chinese: '测试',
      english: 'test',
      category: '测试',
      difficulty: 1,
      manual: {
        handshape_start: 'open_5',
        handshape_end: 'fist_a',
        location_start: 'neutral',
        location_end: 'chest_center',
        movement: 'toward_body',
        palm_orientation: 'inward',
        is_two_handed: false,
        dominant_hand: 'right',
      },
      non_manual: {
        expression: 'neutral',
        head_movement: 'none',
      },
      duration_ms: 2000,
      source: 'test',
    };

    const clip = ClipBuilder.buildClip(gloss, vrm);
    expect(clip.duration).toBeCloseTo(2.0, 1);
  });
});
