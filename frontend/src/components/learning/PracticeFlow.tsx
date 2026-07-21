// 通用练习流程容器
// 封装 PracticeMode 和 AITutor 共享的阶段机、帧收集、评分逻辑与右侧 UI
// 通过 props 注入差异化的出题策略、难度调整与左侧面板渲染
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScoreFeedback } from './ScoreFeedback';
import { useAvatarPlayer } from '@/hooks/useAvatarPlayer';
import { useHandTracking } from '@/hooks/useHandTracking';
import { vocabularyStore } from '@/modules/data/VocabularyStore';
import { PracticeScorer, generateStandardKeypoints } from '@/modules/learning/Scoring';
import type { BonePose } from '@/types/avatar';
import type { FrameKeypoints, PracticeScore } from '@/types/recognition';
import type { SignGloss } from '@/types/sign';

/** 需要捕捉的帧数 */
const CAPTURE_FRAME_COUNT = 30;

/** 评分器单例 */
const scorer = new PracticeScorer();

/** 练习阶段：idle（待开始）/ capturing（捕捉中）/ result（结果） */
export type PracticePhase = 'idle' | 'capturing' | 'result';

/** 左侧面板渲染上下文 */
export interface LeftPanelContext {
  /** 当前词汇 */
  currentGloss: SignGloss | null;
  /** 当前阶段 */
  phase: PracticePhase;
  /** 虚拟人是否正在播放 */
  isPlaying: boolean;
  /** 虚拟人当前姿态 */
  pose: BonePose;
  /** 播放指定词汇的演示动作 */
  playGloss: (glossId: string) => Promise<void>;
  /** 开始捕捉 */
  onStart: () => void;
  /** 下一个词 */
  onNext: () => void;
}

/** PracticeFlow 组件 Props */
export interface PracticeFlowProps {
  /** 初始词汇（可选，传入后仅在用户主动换词时才调用 selectWord） */
  initialGloss?: SignGloss;
  /** 选词策略：从词汇库中选一个词，返回 null 表示无可用词汇 */
  selectWord: (words: SignGloss[]) => SignGloss | null;
  /** 选词后的副作用（如播放演示或语音播报），可选 */
  onWordSelected?: (gloss: SignGloss) => void;
  /** 评分完成后的回调（如难度调整），可选 */
  onScored?: (score: PracticeScore) => void;
  /** 重试时的额外行为（如重新演示/播报），可选 */
  onRetry?: (gloss: SignGloss | null) => void;
  /** 渲染左侧面板（题目展示 + 控制按钮） */
  renderLeftPanel: (ctx: LeftPanelContext) => ReactNode;
  /** 渲染顶部状态栏，可选（如 AI 陪练的难度/连击状态栏） */
  renderHeader?: () => ReactNode;
  /** idle 阶段右侧占位提示文案 */
  idleHint: string;
}

/**
 * 通用练习流程容器
 * - 加载词汇库，按 selectWord 策略出题
 * - 用户启动后捕捉 30 帧手部关键点
 * - 与标准关键点 DTW 评分
 * - 显示评分和反馈
 * - 通过 props 注入差异化的出题策略、难度调整、UI 渲染
 */
