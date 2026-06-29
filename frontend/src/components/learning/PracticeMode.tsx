// 跟练模式组件
// 流程：选词 → 虚拟人演示 → 用户模仿 → 摄像头捕捉 → DTW 评分 → 反馈
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { ScoreFeedback } from './ScoreFeedback';
import { useAvatarPlayer } from '@/hooks/useAvatarPlayer';
import { useHandTracking } from '@/hooks/useHandTracking';
import { vocabularyStore } from '@/modules/data/VocabularyStore';
import { PracticeScorer, generateStandardKeypoints } from '@/modules/learning/Scoring';
import type { FrameKeypoints, PracticeScore } from '@/types/recognition';
import type { SignGloss } from '@/types/sign';

/** 需要捕捉的帧数 */
const CAPTURE_FRAME_COUNT = 30;

/** 跟练阶段 */
type PracticePhase = 'demo' | 'capturing' | 'result';

/** 评分器单例 */
const scorer = new PracticeScorer();

/** PracticeMode 组件 Props */
export interface PracticeModeProps {
  /** 初始词汇（可选） */
  initialGloss?: SignGloss;
}

/**
 * 跟练模式
 * 1. 从词汇库随机选词，虚拟人演示标准动作
 * 2. 用户点击"开始模仿"启动摄像头
 * 3. 捕捉 30 帧手部关键点
 * 4. 与标准动作关键点 DTW 对齐评分
 * 5. 显示评分和反馈
 */
export function PracticeMode({ initialGloss }: PracticeModeProps) {
  const [allWords, setAllWords] = useState<SignGloss[]>([]);
  const [currentGloss, setCurrentGloss] = useState<SignGloss | null>(initialGloss ?? null);
  const [phase, setPhase] = useState<PracticePhase>('demo');
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

  // 加载词汇库并初始化
  useEffect(() => {
    vocabularyStore.getAll().then((words) => {
      setAllWords(words);
      if (!currentGloss && words.length > 0) {
        pickRandomWord(words);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 随机选择一个词汇并播放演示 */
  const pickRandomWord = useCallback(
    (words: SignGloss[]) => {
      const pool = words.length > 0 ? words : allWords;
      if (pool.length === 0) return;
      const idx = Math.floor(Math.random() * pool.length);
      const gloss = pool[idx];
      setCurrentGloss(gloss);
      setScore(null);
      setPhase('demo');
      // 预生成标准关键点序列
      standardKeypointsRef.current = generateStandardKeypoints(gloss, CAPTURE_FRAME_COUNT);
      // 播放演示动作
      playGloss(gloss.gloss_id);
    },
    [allWords, playGloss],
  );

  /** 点击"开始模仿"：启动摄像头进入捕捉阶段 */
  const handleStartImitate = useCallback((): void => {
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
      setPhase('demo');
      return;
    }
    const result = scorer.score(userFrames, standardFrames);
    setScore(result);
    setPhase('result');
  }, []);

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

  /** 再试一次：重新演示并准备捕捉 */
  const handleRetry = useCallback((): void => {
    framesRef.current = [];
    setCapturedCount(0);
    setScore(null);
    setPhase('demo');
    if (currentGloss) {
      playGloss(currentGloss.gloss_id);
    }
  }, [currentGloss, playGloss]);

  /** 下一个词 */
  const handleNext = useCallback((): void => {
    pickRandomWord(allWords);
  }, [allWords, pickRandomWord]);

  // 捕捉进度百分比
  const captureProgress = useMemo(
    () => Math.min(100, (capturedCount / CAPTURE_FRAME_COUNT) * 100),
    [capturedCount],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 左侧：词汇信息 + 虚拟人演示 */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-full rounded-xl bg-white/80 p-4 text-center">
          {currentGloss ? (
            <>
              <div className="text-2xl font-bold text-gray-800">{currentGloss.chinese}</div>
              <div className="mt-1 text-sm text-gray-500">
                {currentGloss.category} · 难度 {'★'.repeat(currentGloss.difficulty)}
              </div>
              {currentGloss.english && (
                <div className="mt-1 text-xs text-gray-400">{currentGloss.english}</div>
              )}
            </>
          ) : (
            <div className="text-gray-500">加载中...</div>
          )}
        </div>

        <AvatarCanvas pose={pose} width={400} height={400} />

        {phase === 'demo' && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleStartImitate}
              disabled={!currentGloss || isPlaying}
              className="rounded-lg bg-gradient-to-r from-brand-start to-brand-end px-8 py-3 font-medium text-white shadow-md transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlaying ? '正在演示...' : '开始模仿'}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              换一个词
            </button>
          </div>
        )}
      </div>

      {/* 右侧：摄像头 / 评分结果 */}
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

        {phase === 'demo' && (
          <div className="flex h-96 items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 text-gray-400">
            点击"开始模仿"启动摄像头
          </div>
        )}
      </div>
    </div>
  );
}
