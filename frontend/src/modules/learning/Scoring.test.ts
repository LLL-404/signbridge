import { describe, it, expect } from 'vitest';
import { PracticeScorer, generateStandardKeypoints } from './Scoring';
import type { FrameKeypoints, HandKeypoint } from '@/types/recognition';
import type { SignGloss } from '@/types/sign';

function createHandAt(x: number, y: number, fingertipSpread: number = 0.05): HandKeypoint[] {
  const points: HandKeypoint[] = [];
  points.push({ x, y, z: 0 });
  for (let f = 0; f < 5; f++) {
    const fingerX = x + (f - 2) * 0.02;
    for (let j = 1; j <= 4; j++) {
      points.push({
        x: fingerX,
        y: y - j * fingertipSpread,
        z: 0,
      });
    }
  }
  return points;
}

function createFrame(rightX: number, rightY: number, leftX?: number, leftY?: number): FrameKeypoints {
  return {
    right_hand: createHandAt(rightX, rightY),
    left_hand: leftX !== undefined && leftY !== undefined ? createHandAt(leftX, leftY) : null,
    timestamp: 0,
  };
}

function createMovingSequence(
  startX: number, startY: number,
  endX: number, endY: number,
  frames: number,
): FrameKeypoints[] {
  const result: FrameKeypoints[] = [];
  for (let i = 0; i < frames; i++) {
    const t = frames > 1 ? i / (frames - 1) : 0;
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;
    result.push({
      ...createFrame(x, y),
      timestamp: i * 33,
    });
  }
  return result;
}

describe('PracticeScorer', () => {
  const scorer = new PracticeScorer();

  describe('empty input handling', () => {
    it('should return zero score for empty user sequence', () => {
      const standard = createMovingSequence(0.5, 0.5, 0.5, 0.3, 10);
      const result = scorer.score([], standard);
      expect(result.total_score).toBe(0);
      expect(result.handshape_score).toBe(0);
      expect(result.position_score).toBe(0);
      expect(result.motion_score).toBe(0);
      expect(result.feedback).toBe('未捕捉到有效动作，请重试');
      expect(result.aligned_frames).toEqual([]);
    });

    it('should return zero score for empty standard sequence', () => {
      const user = createMovingSequence(0.5, 0.5, 0.5, 0.3, 10);
      const result = scorer.score(user, []);
      expect(result.total_score).toBe(0);
      expect(result.aligned_frames).toEqual([]);
    });

    it('should return zero score for both empty sequences', () => {
      const result = scorer.score([], []);
      expect(result.total_score).toBe(0);
    });
  });

  describe('identical sequences', () => {
    it('should give high score for identical single-hand motion', () => {
      const seq = createMovingSequence(0.5, 0.7, 0.5, 0.3, 15);
      const result = scorer.score(seq, seq);
      expect(result.total_score).toBeGreaterThan(80);
      expect(result.handshape_score).toBeGreaterThan(80);
      expect(result.position_score).toBeGreaterThan(80);
      expect(result.aligned_frames.length).toBeGreaterThan(0);
    });

    it('should produce aligned frames with similarity close to 1 for identical motion', () => {
      const seq = createMovingSequence(0.3, 0.6, 0.7, 0.6, 10);
      const result = scorer.score(seq, seq);
      const avgSim = result.aligned_frames.reduce((s, f) => s + f.similarity, 0) / result.aligned_frames.length;
      expect(avgSim).toBeGreaterThan(0.8);
    });
  });

  describe('different sequences', () => {
    it('should give lower score for very different positions', () => {
      const user = createMovingSequence(0.1, 0.1, 0.1, 0.1, 10);
      const standard = createMovingSequence(0.9, 0.9, 0.9, 0.9, 10);
      const result = scorer.score(user, standard);
      expect(result.total_score).toBeLessThan(70);
    });
  });

  describe('score ranges', () => {
    it('all scores should be between 0 and 100', () => {
      const user = createMovingSequence(0.5, 0.5, 0.6, 0.4, 12);
      const standard = createMovingSequence(0.5, 0.5, 0.5, 0.3, 15);
      const result = scorer.score(user, standard);
      expect(result.total_score).toBeGreaterThanOrEqual(0);
      expect(result.total_score).toBeLessThanOrEqual(100);
      expect(result.handshape_score).toBeGreaterThanOrEqual(0);
      expect(result.handshape_score).toBeLessThanOrEqual(100);
      expect(result.position_score).toBeGreaterThanOrEqual(0);
      expect(result.position_score).toBeLessThanOrEqual(100);
      expect(result.motion_score).toBeGreaterThanOrEqual(0);
      expect(result.motion_score).toBeLessThanOrEqual(100);
    });
  });

  describe('feedback generation', () => {
    it('should give excellent feedback for very high score', () => {
      const seq = createMovingSequence(0.5, 0.5, 0.5, 0.3, 15);
      const result = scorer.score(seq, seq);
      if (result.total_score >= 90) {
        expect(result.feedback).toContain('优秀');
      }
    });

    it('should return non-empty feedback string', () => {
      const user = createMovingSequence(0.4, 0.6, 0.6, 0.4, 10);
      const standard = createMovingSequence(0.5, 0.5, 0.5, 0.3, 12);
      const result = scorer.score(user, standard);
      expect(result.feedback).toBeTruthy();
      expect(typeof result.feedback).toBe('string');
    });
  });

  describe('aligned frames', () => {
    it('should have user and standard frames in aligned pairs', () => {
      const user = createMovingSequence(0.5, 0.5, 0.5, 0.3, 8);
      const standard = createMovingSequence(0.5, 0.5, 0.5, 0.3, 10);
      const result = scorer.score(user, standard);
      expect(result.aligned_frames.length).toBeGreaterThan(0);
      for (const frame of result.aligned_frames) {
        expect(frame.user).toBeDefined();
        expect(frame.standard).toBeDefined();
        expect(frame.similarity).toBeGreaterThanOrEqual(0);
        expect(frame.similarity).toBeLessThanOrEqual(1);
      }
    });
  });
});