export function PracticeFlow({
  initialGloss,
  selectWord,
  onWordSelected,
  onScored,
  onRetry,
  renderLeftPanel,
  renderHeader,
  idleHint,
}: PracticeFlowProps) {
  const [allWords, setAllWords] = useState<SignGloss[]>([]);
  const [currentGloss, setCurrentGloss] = useState<SignGloss | null>(initialGloss ?? null);
  const [phase, setPhase] = useState<PracticePhase>('idle');
  const [score, setScore] = useState<PracticeScore | null>(null);
  const [capturedCount, setCapturedCount] = useState(0);

  // 帧收集缓冲区（使用 ref 避免每帧 re-render 影响性能）
  const framesRef = useRef<FrameKeypoints[]>([]);
  // 标准关键点缓存
  const standardKeypointsRef = useRef<FrameKeypoints[]>([]);

  const { pose, isPlaying, playGloss } = useAvatarPlayer();
  const {
    videoRef,
    canvasRef,
    isTracking,
    keypoints,
    error,
    start,
    stop,
  } = useHandTracking({ width: 640, height: 480 });

  /** 内部选词：调用外部策略并更新状态 */
  const pickWord = useCallback(
    (words: SignGloss[]): void => {
      const gloss = selectWord(words);
      if (!gloss) return;
      setCurrentGloss(gloss);
      setScore(null);
      setPhase('idle');
      // 预生成标准关键点序列
      standardKeypointsRef.current = generateStandardKeypoints(gloss, CAPTURE_FRAME_COUNT);
      // 通知外部执行副作用（播放演示或语音播报）
      onWordSelected?.(gloss);
    },
    [selectWord, onWordSelected],
  );

  // 用 ref 同步 pickWord 与 initialGloss 的最新引用，避免挂载 effect 闭包捕获陈旧值
  const pickWordRef = useRef(pickWord);
  const initialGlossRef = useRef(initialGloss);
  useEffect(() => {
    pickWordRef.current = pickWord;
    initialGlossRef.current = initialGloss;
  }, [pickWord, initialGloss]);

  // 加载词汇库并出第一题（仅在未提供 initialGloss 时）
  useEffect(() => {
    vocabularyStore.getAll().then((words) => {
      setAllWords(words);
      if (!initialGlossRef.current) {
        pickWordRef.current(words);
      }
    });
  }, []);

  /** 点击"开始模仿/答题"：启动摄像头进入捕捉阶段 */
  const handleStart = useCallback((): void => {
    framesRef.current = [];
    setCapturedCount(0);
    setScore(null);
    setPhase('capturing');
    start();
  }, [start]);

  /** 计算评分并进入结果阶段 */
  const computeScore = useCallback((): void => {
    const userFrames = framesRef.current;
    const standardFrames = standardKeypointsRef.current;
    if (userFrames.length === 0 || standardFrames.length === 0) {
      setPhase('idle');
      return;
    }
    const result = scorer.score(userFrames, standardFrames);
    setScore(result);
    setPhase('result');
    // 通知外部执行评分后处理（如难度调整）
    onScored?.(result);
  }, [onScored]);

  // 监听 keypoints 变化，在捕捉阶段收集帧
  useEffect(() => {
    if (phase !== 'capturing' || !keypoints || !isTracking) return;
    framesRef.current.push(keypoints);
    setCapturedCount(framesRef.current.length);
    // 达到目标帧数后停止并评分
    if (framesRef.current.length >= CAPTURE_FRAME_COUNT) {
      stop();
      computeScore();
    }
  }, [keypoints, phase, isTracking, stop, computeScore]);

  /** 重试：清空状态并通知外部执行副作用 */
  const handleRetry = useCallback((): void => {
    framesRef.current = [];
    setCapturedCount(0);
    setScore(null);
    setPhase('idle');
    onRetry?.(currentGloss);
  }, [currentGloss, onRetry]);

  /** 下一个词 */
  const handleNext = useCallback((): void => {
    pickWord(allWords);
  }, [allWords, pickWord]);

  // 捕捉进度百分比
  const captureProgress = useMemo(
    () => Math.min(100, (capturedCount / CAPTURE_FRAME_COUNT) * 100),
    [capturedCount],
  );

  // 右侧面板：摄像头 / 评分结果 / 空闲占位
  const rightPanel = (
    <div className="flex flex-col items-center gap-4">
      {phase === 'capturing' && (
        <>
          <div
            className="relative overflow-hidden rounded-2xl border border-white/40 bg-black shadow-lg"
            style={{ width: 640, height: 480 }}
          >
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="h-full w-full" style={{ width: 640, height: 480 }} />
            <div className="absolute left-3 top-3 rounded-md bg-black/50 px-3 py-1 text-sm text-white">
              ● 捕捉中 {capturedCount}/{CAPTURE_FRAME_COUNT}
            </div>
          </div>
          {/* 捕捉进度条 */}
          <div className="w-full max-w-md">
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-gradient-to-r from-brand-start to-brand-end transition-all duration-150"
                style={{ width: `${captureProgress}%` }}
              />
            </div>
          </div>
          {error && <div className="text-sm text-red-500">{error}</div>}
        </>
      )}

      {phase === 'result' && score && (
        <ScoreFeedback score={score} onRetry={handleRetry} onNext={handleNext} />
      )}

      {phase === 'idle' && (
        <div className="flex h-96 items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 text-gray-400">
          {idleHint}
        </div>
      )}
    </div>
  );

  // 左侧面板渲染上下文
  const leftPanelContext: LeftPanelContext = {
    currentGloss,
    phase,
    isPlaying,
    pose,
    playGloss,
    onStart: handleStart,
    onNext: handleNext,
  };

  const gridClass = 'grid grid-cols-1 gap-6 lg:grid-cols-2';

  // 顶部状态栏存在时外层用 space-y-6 包裹；否则直接以 grid 作为根
  return (
    <div className={renderHeader ? 'space-y-6' : gridClass}>
      {renderHeader?.()}
      {renderHeader ? (
        <div className={gridClass}>
          {renderLeftPanel(leftPanelContext)}
          {rightPanel}
        </div>
      ) : (
        <>
          {renderLeftPanel(leftPanelContext)}
          {rightPanel}
        </>
      )}
    </div>
  );
}
