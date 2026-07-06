import { describe, it, expect } from 'vitest';
import { NEUTRAL_POSE } from '@/types/avatar';
import { bonePoseToVRM, vrmPoseToBone } from './VRMPoseAdapter';

describe('VRMPoseAdapter', () => {
  it('bonePoseToVRM 应映射 17 关节到 VRM 骨骼名', () => {
    const vrm = bonePoseToVRM(NEUTRAL_POSE);
    expect(vrm.bones.hips).toBeDefined();
    expect(vrm.bones.spine).toBeDefined();
    expect(vrm.bones.leftUpperArm).toBeDefined();
    expect(vrm.bones.leftLowerLeg).toBeDefined();
  });

  it('vrmPoseToBone 应反向映射回旧 BonePose 字段', () => {
    const vrm = bonePoseToVRM(NEUTRAL_POSE);
    const back = vrmPoseToBone(vrm);
    expect(back.root).toBeDefined();
    expect(back.left_shoulder).toBeDefined();
    expect(back.left_knee).toBeDefined();
  });
});
