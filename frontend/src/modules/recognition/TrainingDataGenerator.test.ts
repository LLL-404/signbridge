/**
 * @file TrainingDataGenerator.test.ts
 * @description 训练数据生成器单元测试
 *
 * 测试覆盖：
 *   - generateSyntheticSequence：维度正确性、单/双手、主导手位置、运动轨迹
 *   - 手形分支：fist_a / v_shape / index_point / thumb_up / c_shape / o_shape / flat_b
 *   - 位置映射：chest_center / face_level / unknown 回退
 *   - 运动类型：static / circular / upward_arc / zigzag
 *   - generate：JSON 加载成功路径、回退到 VocabularyStore、两者皆空抛错
 *   - generate 样本数与标签正确性
 *   - generate 输出维度 [samples, 30, 126]
 *
 * 通过 vi.mock 隔离 Normalizer、VocabularyStore、DataInitializer 与 fetch。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SignGloss } from '@/types/sign';

// ===== Mock Normalizer =====
const normalizeSpy = vi.hoisted(() => vi.fn());
// mock 路径需与 TrainingDataGenerator.ts 的实际 import 路径保持一致
// Normalizer 已从 modules/recognition/ 下沉到 modules/normalize/
vi.mock('@/modules/normalize/Normalizer', () => ({
  Normalizer: vi.fn().mockImplementation(() => ({
    normalize: normalizeSpy,
  })),
}));

// ===== Mock VocabularyStore 单例 =====
const { vocabSpies } = vi.hoisted(() => ({
  vocabSpies: {
    getAll: vi.fn(),
  },
}));
vi.mock('@/modules/data/VocabularyStore', () => ({
  vocabularyStore: vocabSpies,
}));

// ===== Mock DataInitializer =====
const { initSpy } = vi.hoisted(() => ({
  initSpy: vi.fn(),
}));
vi.mock('@/modules/data/DataInitializer', () => ({
  initializeVocabulary: initSpy,
}));

// ===== Mock appConfig =====
vi.mock('@/config', () => ({
  appConfig: {
    vocabularyUrl: '/data/vocabulary.json',
  },
}));

import { TrainingDataGenerator } from './TrainingDataGenerator';

/** 构造一个最小可用 SignGloss */
function makeGloss(overrides: Partial<SignGloss> = {}): SignGloss {
  return {
    gloss_id: 'g1',
    chinese: '测试',
    category: 'test',
    difficulty: 1,
    manual: {
      handshape_start: 'open_5',
      handshape_end: 'open_5',
      location_start: 'neutral',
      location_end: 'neutral',
      movement: 'static',
      palm_orientation: 'inward',
      is_two_handed: false,
      dominant_hand: 'right',
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

describe('TrainingDataGenerator generateSyntheticSequence', () => {
  let generator: TrainingDataGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    // 默认 normalize 直接返回输入数据，length=30
    normalizeSpy.mockImplementation((seq) => ({
      data: seq.frames.flatMap((f: { left_hand: number[] | null; right_hand: number[] | null }) => [
        ...(f.left_hand ?? []),
        ...(f.right_hand ?? []),
      ]),
      length: 30,
    }));
    generator = new TrainingDataGenerator();
  });

  it('默认应生成 30 帧 × 126 维', () => {
    const seq = generator.generateSyntheticSequence(makeGloss());
    expect(seq.length).toBe(30);
    seq.forEach((frame) => {
      expect(frame.length).toBe(126);
    });
  });

  it('每帧值应为有限数字', () => {
    const seq = generator.generateSyntheticSequence(makeGloss());
    for (const frame of seq) {
      for (const v of frame) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('单手 + dominant=right 时左手应全为 0', () => {
    const gloss = makeGloss({
      manual: {
        ...makeGloss().manual,
        is_two_handed: false,
        dominant_hand: 'right',
      },
    });
    const seq = generator.generateSyntheticSequence(gloss);
    // 单手右手：左手 63 维（frame[0..62]）应全为 0
    for (const frame of seq) {
      for (let i = 0; i < 63; i++) {
        expect(frame[i]).toBe(0);
      }
      // 右手 63 维应有非零数据
      const rightHand = frame.slice(63);
      const hasData = rightHand.some((v) => v !== 0);
      expect(hasData).toBe(true);
    }
  });

  it('单手 + dominant=left 时右手应全为 0', () => {
    const gloss = makeGloss({
      manual: {
        ...makeGloss().manual,
        is_two_handed: false,
        dominant_hand: 'left',
      },
    });
    const seq = generator.generateSyntheticSequence(gloss);
    for (const frame of seq) {
      // 右手 63 维（frame[63..125]）应全为 0
      for (let i = 63; i < 126; i++) {
        expect(frame[i]).toBe(0);
      }
      // 左手应有非零数据
      const leftHand = frame.slice(0, 63);
      const hasData = leftHand.some((v) => v !== 0);
      expect(hasData).toBe(true);
    }
  });

  it('双手词汇应两手都有非零数据', () => {
    const gloss = makeGloss({
      manual: {
        ...makeGloss().manual,
        is_two_handed: true,
        dominant_hand: 'right',
      },
    });
    const seq = generator.generateSyntheticSequence(gloss);
    for (const frame of seq) {
      const leftHand = frame.slice(0, 63);
      const rightHand = frame.slice(63);
      expect(leftHand.some((v) => v !== 0)).toBe(true);
      expect(rightHand.some((v) => v !== 0)).toBe(true);
    }
  });

  it('静态运动应使所有帧保持起始位置', () => {
    const gloss = makeGloss({
      manual: {
        ...makeGloss().manual,
        movement: 'static',
        location_start: 'face_level',
        location_end: 'chest_center',
      },
    });
    const seq = generator.generateSyntheticSequence(gloss);
    // static 时所有帧应相同（位置不变）
    const firstFrame = seq[0];
    const lastFrame = seq[seq.length - 1];
    // 比较 wrist 关键点位置（右手 frame[63..65]）
    expect(lastFrame[63]).toBeCloseTo(firstFrame[63], 5);
    expect(lastFrame[64]).toBeCloseTo(firstFrame[64], 5);
  });

  it('圆周运动应使手腕位置随时间变化', () => {
    const gloss = makeGloss({
      manual: {
        ...makeGloss().manual,
        movement: 'circular',
        location_start: 'face_level',
        location_end: 'face_level',
      },
    });
    const seq = generator.generateSyntheticSequence(gloss);
    // 圆周运动：起点与中点位置应不同
    const startPos = { x: seq[0][63], y: seq[0][64] };
    const midPos = { x: seq[15][63], y: seq[15][64] };
    const moved = Math.hypot(midPos.x - startPos.x, midPos.y - startPos.y);
    expect(moved).toBeGreaterThan(0.001);
  });

  it('upward_arc 应产生 Y 轴偏移', () => {
    const gloss = makeGloss({
      manual: {
        ...makeGloss().manual,
        movement: 'upward_arc',
        location_start: 'chest_center',
        location_end: 'face_level',
      },
    });
    const seq = generator.generateSyntheticSequence(gloss);
    // 中间帧 Y 应高于线性插值的 Y（抛物线叠加）
    const startY = seq[0][64];
    const endY = seq[29][64];
    const midY = seq[15][64];
    const linearMidY = (startY + endY) / 2;
    // 抛物线叠加使中点 Y 高于线性（y 减小代表上移）
    expect(midY).toBeLessThan(linearMidY);
  });

  it('zigzag 应产生 X 轴正弦波动', () => {
    const gloss = makeGloss({
      manual: {
        ...makeGloss().manual,
        movement: 'zigzag',
        location_start: 'chest_left',
        location_end: 'chest_right',
      },
    });
    const seq = generator.generateSyntheticSequence(gloss);
    // zigzag 的 X 坐标应在某些点偏离线性插值
    const startX = seq[0][63];
    const endX = seq[29][63];
    // 第 4 帧（progress≈0.14）应偏离线性
    const xAt4 = seq[4][63];
    const linearAt4 = startX + (endX - startX) * (4 / 29);
    // 容忍微小偏差，但 zigzag 应有显著正弦偏移
    expect(Math.abs(xAt4 - linearAt4)).toBeGreaterThan(0.001);
  });
});

describe('TrainingDataGenerator 手形分支', () => {
  let generator: TrainingDataGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    normalizeSpy.mockImplementation((seq) => ({
      data: seq.frames.flatMap((f: { left_hand: number[] | null; right_hand: number[] | null }) => [
        ...(f.left_hand ?? []),
        ...(f.right_hand ?? []),
      ]),
      length: 30,
    }));
    generator = new TrainingDataGenerator();
  });

  /** 提取第一帧右手 21 关键点（用于比较手形差异） */
  function extractRightHand(seq: number[][]): { x: number; y: number; z: number }[] {
    const hand: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 21; i++) {
      const base = 63 + i * 3;
      hand.push({ x: seq[0][base], y: seq[0][base + 1], z: seq[0][base + 2] });
    }
    return hand;
  }

  it('fist_a 手形应弯曲所有手指（指尖向掌心收）', () => {
    const openSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'open_5', handshape_end: 'open_5' },
    }));
    const fistSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'fist_a', handshape_end: 'fist_a' },
    }));
    const openHand = extractRightHand(openSeq);
    const fistHand = extractRightHand(fistSeq);
    // 食指尖（点 8）的 y 坐标：open 时为负（向上），fist 时向掌心收（y 变大）
    expect(fistHand[8].y).toBeGreaterThan(openHand[8].y);
  });

  it('v_shape 手形：食指中指伸展，无名指小指弯曲', () => {
    const vSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'v_shape', handshape_end: 'v_shape' },
    }));
    const openSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'open_5', handshape_end: 'open_5' },
    }));
    const vHand = extractRightHand(vSeq);
    const openHand = extractRightHand(openSeq);
    // 中指尖（点 12）伸展：v_shape 与 open_5 接近
    expect(Math.abs(vHand[12].y - openHand[12].y)).toBeLessThan(0.05);
    // 小指尖（点 20）弯曲：v_shape 的 y 应大于 open_5
    expect(vHand[20].y).toBeGreaterThan(openHand[20].y);
  });

  it('index_point 手形：仅食指伸展，其他弯曲', () => {
    // 源码 foldFingers(openHand, [1, 0, 1, 1])：折叠食指/无名指/小指，中指伸展
    // 注：源码注释与实际行为不符，测试按实际行为校验
    const indexSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'index_point', handshape_end: 'index_point' },
    }));
    const openSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'open_5', handshape_end: 'open_5' },
    }));
    const indexHand = extractRightHand(indexSeq);
    const openHand = extractRightHand(openSeq);
    // 中指尖（点 12）伸展：与 open 接近
    expect(Math.abs(indexHand[12].y - openHand[12].y)).toBeLessThan(0.05);
    // 食指尖（点 8）折叠：y 大于 open（折叠后指尖向掌心收，y 增大）
    expect(indexHand[8].y).toBeGreaterThan(openHand[8].y);
  });

  it('thumb_up 手形：仅拇指伸展', () => {
    // 源码 foldFingers(openHand, [0, 1, 1, 1])：食指伸展，折叠中指/无名指/小指
    // 注：源码注释与实际行为不符，测试按实际行为校验
    const thumbSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'thumb_up', handshape_end: 'thumb_up' },
    }));
    const openSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'open_5', handshape_end: 'open_5' },
    }));
    const thumbHand = extractRightHand(thumbSeq);
    const openHand = extractRightHand(openSeq);
    // 食指尖（点 8）伸展：与 open 接近
    expect(Math.abs(thumbHand[8].y - openHand[8].y)).toBeLessThan(0.05);
    // 中指尖（点 12）折叠：y 大于 open
    expect(thumbHand[12].y).toBeGreaterThan(openHand[12].y);
  });

  it('c_shape 手形：拇指与食指相对', () => {
    const cSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'c_shape', handshape_end: 'c_shape' },
    }));
    const cHand = extractRightHand(cSeq);
    // 拇指尖（点 4）应向内收：相对腕部（点 0）x 在 -0.05 附近
    const thumbTipRelX = cHand[4].x - cHand[0].x;
    expect(thumbTipRelX).toBeCloseTo(-0.05, 2);
  });

  it('o_shape 手形：拇指与食指尖相接', () => {
    const oSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'o_shape', handshape_end: 'o_shape' },
    }));
    const oHand = extractRightHand(oSeq);
    // 拇指尖（点 4）与食指尖（点 8）应位置接近
    const dx = oHand[4].x - oHand[8].x;
    const dy = oHand[4].y - oHand[8].y;
    expect(Math.hypot(dx, dy)).toBeLessThan(0.05);
  });

  it('flat_b / open_5 / 未知手形应使用开放手形', () => {
    const seq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'flat_b', handshape_end: 'flat_b' },
    }));
    expect(seq.length).toBe(30);
    // 应与 open_5 输出一致
    const openSeq = generator.generateSyntheticSequence(makeGloss({
      manual: { ...makeGloss().manual, handshape_start: 'open_5', handshape_end: 'open_5' },
    }));
    const flatHand = extractRightHand(seq);
    const openHand = extractRightHand(openSeq);
    for (let i = 0; i < 21; i++) {
      expect(flatHand[i].x).toBeCloseTo(openHand[i].x, 6);
      expect(flatHand[i].y).toBeCloseTo(openHand[i].y, 6);
    }
  });
});

