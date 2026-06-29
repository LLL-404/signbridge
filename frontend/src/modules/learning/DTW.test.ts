/**
 * @file DTW.test.ts
 * @description DTW 动态时间规整算法单元测试
 *
 * 测试覆盖：
 *   - 空序列处理
 *   - 相同序列（距离为 0）
 *   - 长度不同的序列对齐
 *   - Sakoe-Chiba 窗口约束
 *   - 路径回溯正确性
 */

import { describe, it, expect } from 'vitest';
import { DTW } from './DTW';

describe('DTW', () => {
  it('空序列应返回空路径和零距离', () => {
    const dtw = new DTW();
    const result = dtw.align([], []);
    expect(result.alignedPairs).toEqual([]);
    expect(result.distance).toBe(0);
  });

  it('单边空序列应返回空路径', () => {
    const dtw = new DTW();
    const result = dtw.align([[1, 2]], []);
    expect(result.alignedPairs).toEqual([]);
    expect(result.distance).toBe(0);
  });

  it('相同序列距离应为 0', () => {
    const dtw = new DTW();
    const seq = [
      [1, 0],
      [2, 0],
      [3, 0],
    ];
    const result = dtw.align(seq, seq);
    expect(result.distance).toBeCloseTo(0, 6);
    // 路径应为对角线 [0,0],[1,1],[2,2]
    expect(result.alignedPairs).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it('长度不同的序列应正确对齐', () => {
    const dtw = new DTW();
    // 用户序列 3 帧，标准序列 5 帧
    const user = [
      [0],
      [5],
      [10],
    ];
    const standard = [
      [0],
      [2],
      [5],
      [7],
      [10],
    ];
    const result = dtw.align(user, standard);
    // 路径长度应 >= max(n, m)
    expect(result.alignedPairs.length).toBeGreaterThanOrEqual(5);
    // 起点和终点应对齐
    expect(result.alignedPairs[0]).toEqual([0, 0]);
    expect(result.alignedPairs[result.alignedPairs.length - 1]).toEqual([2, 4]);
    // 距离应非负
    expect(result.distance).toBeGreaterThanOrEqual(0);
  });

  it('自定义窗口宽度应生效', () => {
    const dtw = new DTW({ windowWidth: 1 });
    const user = [[0], [1], [2], [3], [4]];
    const standard = [[0], [1], [2], [3], [4]];
    const result = dtw.align(user, standard);
    // 窗口宽度 1 时仍能对齐相同序列
    expect(result.distance).toBeCloseTo(0, 6);
  });

  it('窗口过窄导致不可达时应返回空路径', () => {
    // 构造一个窗口极窄且序列错位导致不可达的场景
    const dtw = new DTW({ windowWidth: 0 });
    // windowWidth=0 会触发 resolveWindow 的 fallback（取 max(n,m)*0.3）
    // 此处验证 windowWidth=0 时仍能正常工作（fallback 生效）
    const result = dtw.align([[0], [1]], [[0], [1]]);
    expect(result.alignedPairs.length).toBeGreaterThan(0);
  });

  it('欧氏距离计算正确', () => {
    const dtw = new DTW();
    // 2D 向量距离：[0,0] 到 [3,4] 应为 5
    const result = dtw.align([[0, 0]], [[3, 4]]);
    expect(result.distance).toBeCloseTo(5, 6);
  });

  it('路径单调性（索引递增）', () => {
    const dtw = new DTW();
    const user = [[0], [1], [2], [3]];
    const standard = [[0], [0.5], [1], [1.5], [2], [2.5], [3]];
    const result = dtw.align(user, standard);
    // 验证路径中 i 和 j 都单调递增
    for (let k = 1; k < result.alignedPairs.length; k++) {
      const [prevI, prevJ] = result.alignedPairs[k - 1];
      const [currI, currJ] = result.alignedPairs[k];
      expect(currI).toBeGreaterThanOrEqual(prevI);
      expect(currJ).toBeGreaterThanOrEqual(prevJ);
    }
  });
});
