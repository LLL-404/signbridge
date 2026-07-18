/**
 * @file ModelTrainer.test.ts
 * @description 模型训练器单元测试
 *
 * 测试覆盖：
 *   - getModel 返回 SignModel 实例
 *   - trainAndExport 完整流程：generate → build → train → save → saveLabelMap → dispose
 *   - 标签映射正确保存到 IndexedDB
 *   - 类别数与 labels.length 一致
 *   - 训练 epochs 固定为 50
 *   - generate 抛错时应向上传播
 *   - 训练失败时应向上传播
 *   - LABEL_MAP_KEY 版本化命名
 *
 * 通过 vi.mock 隔离 SignModel、TrainingDataGenerator、IndexedDBAdapter。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== Mock SignModel =====
const { mockModel, modelSpies } = vi.hoisted(() => ({
  mockModel: {
    build: vi.fn(),
    train: vi.fn(),
    save: vi.fn(),
    dispose: vi.fn(),
    isReady: vi.fn(),
    getNumClasses: vi.fn(),
  },
  modelSpies: {
    build: undefined as unknown as ReturnType<typeof vi.fn>,
    train: undefined as unknown as ReturnType<typeof vi.fn>,
    save: undefined as unknown as ReturnType<typeof vi.fn>,
    dispose: undefined as unknown as ReturnType<typeof vi.fn>,
  },
}));

vi.mock('./SignModel', () => ({
  SignModel: vi.fn(() => mockModel),
  MODEL_STORAGE_PATH: 'indexeddb://signbridge-sign-model-v2',
  MODEL_VERSION_NUM: 2,
  MODEL_TIMESTEPS: 30,
  MODEL_FEATURE_DIM: 126,
}));

// ===== Mock TrainingDataGenerator =====
const { mockGenerator, generatorSpies } = vi.hoisted(() => ({
  mockGenerator: {
    generate: vi.fn(),
    generateSyntheticSequence: vi.fn(),
  },
  generatorSpies: {
    generate: undefined as unknown as ReturnType<typeof vi.fn>,
  },
}));

vi.mock('./TrainingDataGenerator', () => ({
  TrainingDataGenerator: vi.fn(() => mockGenerator),
}));

// ===== Mock idbAdapter =====
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
vi.mock('@/modules/data/IndexedDBAdapter', () => ({
  idbAdapter: idbSpies,
  STORES: {
    VOCABULARY: 'vocabulary',
    MOTION_DATA: 'motion_data',
    CACHE: 'cache',
    COLLECTED_SAMPLES: 'collected_samples',
  },
}));

import { ModelTrainer, LABEL_MAP_KEY } from './ModelTrainer';

describe('ModelTrainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 将 spy 引用绑定到 hoisted 对象
    modelSpies.build = mockModel.build as unknown as ReturnType<typeof vi.fn>;
    modelSpies.train = mockModel.train as unknown as ReturnType<typeof vi.fn>;
    modelSpies.save = mockModel.save as unknown as ReturnType<typeof vi.fn>;
    modelSpies.dispose = mockModel.dispose as unknown as ReturnType<typeof vi.fn>;
    generatorSpies.generate = mockGenerator.generate as unknown as ReturnType<typeof vi.fn>;

    // 默认成功返回值
    mockModel.build.mockReturnValue({});
    mockModel.train.mockResolvedValue({});
    mockModel.save.mockResolvedValue(undefined);
    mockModel.dispose.mockReturnValue(undefined);
    idbSpies.put.mockResolvedValue(undefined);
    idbSpies.init.mockResolvedValue(undefined);
  });

  it('getModel 应返回训练器持有的 SignModel 实例', () => {
    const trainer = new ModelTrainer();
    const model = trainer.getModel();
    expect(model).toBe(mockModel);
  });

  it('LABEL_MAP_KEY 应包含版本号 v2', () => {
    expect(LABEL_MAP_KEY).toBe('sign-model-label-map-v2');
  });

  it('trainAndExport 应按顺序调用 generate / build / train / save / dispose', async () => {
    const mockX = [[[0]]];
    const mockY = [0, 1, 0];
    const mockLabels = ['g1', 'g2'];
    mockGenerator.generate.mockResolvedValue({ x: mockX, y: mockY, labels: mockLabels });

    const trainer = new ModelTrainer();
    await trainer.trainAndExport();

    expect(mockGenerator.generate).toHaveBeenCalledTimes(1);
    // build 用 labels.length 作为 numClasses
    expect(mockModel.build).toHaveBeenCalledTimes(1);
    expect(mockModel.build).toHaveBeenCalledWith(2);
    // train 调用顺序应在 build 之后
    expect(mockModel.train).toHaveBeenCalledTimes(1);
    expect(mockModel.train).toHaveBeenCalledWith(mockX, mockY, 50);
    // save 应被调用
    expect(mockModel.save).toHaveBeenCalledTimes(1);
    expect(mockModel.save).toHaveBeenCalledWith('indexeddb://signbridge-sign-model-v2');
    // 训练完成后应释放模型资源
    expect(mockModel.dispose).toHaveBeenCalledTimes(1);
  });

  it('trainAndExport 应将标签映射保存到 IndexedDB 的 CACHE store', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [[[0]]],
      y: [0, 1, 2],
      labels: ['g1', 'g2', 'g3'],
    });

    const trainer = new ModelTrainer();
    await trainer.trainAndExport();

    // idb.init 应被调用（saveLabelMap 内部）
    expect(idbSpies.init).toHaveBeenCalledTimes(1);
    // put 应被调用，存入 CACHE store
    expect(idbSpies.put).toHaveBeenCalledTimes(1);
    expect(idbSpies.put).toHaveBeenCalledWith('cache', expect.objectContaining({
      key: 'sign-model-label-map-v2',
      labels: ['g1', 'g2', 'g3'],
      entries: [
        { gloss_id: 'g1', index: 0 },
        { gloss_id: 'g2', index: 1 },
        { gloss_id: 'g3', index: 2 },
      ],
    }));
  });

  it('trainAndExport 在 generate 抛错时应向上传播且不调用 build', async () => {
    mockGenerator.generate.mockRejectedValue(new Error('词汇数据为空'));

    const trainer = new ModelTrainer();
    await expect(trainer.trainAndExport()).rejects.toThrow('词汇数据为空');

    // build / train / save / dispose 不应被调用
    expect(mockModel.build).not.toHaveBeenCalled();
    expect(mockModel.train).not.toHaveBeenCalled();
    expect(mockModel.save).not.toHaveBeenCalled();
    expect(mockModel.dispose).not.toHaveBeenCalled();
  });

  it('trainAndExport 在 train 抛错时应向上传播', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [[[0]]],
      y: [0],
      labels: ['g1'],
    });
    mockModel.train.mockRejectedValue(new Error('训练失败'));

    const trainer = new ModelTrainer();
    await expect(trainer.trainAndExport()).rejects.toThrow('训练失败');

    // save 不应被调用（train 在 save 之前）
    expect(mockModel.save).not.toHaveBeenCalled();
    // idb.put 也不应被调用
    expect(idbSpies.put).not.toHaveBeenCalled();
  });

  it('trainAndExport 在 save 抛错时应向上传播且不调用 dispose', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [[[0]]],
      y: [0],
      labels: ['g1'],
    });
    mockModel.save.mockRejectedValue(new Error('保存失败'));

    const trainer = new ModelTrainer();
    await expect(trainer.trainAndExport()).rejects.toThrow('保存失败');

    // save 失败后不应继续 dispose
    expect(mockModel.dispose).not.toHaveBeenCalled();
  });

  it('trainAndExport 标签数量为 0 时应调用 build(0)', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [],
      y: [],
      labels: [],
    });

    const trainer = new ModelTrainer();
    await trainer.trainAndExport();

    expect(mockModel.build).toHaveBeenCalledWith(0);
  });

  it('trainAndExport 训练 epochs 应固定为 50', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [[[0]]],
      y: [0],
      labels: ['g1'],
    });

    const trainer = new ModelTrainer();
    await trainer.trainAndExport();

    expect(mockModel.train).toHaveBeenCalledWith(expect.anything(), expect.anything(), 50);
  });

  it('多次 trainAndExport 调用应每次重新执行完整流程', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [[[0]]],
      y: [0],
      labels: ['g1'],
    });

    const trainer = new ModelTrainer();
    await trainer.trainAndExport();
    await trainer.trainAndExport();

    expect(mockGenerator.generate).toHaveBeenCalledTimes(2);
    expect(mockModel.build).toHaveBeenCalledTimes(2);
    expect(mockModel.train).toHaveBeenCalledTimes(2);
    expect(mockModel.save).toHaveBeenCalledTimes(2);
    expect(mockModel.dispose).toHaveBeenCalledTimes(2);
  });

  it('saveLabelMap 在 idb.init 失败时应向上传播', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [[[0]]],
      y: [0],
      labels: ['g1'],
    });
    idbSpies.init.mockRejectedValue(new Error('IDB 初始化失败'));

    const trainer = new ModelTrainer();
    await expect(trainer.trainAndExport()).rejects.toThrow('IDB 初始化失败');
  });

  it('saveLabelMap 在 idb.put 失败时应向上传播', async () => {
    mockGenerator.generate.mockResolvedValue({
      x: [[[0]]],
      y: [0],
      labels: ['g1'],
    });
    idbSpies.put.mockRejectedValue(new Error('写入失败'));

    const trainer = new ModelTrainer();
    await expect(trainer.trainAndExport()).rejects.toThrow('写入失败');
    // saveLabelMap 在 dispose 之前抛错 → dispose 不应被执行
    expect(mockModel.dispose).not.toHaveBeenCalled();
  });
});
