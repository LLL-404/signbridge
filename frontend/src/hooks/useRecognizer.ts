// 手势识别器 Hook
// 封装多种识别器组合，让页面通过 hook 间接访问 modules/recognition：
// - 单帧识别模式（singleFrame）：WorkerRecognizer / RuleRecognizer + ContinuousRecognizer
//   用于 SignToTextPage（摄像头单帧手势识别）
// - 序列识别模式（sequence）：KeypointExtractor + SequenceClassifier + ConfidenceFilter
//   用于 DialoguePage（关键点序列分类，听障人侧手语→文字）
//
// 初始化策略：
// - 单帧模式：优先 Worker（后台线程），失败自动降级到 RuleRecognizer（主线程）
// - 序列模式：初始化 SequenceClassifier，自动加载已训练模型（不存在则触发训练）
// 组件卸载时自动 dispose 所有识别器，避免 Worker / TF.js 资源泄漏
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkerRecognizer } from '@/modules/recognition/WorkerRecognizer';
import { RuleRecognizer } from '@/modules/recognition/RuleRecognizer';
import { ContinuousRecognizer } from '@/modules/recognition/ContinuousRecognizer';
import { KeypointExtractor } from '@/modules/recognition/KeypointExtractor';
import { SequenceClassifier } from '@/modules/recognition/SequenceClassifier';
import { ConfidenceFilter, type FilterResult } from '@/modules/recognition/ConfidenceFilter';
import type { Recognizer, FrameInput } from '@/modules/recognition/Recognizer';
import type { GestureDefinition } from '@/modules/recognition/WorkerUtils';
import type {
  ContinuousResult,
  GestureEvent,
} from '@/modules/recognition/ContinuousRecognizer';
import type {
  ClassificationResult,
  FrameKeypoints,
  KeypointSequence,
} from '@/types/recognition';
import { logger } from '@/modules/debug/logger';
import { startupTracker } from '@/modules/debug/StartupTracker';

// 重新导出类型，让页面从 hook 获取类型，无需再 import modules
export type {
  GestureDefinition,
  ContinuousResult,
  GestureEvent,
  FrameInput,
  Recognizer,
  FilterResult,
};

const log = logger.module('useRecognizer');

/** 序列识别子模块（KeypointExtractor + SequenceClassifier + ConfidenceFilter） */
export interface SequenceRecognizerApi {
  /** 喂入一帧关键点 */
  feed: (frame: FrameKeypoints) => void;
  /** 是否检测到手势开始 */
  isMotionStarted: () => boolean;
  /** 是否检测到手势结束 */
  isMotionEnded: () => boolean;
  /** 提取累积的关键点序列 */
  extract: () => KeypointSequence | null;
  /** 重置关键点提取器状态 */
  reset: () => void;
  /** 分类关键点序列，返回 gloss_id/chinese/confidence */
  classify: (sequence: KeypointSequence) => Promise<ClassificationResult>;
  /** 置信度过滤（低于阈值的结果被拒绝） */
  filter: (result: ClassificationResult) => FilterResult;
  /** 序列分类器是否就绪 */
  isReady: () => boolean;
  /** 模型是否正在加载 */
  modelLoading: boolean;
}

/** useRecognizer 配置项 */
export interface UseRecognizerOptions {
  /** 启用单帧识别模式（Worker/Rule + ContinuousRecognizer），默认 true */
  singleFrame?: boolean;
  /** 启用序列识别模式（KeypointExtractor + SequenceClassifier + ConfidenceFilter），默认 false */
  sequence?: boolean;
}

