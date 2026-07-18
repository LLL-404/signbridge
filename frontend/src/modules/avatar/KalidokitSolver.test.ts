/**
 * @file KalidokitSolver.test.ts
 * @description Kalidokit IK 解算器单元测试
 *
 * 测试覆盖：
 *   - solve() 正常调用：body / hand 完整时填充结果
 *   - body 关键点不足 33 时跳过 body 解算
 *   - hand 关键点不足 21 时跳过手部解算
 *   - mirrorHands 切换 handedness
 *   - PascalCase → camelCase 转换
 *   - 全部解算失败时回退到 lastValid
 *   - 异常捕获与回退
 *   - reset() 重置状态
 *   - smoother 参数传递
 *
 * 通过 vi.mock 隔离 kalidokit 与 logger 依赖。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Keypoint, HandLandmarks } from '../recognition/PoseEstimator';

// ===== Mock kalidokit 模块 =====
// 使用 vi.hoisted 让 mock 工厂能引用可控的 spy 函数
const { poseSolveSpy, handSolveSpy } = vi.hoisted(() => ({
  poseSolveSpy: vi.fn(),
  handSolveSpy: vi.fn(),
}));

vi.mock('kalidokit', () => ({
  Pose: {
    solve: poseSolveSpy,
  },
  Hand: {
    solve: handSolveSpy,
  },
}));

// Mock logger，避免 import.meta.env 依赖
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

import { KalidokitSolver } from './KalidokitSolver';
import type { PoseEstimate } from '../recognition/PoseEstimator';

/** 构造 33 个 body 关键点 */
function makeBodyKeypoints(count = 33): Keypoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: i * 0.01,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
}

/** 构造 21 个手部关键点 */
function makeHandLandmarks(handedness: 'Left' | 'Right' = 'Right'): HandLandmarks {
  return {
    landmarks: Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: 0.5, z: 0 })),
    handedness,
    confidence: 0.95,
    lowConfidence: false,
  };
}

/** 构造最小化 PoseEstimate */
function makeEstimate(opts?: {
  bodyCount?: number;
  leftHand?: HandLandmarks | null;
  rightHand?: HandLandmarks | null;
}): PoseEstimate {
  return {
    body: makeBodyKeypoints(opts?.bodyCount ?? 33),
    leftHand: opts?.leftHand ?? null,
    rightHand: opts?.rightHand ?? null,
    face: null,
    timestamp: 1000,
  };
}

