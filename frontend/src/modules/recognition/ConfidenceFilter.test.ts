import { describe, it, expect } from 'vitest';
import { ConfidenceFilter } from './ConfidenceFilter';

describe('ConfidenceFilter', () => {
  describe('constructor', () => {
    it('should use default threshold 0.6 when not specified', () => {
      const filter = new ConfidenceFilter();
      expect(filter.getThreshold()).toBe(0.6);
    });

    it('should accept custom threshold', () => {
      const filter = new ConfidenceFilter(0.8);
      expect(filter.getThreshold()).toBe(0.8);
    });

    it('should accept threshold 0', () => {
      const filter = new ConfidenceFilter(0);
      expect(filter.getThreshold()).toBe(0);
    });

    it('should accept threshold 1', () => {
      const filter = new ConfidenceFilter(1);
      expect(filter.getThreshold()).toBe(1);
    });
  });

  describe('filter', () => {
    const filter = new ConfidenceFilter(0.6);

    it('should accept result with confidence above threshold', () => {
      const result = {
        gloss_id: 'test_1',
        chinese: '测试',
        confidence: 0.9,
      };
      const filtered = filter.filter(result);
      expect(filtered.accepted).toBe(true);
      expect(filtered.message).toBeUndefined();
    });

    it('should accept result with confidence exactly at threshold', () => {
      const result = {
        gloss_id: 'test_2',
        chinese: '边界',
        confidence: 0.6,
      };
      const filtered = filter.filter(result);
      expect(filtered.accepted).toBe(true);
    });

    it('should reject result with confidence below threshold', () => {
      const result = {
        gloss_id: 'test_3',
        chinese: '低分',
        confidence: 0.4,
      };
      const filtered = filter.filter(result);
      expect(filtered.accepted).toBe(false);
      expect(filtered.message).toBe('请重新打手语');
    });

    it('should reject result with confidence 0', () => {
      const result = {
        gloss_id: 'zero',
        chinese: '零分',
        confidence: 0,
      };
      const filtered = filter.filter(result);
      expect(filtered.accepted).toBe(false);
    });

    it('should accept result with confidence 1', () => {
      const result = {
        gloss_id: 'full',
        chinese: '满分',
        confidence: 1,
      };
      const filtered = filter.filter(result);
      expect(filtered.accepted).toBe(true);
    });

    it('should use custom threshold correctly', () => {
      const strictFilter = new ConfidenceFilter(0.85);
      const lowResult = {
        gloss_id: 'low',
        chinese: '低置信度',
        confidence: 0.7,
      };
      const highResult = {
        gloss_id: 'high',
        chinese: '高置信度',
        confidence: 0.9,
      };
      expect(strictFilter.filter(lowResult).accepted).toBe(false);
      expect(strictFilter.filter(highResult).accepted).toBe(true);
    });
  });
});