/** useRecognizer 返回值 */
export interface UseRecognizerReturn {
  // ===== 单帧识别（仅 singleFrame=true 时可用） =====
  /** 识别单帧（封装当前识别器 recognize 调用，未就绪或出错时返回 null） */
  recognize: (input: FrameInput) => Promise<ClassificationResult | null>;
  /** 处理连续手势识别（封装 ContinuousRecognizer.process） */
  processContinuous: (result: ClassificationResult | null) => ContinuousResult;
  /** 清空连续手势序列（封装 ContinuousRecognizer.clear） */
  clearContinuous: () => void;
  /** 当前识别器是否就绪 */
  isReady: () => boolean;
  /** 是否处于降级模式（Worker 不可用，使用主线程规则识别） */
  isDegraded: () => boolean;
  /** 支持的手势列表 */
  supportedGestures: GestureDefinition[];
  /** 模型是否正在加载（单帧识别器） */
  modelLoading: boolean;
  /** 模型加载错误信息 */
  modelError: string | null;
  /** 当前启动阶段标签（用于 loading 界面展示） */
  currentPhaseLabel: string | undefined;

  // ===== 序列识别（仅 sequence=true 时可用，否则为 null） =====
  /** 序列识别子模块 */
  sequence: SequenceRecognizerApi | null;
}

/**
 * 手势识别器 Hook
 *
 * @param options 配置项，控制启用哪种识别模式
 *   - singleFrame=true（默认）：初始化 Worker/Rule + ContinuousRecognizer
 *   - sequence=true（默认 false）：初始化 KeypointExtractor + SequenceClassifier + ConfidenceFilter
 *
 * 组件卸载时自动 dispose 所有识别器
 */