function createTestGloss(overrides: Partial<SignGloss> = {}): SignGloss {
  return {
    gloss_id: 'test_gloss',
    chinese: '测试',
    category: '测试',
    difficulty: 1,
    manual: {
      dominant_hand: 'right',
      handshape_start: 'open_5',
      handshape_end: 'open_5',
      location_start: 'chest_center',
      location_end: 'chest_center',
      movement: 'static',
      palm_orientation: 'inward',
      is_two_handed: false,
    },
    non_manual: {
      expression: 'neutral',
      head_movement: 'none',
    },
    duration_ms: 1000,
    source: 'test',
    ...overrides,
  };
}

describe('generateStandardKeypoints', () => {
  it('should generate keypoints from gloss manual parameters', () => {
    const gloss = createTestGloss({
      gloss_id: 'test_hello',
      chinese: '你好',
      manual: {
        dominant_hand: 'right',
        handshape_start: 'open_5',
        handshape_end: 'open_5',
        location_start: 'chest_center',
        location_end: 'chest_center',
        movement: 'rightward',
        palm_orientation: 'inward',
        is_two_handed: false,
      },
    });
    const frames = generateStandardKeypoints(gloss, 20);
    expect(frames.length).toBe(20);
    expect(frames[0].right_hand).not.toBeNull();
    expect(frames[0].left_hand).toBeNull();
    expect(frames[0].timestamp).toBe(0);
    expect(frames[19].timestamp).toBe(19 * 33);
  });

  it('should generate two-handed keypoints for two-handed signs', () => {
    const gloss = createTestGloss({
      gloss_id: 'test_two',
      chinese: '谢谢',
      manual: {
        dominant_hand: 'right',
        handshape_start: 'flat_b',
        handshape_end: 'flat_b',
        location_start: 'chin_level',
        location_end: 'chin_level',
        movement: 'downward',
        palm_orientation: 'inward',
        is_two_handed: true,
      },
      non_manual: {
        expression: 'happy',
        head_movement: 'slight_nod',
      },
    });
    const frames = generateStandardKeypoints(gloss, 10);
    expect(frames.length).toBe(10);
    expect(frames[0].right_hand).not.toBeNull();
    expect(frames[0].left_hand).not.toBeNull();
  });

  it('should use default frame count when not specified', () => {
    const gloss = createTestGloss({
      gloss_id: 'test_default',
      chinese: '我',
      category: '代词',
      manual: {
        dominant_hand: 'right',
        handshape_start: 'index_point',
        handshape_end: 'index_point',
        location_start: 'chest_center',
        location_end: 'chest_center',
        movement: 'static',
        palm_orientation: 'inward',
        is_two_handed: false,
      },
    });
    const frames = generateStandardKeypoints(gloss);
    expect(frames.length).toBe(30);
  });

  it('should use existing keypoints when provided', () => {
    const mockKeypointFrame = new Array(126).fill(0.5);
    const gloss = createTestGloss({
      gloss_id: 'test_existing',
      chinese: '有',
      category: '动词',
      manual: {
        dominant_hand: 'right',
        handshape_start: 'fist_a',
        handshape_end: 'fist_a',
        location_start: 'chest_center',
        location_end: 'chest_center',
        movement: 'static',
        palm_orientation: 'inward',
        is_two_handed: false,
      },
      keypoints: [mockKeypointFrame],
    });
    const frames = generateStandardKeypoints(gloss);
    expect(frames.length).toBe(1);
    expect(frames[0].right_hand).not.toBeNull();
    expect(frames[0].right_hand!.length).toBe(21);
  });
});
