// AI 陪练模式组件
// 系统出题 → 用户打手语 → 识别评分 → 动态调整难度
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar3D from '@/components/avatar/Avatar3D';
import { ScoreFeedback } from './ScoreFeedback';
import { useAvatarPlayer } from '@/hooks/useAvatarPlayer';
import { useHandTracking } from '@/hooks/useHandTracking';
import { vocabularyStore } from '@/modules/data/VocabularyStore';
import { PracticeScorer, generateStandardKeypoints } from '@/modules/learning/Scoring';
import type { FrameKeypoints, PracticeScore } from '@/types/recognition';
import type { SignGloss } from '@/types/sign';

/** 需要捕捉的帧数 */
const CAPTURE_FRAME_COUNT = 30;
/** 提升难度所需的连续达标次数 */
const PROMOTE_STREAK = 3;
/** 提升难度阈值 */
const PROMOTE_THRESHOLD = 80;
/** 降低难度阈值 */
const DEMOTE_THRESHOLD = 60;

/** 陪练阶段 */
type TutorPhase = 'prompt' | 'capturing' | 'result';

/** 难度等级文本 */
const DIFFICULTY_LABELS: Record<number, string> = {
  1: '简单',
  2: '中等',
  3: '困难',
};

/** 评分器单例 */
const scorer = new PracticeScorer();

/** AITutor 组件 Props */
export interface AITutorProps {
  /** 初始难度等级，默认 1 */
  initialDifficulty?: 1 | 2 | 3;
}

/**
 * AI 陪练模式
 * - 系统按当前难度出题（显示文字 + 语音播报）
 * - 用户打手语，摄像头捕捉并评分
 * - 连续 3 次 >= 80 分 → 提升难度；< 60 分 → 降低难度
 * - 显示当前得分、连击数、难度等级
 */
