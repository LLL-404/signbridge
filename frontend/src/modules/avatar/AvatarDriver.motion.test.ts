// AvatarDriver.motion.test.ts
import { describe, it, expect } from 'vitest';
import { type SignGloss, HandShape, HandLocation, Movement } from '@/types/sign';
import { generateMotion } from './AvatarDriver';

const makeGloss = (overrides: Partial<SignGloss['manual']> = {}): SignGloss => ({
  gloss_id: 'test_001',
  chinese: '测试',
  category: '测试',
  difficulty: 1,
  manual: {
    handshape_start: HandShape.OPEN_5,
    handshape_end: HandShape.OPEN_5,
    location_start: HandLocation.CHEST_CENTER,
    location_end: HandLocation.CHEST_CENTER,
    movement: Movement.STATIC,
    palm_orientation: 'inward',
    is_two_handed: false,
    dominant_hand: 'right',
    ...overrides,
  },
  non_manual: { expression: 'neutral', head_movement: 'none' },
  duration_ms: 1000,
  source: 'test',
});

describe('generateMotion', () => {
  it('静态词应生成 2 个关键帧', () => {
    const motion = generateMotion(makeGloss({ movement: Movement.STATIC }));
    expect(motion.keyframes).toHaveLength(2);
    expect(motion.keyframes[0].time).toBe(0);
    expect(motion.keyframes[1].time).toBe(1);
  });

  it('直线运动应生成 3 个关键帧（起/中/终）', () => {
    const motion = generateMotion(makeGloss({
      movement: Movement.UPWARD,
      location_start: HandLocation.WAIST_LEVEL,
      location_end: HandLocation.CHEST_CENTER,
    }));
    expect(motion.keyframes).toHaveLength(3);
    expect(motion.keyframes[1].time).toBeCloseTo(0.5);
  });

  it('关键帧应含 IK 目标', () => {
    const motion = generateMotion(makeGloss({ movement: Movement.UPWARD }));
    expect(motion.keyframes[0].pose.ikTargets?.rightHand).toBeDefined();
  });

  it('duration_ms 应透传', () => {
    const motion = generateMotion(makeGloss({}));
    expect(motion.duration_ms).toBe(1000);
  });
});

describe('generateMotion 曲线/折线', () => {
  it('upward_arc 应生成 5 个关键帧', () => {
    const motion = generateMotion(makeGloss({
      movement: Movement.UPWARD_ARC,
      location_start: HandLocation.WAIST_LEVEL,
      location_end: HandLocation.FOREHEAD_LEVEL,
    }));
    expect(motion.keyframes).toHaveLength(5);
  });

  it('circular 应生成 5 个关键帧', () => {
    const motion = generateMotion(makeGloss({
      movement: Movement.CIRCULAR,
      location_start: HandLocation.CHEST_CENTER,
      location_end: HandLocation.CHEST_CENTER,
    }));
    expect(motion.keyframes).toHaveLength(5);
  });

  it('zigzag 应生成 5 个关键帧', () => {
    const motion = generateMotion(makeGloss({
      movement: Movement.ZIGZAG,
      location_start: HandLocation.CHEST_CENTER,
      location_end: HandLocation.CHEST_CENTER,
    }));
    expect(motion.keyframes).toHaveLength(5);
  });

  it('双手动作应含左右两个 IK 目标', () => {
    const motion = generateMotion(makeGloss({
      is_two_handed: true,
      movement: Movement.STATIC,
    }));
    expect(motion.keyframes[0].pose.ikTargets?.leftHand).toBeDefined();
    expect(motion.keyframes[0].pose.ikTargets?.rightHand).toBeDefined();
  });
});
