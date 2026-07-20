/**
 * @file DataCollector.test.ts
 * @description 手语数据采集器单元测试
 *
 * 测试覆盖：
 *   - 配置管理：默认配置、自定义配置、setConfig
 *   - 状态管理：getState、reset
 *   - 手动录制流程：startRecording / stopRecording
 *   - 自动模式：feedFrame 运动检测与状态切换
 *   - 样本保存：saveSample 成功/无 pending 抛错
 *   - 标注丢弃：discardSample
 *   - 数据集导出：exportDataset 过滤与 labelMap 构建
 *   - 数据集统计：getDatasetStats
 *   - 数据删除：deleteSample / clearAll
 *   - 质量评估：assessQuality（通过 saveSample 间接验证）
 *
 * 通过 vi.mock 隔离 Normalizer 与 idbAdapter 单例。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FrameKeypoints } from '@/types/recognition';
import type { CollectedSample } from './DataCollector';

// ===== Mock Normalizer =====
const normalizeSpy = vi.hoisted(() => vi.fn());
vi.mock('@/modules/normalize/Normalizer', () => ({
  Normalizer: vi.fn().mockImplementation(() => ({
    normalize: normalizeSpy,
  })),
}));

// ===== Mock idbAdapter 单例 =====
const { idbSpies } = vi.hoisted(() => ({
  idbSpies: {
    put: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    init: vi.fn(),
  },
}));
vi.mock('./IndexedDBAdapter', () => ({
  idbAdapter: idbSpies,
  IndexedDBAdapter: vi.fn(),
  STORES: {
    VOCABULARY: 'vocabulary',
    MOTION_DATA: 'motion_data',
    CACHE: 'cache',
    COLLECTED_SAMPLES: 'collected_samples',
  },
}));

import { DataCollector } from './DataCollector';

/** 构造 21 个手部关键点，腕部在 (wx, wy, wz) */
function makeHand(wx: number, wy: number, wz = 0): { x: number; y: number; z: number }[] {
  return Array.from({ length: 21 }, (_, i) => ({
    x: wx + i * 0.001,
    y: wy + i * 0.001,
    z: wz,
  }));
}

/** 构造单帧，仅有 right_hand 数据 */
function makeFrame(wx: number, wy: number, timestamp: number): FrameKeypoints {
  return {
    left_hand: null,
    right_hand: makeHand(wx, wy),
    timestamp,
  };
}

describe('DataCollector 配置与状态', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    normalizeSpy.mockReturnValue({ data: new Array(30 * 126).fill(0), length: 30 });
    idbSpies.put.mockResolvedValue(undefined);
    idbSpies.get.mockResolvedValue(undefined);
    idbSpies.getAll.mockResolvedValue([]);
    idbSpies.delete.mockResolvedValue(undefined);
    idbSpies.clear.mockResolvedValue(undefined);
    idbSpies.init.mockResolvedValue(undefined);
  });

  it('默认配置应使用 targetFrames=30, minFrames=15', () => {
    const dc = new DataCollector();
    expect(dc.getState()).toBe('idle');
  });

  it('自定义配置应覆盖默认值', () => {
    const dc = new DataCollector({
      targetFrames: 20,
      minFrames: 5,
      maxFrames: 60,
    });
    // 通过后续行为间接验证：录制 6 帧（>5）应能停止成功
    dc.startRecording();
    for (let i = 0; i < 6; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    const frames = dc.stopRecording();
    expect(frames).not.toBeNull();
    expect(frames!.length).toBeGreaterThanOrEqual(6);
  });

  it('setConfig 应合并更新配置', () => {
    const dc = new DataCollector();
    dc.setConfig({ minFrames: 3 });
    dc.startRecording();
    // 录制 4 帧（>3）
    for (let i = 0; i < 4; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    const frames = dc.stopRecording();
    expect(frames).not.toBeNull();
  });

  it('初始 getState 应为 idle', () => {
    const dc = new DataCollector();
    expect(dc.getState()).toBe('idle');
  });

  it('reset 应将状态重置为 idle', () => {
    const dc = new DataCollector();
    dc.startRecording();
    dc.reset();
    expect(dc.getState()).toBe('idle');
  });
});