export function useRecognizer(options: UseRecognizerOptions = {}): UseRecognizerReturn {
  const { singleFrame = true, sequence = false } = options;

  // ===== 状态 =====
  const [supportedGestures, setSupportedGestures] = useState<GestureDefinition[]>([]);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [currentPhaseLabel, setCurrentPhaseLabel] = useState<string | undefined>(undefined);
  const [sequenceModelLoading, setSequenceModelLoading] = useState(true);

  // ===== 单帧识别实例引用 =====
  const recognizerRef = useRef<Recognizer | null>(null);
  const workerRecognizerRef = useRef<WorkerRecognizer | null>(null);
  const ruleRecognizerRef = useRef<RuleRecognizer | null>(null);
  const continuousRecognizerRef = useRef<ContinuousRecognizer | null>(null);

  // ===== 序列识别实例引用 =====
  const extractorRef = useRef<KeypointExtractor | null>(null);
  const classifierRef = useRef<SequenceClassifier | null>(null);
  const filterRef = useRef<ConfidenceFilter | null>(null);

  // 订阅启动阶段变化，用于 loading 界面显示当前阶段
  useEffect(() => {
    return startupTracker.onPhaseChange(() => {
      setCurrentPhaseLabel(startupTracker.getCurrentPhase()?.label);
    });
  }, []);

  // 初始化单帧识别器（优先 Worker，失败降级到主线程）
  useEffect(() => {
    if (!singleFrame) return;
    continuousRecognizerRef.current = new ContinuousRecognizer();
    let cancelled = false;

    const initWorker = async () => {
      startupTracker.start('signpage-worker-init', '初始化识别器');
      try {
        const workerRecognizer = new WorkerRecognizer();
        await workerRecognizer.init();
        if (cancelled) {
          workerRecognizer.dispose();
          return;
        }
        workerRecognizerRef.current = workerRecognizer;
        recognizerRef.current = workerRecognizer;
        startupTracker.end('signpage-worker-init');
        setModelLoading(false);
        setSupportedGestures(workerRecognizer.getGestures());
      } catch (err) {
        log.warn('Worker 不可用，降级到主线程', err);
        startupTracker.fail('signpage-worker-init', err);
        startupTracker.start('signpage-fallback-init', '降级到规则识别');
        // 降级到 RuleRecognizer
        const ruleRecognizer = new RuleRecognizer();
        await ruleRecognizer.init();
        if (cancelled) {
          ruleRecognizer.dispose();
          return;
        }
        ruleRecognizerRef.current = ruleRecognizer;
        recognizerRef.current = ruleRecognizer;
        startupTracker.end('signpage-fallback-init');
        setModelLoading(false);
        setSupportedGestures(ruleRecognizer.getGestures());
      }
    };

    initWorker().catch((err) => {
      if (!cancelled) {
        setModelError(err instanceof Error ? err.message : '模型加载失败');
        setModelLoading(false);
      }
    });

    return () => {
      cancelled = true;
      workerRecognizerRef.current?.dispose();
      ruleRecognizerRef.current?.dispose();
    };
    // 初始化 effect：仅挂载时运行一次，内部依赖均为稳定引用（refs/setState）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleFrame]);

  // 初始化序列识别管道
  useEffect(() => {
    if (!sequence) return;
    extractorRef.current = new KeypointExtractor();
    classifierRef.current = new SequenceClassifier();
    filterRef.current = new ConfidenceFilter();
    let cancelled = false;
    startupTracker.start('dialogue-model-load', '加载对话模型');
    classifierRef.current
      .init()
      .then(() => {
        if (!cancelled) {
          startupTracker.end('dialogue-model-load');
          setSequenceModelLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          startupTracker.fail('dialogue-model-load', err);
          log.error('模型加载失败', err);
          setSequenceModelLoading(false);
        }
      });
    return () => {
      cancelled = true;
      // 先取消初始化（让 init 在下一个 await 点退出），再释放资源
      // 避免 TF.js 训练完成后继续执行赋值等副作用，同时防止 cleanup 时训练阻塞主线程
      classifierRef.current?.cancelInit();
      classifierRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence]);

  /** 识别单帧：内部 try-catch，失败返回 null */
  const recognize = useCallback(
    async (input: FrameInput): Promise<ClassificationResult | null> => {
      const recognizer = recognizerRef.current;
      if (!recognizer) return null;
      try {
        return await recognizer.recognize(input);
      } catch (err) {
        log.error('识别失败', err);
        return null;
      }
    },
    [],
  );

  /** 处理连续手势识别 */
  const processContinuous = useCallback(
    (result: ClassificationResult | null): ContinuousResult => {
      const continuous = continuousRecognizerRef.current;
      if (!continuous) {
        return { sequence: [], combinedText: '', newGesture: false };
      }
      return continuous.process(result);
    },
    [],
  );

  /** 清空连续手势序列 */
  const clearContinuous = useCallback((): void => {
    continuousRecognizerRef.current?.clear();
  }, []);

  /** 当前识别器是否就绪 */
  const isReady = useCallback((): boolean => {
    return recognizerRef.current?.isReady() ?? false;
  }, []);

  /** 是否处于降级模式 */
  const isDegraded = useCallback((): boolean => {
    return workerRecognizerRef.current?.isDegraded() ?? false;
  }, []);

  // ===== 序列识别 API（仅在 sequence=true 时构造） =====
  const sequenceApi: SequenceRecognizerApi | null = sequence
    ? {
        feed: (frame: FrameKeypoints) => extractorRef.current?.feed(frame),
        isMotionStarted: () => extractorRef.current?.isMotionStarted() ?? false,
        isMotionEnded: () => extractorRef.current?.isMotionEnded() ?? false,
        extract: () => extractorRef.current?.extract() ?? null,
        reset: () => extractorRef.current?.reset(),
        classify: async (seq: KeypointSequence) => {
          const classifier = classifierRef.current;
          if (!classifier) throw new Error('分类器未初始化');
          return classifier.classify(seq);
        },
        filter: (result: ClassificationResult) =>
          filterRef.current?.filter(result) ?? { accepted: false, message: '过滤器未初始化' },
        isReady: () => classifierRef.current?.isReady() ?? false,
        modelLoading: sequenceModelLoading,
      }
    : null;

  return {
    recognize,
    processContinuous,
    clearContinuous,
    isReady,
    isDegraded,
    supportedGestures,
    modelLoading,
    modelError,
    currentPhaseLabel,
    sequence: sequenceApi,
  };
}