describe('KalidokitSolver', () => {
  beforeEach(() => {
    poseSolveSpy.mockReset();
    handSolveSpy.mockReset();
  });

  it('body 关键点不足 33 时应跳过 body 解算（结果为空时回退到 lastValid）', () => {
    const solver = new KalidokitSolver();
    const estimate = makeEstimate({ bodyCount: 20 });
    const result = solver.solve(estimate);
    // pose.solve 不应被调用
    expect(poseSolveSpy).not.toHaveBeenCalled();
    // 首次解算且全空 → 返回 lastValid（也是空 Map）
    expect(result.size).toBe(0);
  });

  it('body 完整时应调用 Pose.solve 并填充 hips/spine/双臂', () => {
    poseSolveSpy.mockReturnValue({
      Hips: { rotation: { x: 0.1, y: 0.2, z: 0.3 } },
      Spine: { x: 0.05, y: 0.0, z: 0.05 },
      LeftUpperArm: { x: 0.1, y: 0.2, z: 0.3 },
      RightUpperArm: { x: 0.1, y: 0.2, z: 0.3 },
      LeftLowerArm: { x: 0.4, y: 0.5, z: 0.6 },
      RightLowerArm: { x: 0.4, y: 0.5, z: 0.6 },
    });
    const solver = new KalidokitSolver();
    const result = solver.solve(makeEstimate());
    expect(poseSolveSpy).toHaveBeenCalledTimes(1);
    // 应填充 hips / spine / 4 个臂部骨骼
    expect(result.has('hips')).toBe(true);
    expect(result.has('spine')).toBe(true);
    expect(result.has('leftUpperArm')).toBe(true);
    expect(result.has('rightUpperArm')).toBe(true);
    expect(result.has('leftLowerArm')).toBe(true);
    expect(result.has('rightLowerArm')).toBe(true);
  });

  it('Hips.rotation 缺失时应跳过 hips（不抛错）', () => {
    poseSolveSpy.mockReturnValue({
      Spine: { x: 0.05, y: 0.0, z: 0.05 },
    });
    const solver = new KalidokitSolver();
    const result = solver.solve(makeEstimate());
    expect(result.has('hips')).toBe(false);
    expect(result.has('spine')).toBe(true);
  });

  it('Pose.solve 返回 null 时应跳过 body 解算', () => {
    poseSolveSpy.mockReturnValue(null);
    const solver = new KalidokitSolver();
    const result = solver.solve(makeEstimate());
    expect(poseSolveSpy).toHaveBeenCalled();
    // body 部分未填充，整个 result 为空 → 返回 lastValid
    expect(result.size).toBe(0);
  });

  it('hand 关键点不足 21 时应跳过手部解算', () => {
    handSolveSpy.mockReturnValue({});
    const solver = new KalidokitSolver();
    const shortHand: HandLandmarks = {
      landmarks: Array.from({ length: 10 }, () => ({ x: 0, y: 0, z: 0 })),
      handedness: 'Right',
      confidence: 0.9,
      lowConfidence: false,
    };
    solver.solve(makeEstimate({ leftHand: shortHand }));
    expect(handSolveSpy).not.toHaveBeenCalled();
  });

  it('hand 完整时应调用 Hand.solve 并填充 PascalCase → camelCase 骨骼名', () => {
    handSolveSpy.mockReturnValue({
      RightThumbProximal: { x: 0.1, y: 0.2, z: 0.3 },
      RightIndexProximal: { x: 0.4, y: 0.5, z: 0.6 },
    });
    const solver = new KalidokitSolver();
    const result = solver.solve(
      makeEstimate({ rightHand: makeHandLandmarks('Right') }),
    );
    expect(handSolveSpy).toHaveBeenCalledTimes(1);
    expect(result.has('rightThumbProximal')).toBe(true);
    expect(result.has('rightIndexProximal')).toBe(true);
  });

  it('mirrorHands=true（默认）应交换 handedness：Left → Right', () => {
    handSolveSpy.mockReturnValue({});
    const solver = new KalidokitSolver(); // 默认 mirrorHands=true
    solver.solve(makeEstimate({ leftHand: makeHandLandmarks('Left') }));
    expect(handSolveSpy).toHaveBeenCalledWith(expect.anything(), 'Right');
  });

  it('mirrorHands=true 应交换 handedness：Right → Left', () => {
    handSolveSpy.mockReturnValue({});
    const solver = new KalidokitSolver();
    solver.solve(makeEstimate({ rightHand: makeHandLandmarks('Right') }));
    expect(handSolveSpy).toHaveBeenCalledWith(expect.anything(), 'Left');
  });

  it('mirrorHands=false 应保持原 handedness', () => {
    handSolveSpy.mockReturnValue({});
    const solver = new KalidokitSolver({ mirrorHands: false });
    solver.solve(makeEstimate({ leftHand: makeHandLandmarks('Left') }));
    expect(handSolveSpy).toHaveBeenCalledWith(expect.anything(), 'Left');
  });

  it('Hand.solve 返回 null 时应跳过手部写入', () => {
    handSolveSpy.mockReturnValue(null);
    const solver = new KalidokitSolver();
    const result = solver.solve(
      makeEstimate({ rightHand: makeHandLandmarks('Right') }),
    );
    expect(handSolveSpy).toHaveBeenCalled();
    // 手部未写入，body 也未写入 → 整体为空
    expect(result.size).toBe(0);
  });

  it('全部解算失败时应返回 lastValid（保留上次有效结果）', () => {
    // 首次成功解算建立 lastValid
    poseSolveSpy.mockReturnValueOnce({
      Hips: { rotation: { x: 0.1, y: 0.2, z: 0.3 } },
    });
    const solver = new KalidokitSolver();
    const first = solver.solve(makeEstimate());
    expect(first.size).toBe(1);
    // 第二次 body 关键点不足，且无 hand → 结果为空，应回退 lastValid
    const second = solver.solve(makeEstimate({ bodyCount: 10 }));
    expect(second.size).toBe(1);
    expect(second.has('hips')).toBe(true);
  });

  it('Kalidokit 抛异常时应被 catch 且返回 lastValid', () => {
    poseSolveSpy.mockImplementation(() => {
      throw new Error('kalidokit 内部错误');
    });
    const solver = new KalidokitSolver();
    expect(() => solver.solve(makeEstimate())).not.toThrow();
    // 异常时返回 lastValid（首次为空 Map）
    const result = solver.solve(makeEstimate());
    expect(result.size).toBe(0);
  });

  it('reset() 应清空 lastValid 与 smoother 状态', () => {
    poseSolveSpy.mockReturnValue({
      Hips: { rotation: { x: 0.1, y: 0.2, z: 0.3 } },
    });
    const solver = new KalidokitSolver();
    solver.solve(makeEstimate());
    // 重置后下一次解算首帧应直接返回输入（ smoother 已重置）
    solver.reset();
    poseSolveSpy.mockReturnValueOnce({
      Hips: { rotation: { x: 0.5, y: 0.6, z: 0.7 } },
    });
    const result = solver.solve(makeEstimate());
    // 重置后第一帧应直接返回输入（首帧不被平滑）
    const hips = result.get('hips');
    expect(hips).toBeDefined();
    expect(hips!.x).toBeCloseTo(0.5, 5);
  });

  it('smoother 自定义参数应被传递（影响平滑强度）', () => {
    poseSolveSpy.mockReturnValue({
      Hips: { rotation: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    // 较高 minCutoff → 更平滑（输出更接近前值）
    const solver = new KalidokitSolver({ smootherMinCutoff: 0.001 });
    // 第一帧
    solver.solve(makeEstimate({ bodyCount: 33 }));
    // 第二帧：smoother 状态应被保留，输出有平滑
    poseSolveSpy.mockReturnValueOnce({
      Hips: { rotation: { x: 1.0, y: 1.0, z: 1.0 } },
    });
    const result = solver.solve(makeEstimate());
    const hips = result.get('hips');
    expect(hips).toBeDefined();
    // 极低 minCutoff 下，第二帧应被强平滑，远未到达 1.0
    expect(hips!.x).toBeLessThan(1.0);
  });

  it('smoother 应对每个骨骼维护独立状态', () => {
    poseSolveSpy.mockReturnValue({
      Hips: { rotation: { x: 0.1, y: 0.1, z: 0.1 } },
      Spine: { x: 0.5, y: 0.5, z: 0.5 },
    });
    const solver = new KalidokitSolver();
    const result = solver.solve(makeEstimate());
    // 两个骨骼都应被写入（彼此独立）
    expect(result.has('hips')).toBe(true);
    expect(result.has('spine')).toBe(true);
    // 首帧直接返回输入
    expect(result.get('hips')!.x).toBeCloseTo(0.1, 5);
    expect(result.get('spine')!.x).toBeCloseTo(0.5, 5);
  });

  it('空 PoseEstimate（无 body/hand）应返回空 Map 不报错', () => {
    const solver = new KalidokitSolver();
    const empty: PoseEstimate = {
      body: [],
      leftHand: null,
      rightHand: null,
      face: null,
      timestamp: 0,
    };
    const result = solver.solve(empty);
    expect(poseSolveSpy).not.toHaveBeenCalled();
    expect(handSolveSpy).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