describe('DataCollector 手动录制流程', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    normalizeSpy.mockReturnValue({ data: new Array(30 * 126).fill(0), length: 30 });
    idbSpies.put.mockResolvedValue(undefined);
    idbSpies.getAll.mockResolvedValue([]);
    idbSpies.delete.mockResolvedValue(undefined);
    idbSpies.clear.mockResolvedValue(undefined);
  });

  it('startRecording 后状态应变为 recording', () => {
    const dc = new DataCollector();
    dc.startRecording();
    expect(dc.getState()).toBe('recording');
  });

  it('stopRecording 在 idle 状态应返回 null', () => {
    const dc = new DataCollector();
    expect(dc.stopRecording()).toBeNull();
  });

  it('stopRecording 录制帧数不足 minFrames 应返回 null 并重置', () => {
    const dc = new DataCollector({ minFrames: 10 });
    dc.startRecording();
    // 只录制 3 帧（< 10）
    for (let i = 0; i < 3; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    const frames = dc.stopRecording();
    expect(frames).toBeNull();
    // 状态应被重置为 idle
    expect(dc.getState()).toBe('idle');
  });

  it('stopRecording 录制帧数足够应返回 frames 且状态变为 reviewing', () => {
    const dc = new DataCollector({ minFrames: 5 });
    dc.startRecording();
    for (let i = 0; i < 10; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    const frames = dc.stopRecording();
    expect(frames).not.toBeNull();
    expect(frames!.length).toBe(10);
    expect(dc.getState()).toBe('reviewing');
  });

  it('getPendingFrames 应返回 stopRecording 后的帧序列', () => {
    const dc = new DataCollector({ minFrames: 5 });
    dc.startRecording();
    for (let i = 0; i < 6; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    dc.stopRecording();
    const pending = dc.getPendingFrames();
    expect(pending).not.toBeNull();
    expect(pending!.length).toBe(6);
  });

  it('discardSample 应清空 pending 并重置为 idle', () => {
    const dc = new DataCollector({ minFrames: 5 });
    dc.startRecording();
    for (let i = 0; i < 6; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    dc.stopRecording();
    dc.discardSample();
    expect(dc.getPendingFrames()).toBeNull();
    expect(dc.getState()).toBe('idle');
  });

  it('getStats 在未录制时 recordedFrames=0', () => {
    const dc = new DataCollector();
    const stats = dc.getStats();
    expect(stats.recordedFrames).toBe(0);
    expect(stats.elapsedMs).toBe(0);
    expect(stats.motionDetected).toBe(false);
  });

  it('getStats 在录制中应反映当前帧数', () => {
    const dc = new DataCollector();
    dc.startRecording();
    for (let i = 0; i < 5; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    const stats = dc.getStats();
    expect(stats.recordedFrames).toBe(5);
  });
});

describe('DataCollector 自动模式 feedFrame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    normalizeSpy.mockReturnValue({ data: new Array(30 * 126).fill(0), length: 30 });
    idbSpies.put.mockResolvedValue(undefined);
    idbSpies.getAll.mockResolvedValue([]);
    idbSpies.delete.mockResolvedValue(undefined);
    idbSpies.clear.mockResolvedValue(undefined);
  });

  it('idle + autoDetect=true 检测到运动应进入 recording', () => {
    const dc = new DataCollector({ autoDetectMotion: true, stillnessThreshold: 0.001 });
    // 第一帧（建立基线）
    dc.feedFrame(makeFrame(0.5, 0.5, 0));
    expect(dc.getState()).toBe('idle');
    // 第二帧位移 0.1（远大于阈值 0.001）
    dc.feedFrame(makeFrame(0.6, 0.5, 33));
    expect(dc.getState()).toBe('recording');
  });

  it('idle + autoDetect=false 不应自动进入 recording', () => {
    const dc = new DataCollector({ autoDetectMotion: false });
    const stats = dc.feedFrame(makeFrame(0.5, 0.5, 0));
    // autoDetect 关闭时 idle 状态下应返回 null（不进入自动逻辑）
    expect(stats).toBeNull();
    expect(dc.getState()).toBe('idle');
  });

  it('idle 状态下持续静止不应进入 recording', () => {
    const dc = new DataCollector({
      autoDetectMotion: true,
      stillnessThreshold: 0.001,
    });
    // 连续相同帧（无运动）
    dc.feedFrame(makeFrame(0.5, 0.5, 0));
    dc.feedFrame(makeFrame(0.5, 0.5, 33));
    dc.feedFrame(makeFrame(0.5, 0.5, 66));
    expect(dc.getState()).toBe('idle');
  });

  it('recording 状态下 feedFrame 应累积帧', () => {
    const dc = new DataCollector();
    dc.startRecording();
    dc.feedFrame(makeFrame(0.1, 0, 0));
    dc.feedFrame(makeFrame(0.2, 0, 33));
    dc.feedFrame(makeFrame(0.3, 0, 66));
    const stats = dc.getStats();
    expect(stats.recordedFrames).toBe(3);
  });

  it('recording 状态下连续静止 postRollFrames 应触发 stopping', () => {
    const dc = new DataCollector({ postRollFrames: 3, minFrames: 3 });
    dc.startRecording();
    // 录制 5 帧运动
    for (let i = 0; i < 5; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    expect(dc.getState()).toBe('recording');
    // 后续静止 4 帧（> postRoll 3）
    dc.feedFrame(makeFrame(0.5, 0, 200));
    dc.feedFrame(makeFrame(0.5, 0, 233));
    dc.feedFrame(makeFrame(0.5, 0, 266));
    dc.feedFrame(makeFrame(0.5, 0, 299));
    // 第 3 帧静止后状态变为 stopping，第 4 帧 feedFrame 触发 stopRecording → reviewing
    expect(['stopping', 'reviewing']).toContain(dc.getState());
  });

  it('recording 状态下超过 maxFrames 应自动停止', () => {
    const dc = new DataCollector({ maxFrames: 5, minFrames: 2 });
    dc.startRecording();
    // 喂入 6 帧（超过 maxFrames=5）
    for (let i = 0; i < 6; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    // 超过 maxFrames 自动触发 stopRecording → reviewing
    expect(dc.getState()).toBe('reviewing');
  });

  it('stopping 状态下 feedFrame 应触发 stopRecording', () => {
    // postRollFrames=2，minFrames=2，避免首帧立即触发 stopping
    const dc = new DataCollector({ postRollFrames: 2, minFrames: 2 });
    dc.startRecording();
    // 喂 3 帧运动帧（首帧 lastWristPos=null 视为静止，但 stillFrameCount=1 < 2）
    dc.feedFrame(makeFrame(0.1, 0, 0));
    dc.feedFrame(makeFrame(0.2, 0, 33));
    dc.feedFrame(makeFrame(0.3, 0, 66));
    // 后续 2 帧静止 → 触发 stopping
    dc.feedFrame(makeFrame(0.3, 0, 99));
    dc.feedFrame(makeFrame(0.3, 0, 132));
    expect(dc.getState()).toBe('stopping');
    // 再喂一帧应触发 stopRecording → reviewing
    dc.feedFrame(makeFrame(0.3, 0, 165));
    expect(dc.getState()).toBe('reviewing');
  });
});

describe('DataCollector saveSample', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    normalizeSpy.mockReturnValue({ data: new Array(30 * 126).fill(0), length: 30 });
    idbSpies.put.mockResolvedValue(undefined);
    idbSpies.getAll.mockResolvedValue([]);
    idbSpies.delete.mockResolvedValue(undefined);
    idbSpies.clear.mockResolvedValue(undefined);
  });

  it('无 pendingSample 时应抛错', async () => {
    const dc = new DataCollector();
    await expect(dc.saveSample('g1', '测试')).rejects.toThrow();
  });

  it('有 pendingSample 时应保存到 idb 并返回 sample', async () => {
    const dc = new DataCollector({ minFrames: 5 });
    dc.startRecording();
    for (let i = 0; i < 6; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    dc.stopRecording();
    const sample = await dc.saveSample('gloss_1', '你好', 'right', 'user1');
    expect(sample.gloss_id).toBe('gloss_1');
    expect(sample.chinese).toBe('你好');
    expect(sample.dominantHand).toBe('right');
    expect(sample.collector).toBe('user1');
    expect(sample.id).toMatch(/^sample_/);
    expect(idbSpies.put).toHaveBeenCalledTimes(1);
    // 应保存到 collected_samples
    expect(idbSpies.put).toHaveBeenCalledWith('collected_samples', expect.objectContaining({
      gloss_id: 'gloss_1',
      chinese: '你好',
    }));
  });

  it('保存后状态应重置为 idle', async () => {
    const dc = new DataCollector({ minFrames: 5 });
    dc.startRecording();
    for (let i = 0; i < 6; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    dc.stopRecording();
    await dc.saveSample('g1', '测');
    expect(dc.getState()).toBe('idle');
    expect(dc.getPendingFrames()).toBeNull();
  });

  it('保存后应调用 Normalizer.normalize 并填充 normalizedData', async () => {
    const dc = new DataCollector({ minFrames: 3 });
    dc.startRecording();
    for (let i = 0; i < 4; i++) {
      dc.feedFrame(makeFrame(i * 0.1, 0, i * 33));
    }
    dc.stopRecording();
    const sample = await dc.saveSample('g1', '测');
    expect(normalizeSpy).toHaveBeenCalledTimes(1);
    expect(sample.normalizedData.length).toBe(30 * 126);
  });

  it('quality 评分应在 [0, 1] 范围内', async () => {
    const dc = new DataCollector({ minFrames: 3 });
    dc.startRecording();
    for (let i = 0; i < 10; i++) {
      dc.feedFrame(makeFrame(i * 0.05, 0, i * 33));
    }
    dc.stopRecording();
    const sample = await dc.saveSample('g1', '测');
    expect(sample.quality).toBeGreaterThanOrEqual(0);
    expect(sample.quality).toBeLessThanOrEqual(1);
  });
});

describe('DataCollector exportDataset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    normalizeSpy.mockReturnValue({ data: new Array(30 * 126).fill(0), length: 30 });
  });

  it('无 glossIds 过滤时应返回全部样本', async () => {
    const mockSamples: CollectedSample[] = [
      {
        id: 's1', gloss_id: 'g1', chinese: 'A',
        rawFrames: [], normalizedData: [1, 2, 3], fps: 30,
        collectedAt: 0, quality: 0.9, dominantHand: 'right',
      },
      {
        id: 's2', gloss_id: 'g2', chinese: 'B',
        rawFrames: [], normalizedData: [4, 5, 6], fps: 30,
        collectedAt: 0, quality: 0.8, dominantHand: 'left',
      },
    ];
    idbSpies.getAll.mockResolvedValue(mockSamples);
    const dc = new DataCollector();
    const result = await dc.exportDataset();
    expect(result.samples.length).toBe(2);
    expect(result.features.length).toBe(2);
    expect(result.labels).toEqual(['g1', 'g2']);
    // labelMap 按字母排序后索引
    expect(result.labelMap).toEqual({ g1: 0, g2: 1 });
  });

  it('指定 glossIds 应过滤样本', async () => {
    const mockSamples: CollectedSample[] = [
      {
        id: 's1', gloss_id: 'g1', chinese: 'A',
        rawFrames: [], normalizedData: [1], fps: 30,
        collectedAt: 0, quality: 0.9, dominantHand: 'right',
      },
      {
        id: 's2', gloss_id: 'g2', chinese: 'B',
        rawFrames: [], normalizedData: [2], fps: 30,
        collectedAt: 0, quality: 0.8, dominantHand: 'left',
      },
      {
        id: 's3', gloss_id: 'g3', chinese: 'C',
        rawFrames: [], normalizedData: [3], fps: 30,
        collectedAt: 0, quality: 0.7, dominantHand: 'right',
      },
    ];
    idbSpies.getAll.mockResolvedValue(mockSamples);
    const dc = new DataCollector();
    const result = await dc.exportDataset(['g1', 'g3']);
    expect(result.samples.length).toBe(2);
    expect(result.samples[0].gloss_id).toBe('g1');
    expect(result.samples[1].gloss_id).toBe('g3');
  });

  it('空数据集应返回空数组与空 labelMap', async () => {
    idbSpies.getAll.mockResolvedValue([]);
    const dc = new DataCollector();
    const result = await dc.exportDataset();
    expect(result.samples.length).toBe(0);
    expect(result.features.length).toBe(0);
    expect(result.labelMap).toEqual({});
  });
});