export function AITutor({ initialDifficulty = 1 }: AITutorProps) {
  const [allWords, setAllWords] = useState<SignGloss[]>([]);
  const [currentGloss, setCurrentGloss] = useState<SignGloss | null>(null);
  const [phase, setPhase] = useState<TutorPhase>('prompt');
  const [score, setScore] = useState<PracticeScore | null>(null);
  const [capturedCount, setCapturedCount] = useState(0);

  // 难度与连击状态
  const [difficulty, setDifficulty] = useState<number>(initialDifficulty);
  const [streak, setStreak] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [roundCount, setRoundCount] = useState(0);

  // 帧收集与标准关键点
  const framesRef = useRef<FrameKeypoints[]>([]);
  const standardKeypointsRef = useRef<FrameKeypoints[]>([]);

  const { pose, playGloss } = useAvatarPlayer();
  const {
    videoRef,
    canvasRef,
    isTracking,
    keypoints,
    error,
    start,
    stop,
  } = useHandTracking({ width: 640, height: 480 });

  // 加载词汇库并出第一题
  useEffect(() => {
    vocabularyStore.getAll().then((words) => {
      setAllWords(words);
      pickWord(words, initialDifficulty);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 语音播报中文词 */
  const speak = useCallback((text: string): void => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, []);

  /** 按难度出题：从对应难度的词汇中随机选一个 */
  const pickWord = useCallback(
    (words: SignGloss[], level: number): void => {
      // 筛选当前难度的词汇，无匹配时回退到全部
      const pool = words.filter((w) => w.difficulty === level);
      const candidates = pool.length > 0 ? pool : words;
      if (candidates.length === 0) return;

      const idx = Math.floor(Math.random() * candidates.length);
      const gloss = candidates[idx];
      setCurrentGloss(gloss);
      setScore(null);
      setPhase('prompt');
      framesRef.current = [];
      setCapturedCount(0);
      // 预生成标准关键点
      standardKeypointsRef.current = generateStandardKeypoints(gloss, CAPTURE_FRAME_COUNT);
      // 语音播报题目
      speak(gloss.chinese);
    },
    [speak],
  );

  /** 点击"开始答题"：启动摄像头捕捉 */
  const handleStart = useCallback((): void => {
    framesRef.current = [];
    setCapturedCount(0);
    setScore(null);
    setPhase('capturing');
    start();
  }, [start]);

  /** 计算评分并更新难度/连击 */
  const computeScore = useCallback((): void => {
    const userFrames = framesRef.current;
    const standardFrames = standardKeypointsRef.current;
    if (userFrames.length === 0 || standardFrames.length === 0) {
      setPhase('prompt');
      return;
    }
    const result = scorer.score(userFrames, standardFrames);
    setScore(result);
    setPhase('result');

    // 更新总分与轮次
    setTotalScore((prev) => prev + result.total_score);
    setRoundCount((prev) => prev + 1);

    // 根据评分调整连击与难度
    if (result.total_score >= PROMOTE_THRESHOLD) {
      setStreak((prev) => {
        const newStreak = prev + 1;
        // 连续达标且未到最高难度 → 提升
        if (newStreak >= PROMOTE_STREAK && difficulty < 3) {
          setDifficulty((d) => Math.min(3, d + 1));
          return 0; // 提升后重置连击
        }
        return newStreak;
      });
    } else if (result.total_score < DEMOTE_THRESHOLD) {
      // 未达标 → 重置连击，降低难度
      setStreak(0);
      setDifficulty((d) => Math.max(1, d - 1));
    } else {
      // 60-80 之间：保持连击不增加
    }
  }, [difficulty]);

  // 监听 keypoints 变化，在捕捉阶段收集帧
  useEffect(() => {
    if (phase !== 'capturing' || !keypoints || !isTracking) return;
    framesRef.current.push(keypoints);
    setCapturedCount(framesRef.current.length);
    if (framesRef.current.length >= CAPTURE_FRAME_COUNT) {
      stop();
      computeScore();
    }
  }, [keypoints, phase, isTracking, stop, computeScore]);

  /** 下一题 */
  const handleNext = useCallback((): void => {
    pickWord(allWords, difficulty);
  }, [allWords, difficulty, pickWord]);

  /** 重试当前题 */
  const handleRetry = useCallback((): void => {
    setScore(null);
    setPhase('prompt');
    framesRef.current = [];
    setCapturedCount(0);
    if (currentGloss) {
      speak(currentGloss.chinese);
    }
  }, [currentGloss, speak]);

  /** 查看标准演示 */
  const handleViewDemo = useCallback((): void => {
    if (currentGloss) {
      playGloss(currentGloss.gloss_id);
    }
  }, [currentGloss, playGloss]);

  // 平均分
  const avgScore = useMemo(
    () => (roundCount > 0 ? Math.round(totalScore / roundCount) : 0),
    [totalScore, roundCount],
  );

  // 捕捉进度
  const captureProgress = useMemo(
    () => Math.min(100, (capturedCount / CAPTURE_FRAME_COUNT) * 100),
    [capturedCount],
  );

  return (
    <div className="space-y-6">
      {/* 顶部状态栏：难度、连击、平均分 */}
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl bg-white/80 p-4">
        <div className="text-center">
          <div className="text-xs text-gray-500">难度等级</div>
          <div className="text-lg font-bold text-brand-start">
            {difficulty} - {DIFFICULTY_LABELS[difficulty]}
          </div>
        </div>
        <div className="h-8 w-px bg-gray-300" />
        <div className="text-center">
          <div className="text-xs text-gray-500">连击</div>
          <div className="text-lg font-bold text-orange-500">{streak}</div>
        </div>
        <div className="h-8 w-px bg-gray-300" />
        <div className="text-center">
          <div className="text-xs text-gray-500">已练</div>
          <div className="text-lg font-bold text-gray-700">{roundCount}</div>
        </div>
        <div className="h-8 w-px bg-gray-300" />
        <div className="text-center">
          <div className="text-xs text-gray-500">平均分</div>
          <div className="text-lg font-bold text-green-500">{avgScore}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左侧：题目 + 虚拟人 */}
        <div className="flex flex-col items-center gap-4">
          {/* 题目展示 */}
          <div className="w-full rounded-xl bg-gradient-to-r from-brand-start to-brand-end p-6 text-center text-white shadow-lg">
            <div className="text-sm opacity-80">请打出以下手语</div>
            {currentGloss ? (
              <div className="mt-2 text-4xl font-bold">{currentGloss.chinese}</div>
            ) : (
              <div className="mt-2 text-2xl">加载中...</div>
            )}
          </div>

          <Avatar3D pose={pose} width={400} height={400} />

          {phase === 'prompt' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleStart}
                disabled={!currentGloss}
                className="rounded-lg bg-gradient-to-r from-brand-start to-brand-end px-8 py-3 font-medium text-white shadow-md transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                开始答题
              </button>
              <button
                type="button"
                onClick={handleViewDemo}
                disabled={!currentGloss}
                className="rounded-lg bg-white/80 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-white"
              >
                查看演示
              </button>
              <button
                type="button"
                onClick={() => currentGloss && speak(currentGloss.chinese)}
                disabled={!currentGloss}
                className="rounded-lg bg-white/80 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-white"
              >
                🔊 重播
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

          {phase === 'prompt' && (
            <div className="flex h-96 items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 text-gray-400">
              点击"开始答题"启动摄像头
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