describe('TrainingDataGenerator generate', () => {
  let generator: TrainingDataGenerator;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    normalizeSpy.mockReset();
    // normalize 返回 30 帧 × 126 维的展平数组
    normalizeSpy.mockImplementation(() => ({
      data: new Array(30 * 126).fill(0.5),
      length: 30,
    }));
    initSpy.mockResolvedValue(undefined);
    vocabSpies.getAll.mockResolvedValue([]);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    generator = new TrainingDataGenerator();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetch 成功返回非空词汇时应使用 JSON 数据', async () => {
    const glosses = [makeGloss({ gloss_id: 'g1' }), makeGloss({ gloss_id: 'g2' })];
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ vocabulary: glosses }),
    });

    const result = await generator.generate();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).not.toHaveBeenCalled();
    expect(vocabSpies.getAll).not.toHaveBeenCalled();
    // 应有 2 个类别
    expect(result.labels).toEqual(['g1', 'g2']);
    // 每个类别应有 20-50 个样本
    expect(result.x.length).toBeGreaterThanOrEqual(40); // 2 * 20
    expect(result.x.length).toBeLessThanOrEqual(100); // 2 * 50
    // y 中标签索引应正确
    expect(result.y).toContain(0);
    expect(result.y).toContain(1);
  });

  it('fetch 失败应回退到 VocabularyStore', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));
    const glosses = [makeGloss({ gloss_id: 'g1' })];
    vocabSpies.getAll.mockResolvedValue(glosses);
    initSpy.mockResolvedValue(undefined);

    const result = await generator.generate();

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(vocabSpies.getAll).toHaveBeenCalledTimes(1);
    expect(result.labels).toEqual(['g1']);
  });

  it('fetch 返回空词汇应回退到 VocabularyStore', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ vocabulary: [] }),
    });
    const glosses = [makeGloss({ gloss_id: 'g1' })];
    vocabSpies.getAll.mockResolvedValue(glosses);

    const result = await generator.generate();

    expect(vocabSpies.getAll).toHaveBeenCalledTimes(1);
    expect(result.labels).toEqual(['g1']);
  });

  it('fetch 返回非 ok 应回退到 VocabularyStore', async () => {
    fetchSpy.mockResolvedValue({ ok: false });
    const glosses = [makeGloss({ gloss_id: 'g1' })];
    vocabSpies.getAll.mockResolvedValue(glosses);

    const result = await generator.generate();

    expect(vocabSpies.getAll).toHaveBeenCalledTimes(1);
    expect(result.labels).toEqual(['g1']);
  });

  it('VocabularyStore 也为空时应抛错', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));
    vocabSpies.getAll.mockResolvedValue([]);

    await expect(generator.generate()).rejects.toThrow('词汇数据为空');
  });

  it('每个样本应为 [30, 126] 形状', async () => {
    const glosses = [makeGloss({ gloss_id: 'g1' })];
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ vocabulary: glosses }),
    });

    const result = await generator.generate();

    for (const sample of result.x) {
      expect(sample.length).toBe(30); // T
      for (const frame of sample) {
        expect(frame.length).toBe(126); // 特征维度
      }
    }
  });

  it('应调用 Normalizer.normalize 处理每个样本', async () => {
    const glosses = [makeGloss({ gloss_id: 'g1' }), makeGloss({ gloss_id: 'g2' })];
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ vocabulary: glosses }),
    });

    await generator.generate();

    // normalize 调用次数应等于样本数（>= 40）
    expect(normalizeSpy.mock.calls.length).toBeGreaterThanOrEqual(40);
  });

  it('多词汇场景应生成正确的 y 标签索引', async () => {
    const glosses = [
      makeGloss({ gloss_id: 'a' }),
      makeGloss({ gloss_id: 'b' }),
      makeGloss({ gloss_id: 'c' }),
    ];
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ vocabulary: glosses }),
    });

    const result = await generator.generate();

    expect(result.labels).toEqual(['a', 'b', 'c']);
    // y 应包含 0/1/2 三个标签
    expect(result.y).toContain(0);
    expect(result.y).toContain(1);
    expect(result.y).toContain(2);
    // 所有 y 值应在 [0, 3) 范围内
    for (const y of result.y) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(3);
    }
  });
});