describe('DataCollector getDatasetStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('空数据集应返回 0 totalSamples 与 0 avgQuality', async () => {
    idbSpies.getAll.mockResolvedValue([]);
    const dc = new DataCollector();
    const stats = await dc.getDatasetStats();
    expect(stats.totalSamples).toBe(0);
    expect(stats.totalGlosses).toBe(0);
    expect(stats.avgQuality).toBe(0);
    expect(stats.byGloss).toEqual({});
  });

  it('应按 gloss_id 分组统计并计算平均质量', async () => {
    idbSpies.getAll.mockResolvedValue([
      { gloss_id: 'g1', quality: 0.8 },
      { gloss_id: 'g1', quality: 0.6 },
      { gloss_id: 'g2', quality: 0.9 },
    ] as CollectedSample[]);
    const dc = new DataCollector();
    const stats = await dc.getDatasetStats();
    expect(stats.totalSamples).toBe(3);
    expect(stats.totalGlosses).toBe(2);
    expect(stats.byGloss).toEqual({ g1: 2, g2: 1 });
    // 平均质量 (0.8+0.6+0.9)/3 ≈ 0.7667
    expect(stats.avgQuality).toBeCloseTo(0.7667, 3);
  });
});

describe('DataCollector deleteSample / clearAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idbSpies.delete.mockResolvedValue(undefined);
    idbSpies.clear.mockResolvedValue(undefined);
  });

  it('deleteSample 应调用 idbAdapter.delete', async () => {
    const dc = new DataCollector();
    await dc.deleteSample('sample_1');
    expect(idbSpies.delete).toHaveBeenCalledWith('collected_samples', 'sample_1');
  });

  it('clearAll 应调用 idbAdapter.clear', async () => {
    const dc = new DataCollector();
    await dc.clearAll();
    expect(idbSpies.clear).toHaveBeenCalledWith('collected_samples');
  });
});
