/**
 * 手语转文字页面
 *
 * 集成三层识别架构：
 *   1. WorkerRecognizer - Worker 化 MediaPipe 推理（主路径，后台线程）
 *   2. RuleRecognizer   - 几何规则识别（降级 fallback，主线程）
 *   3. ContinuousRecognizer - 连续手势状态机（滑动窗口 + 组合词典）
 *
 * 数据流：
 *   getUserMedia → video → requestAnimationFrame → recognizer.recognize
 *     → ContinuousRecognizer.process → 单帧手势 + 组合文本 → UI
 *
 * 降级策略：
 *   Worker 初始化失败 / 崩溃超限 → 自动切换 RuleRecognizer，UI 显示降级提示
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkerRecognizer } from '@/modules/recognition/WorkerRecognizer';
import { RuleRecognizer, type GestureDefinition } from '@/modules/recognition/RuleRecognizer';
import {
  ContinuousRecognizer,
  type GestureEvent,
  type ContinuousResult,
} from '@/modules/recognition/ContinuousRecognizer';
import type { Recognizer } from '@/modules/recognition/Recognizer';
import type { ClassificationResult, RecognitionStatus } from '@/types/recognition';
import { PageHeader } from '@/components/common/PageHeader';

/** 历史记录最大条数 */
const MAX_HISTORY = 10;

/** 状态提示配置 */
const STATUS_CONFIG: Record<
  RecognitionStatus,
  { text: string; color: string; bg: string }
> = {
  idle: { text: '点击启动摄像头开始手势识别', color: 'text-content-secondary', bg: 'bg-dark-800' },
  waiting: { text: '等待手势...', color: 'text-accent-300', bg: 'bg-accent-500/10' },
  capturing: { text: '检测到手势...', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  recognizing: { text: '识别中...', color: 'text-accent-200', bg: 'bg-accent-500/15' },
  result: { text: '识别完成', color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  uncertain: { text: '未检测到手势', color: 'text-content-tertiary', bg: 'bg-dark-800' },
};

/** 历史记录条目 */
interface HistoryItem {
  id: number;
  chinese: string;
  confidence: number;
  gloss_id: string;
  timestamp: number;
}

/**
 * 手语识别页面（插件化架构 + JSON 手势库版）
 * 基于 MediaPipe Hands 关键点 + JSON 规则匹配，支持手势热加载和自定义
 * 流程：摄像头 → MediaPipe Hands → 关键点几何特征 → JSON 规则匹配 → 文字输出
 */
export function SignToTextPage() {
  // 模型加载状态
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  // 识别状态与结果
  const [status, setStatus] = useState<RecognitionStatus>('idle');
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [supportedGestures, setSupportedGestures] = useState<GestureDefinition[]>([]);
  // 连续手语识别状态
  const [gestureSequence, setGestureSequence] = useState<GestureEvent[]>([]);
  const [combinedText, setCombinedText] = useState('');
  const [degradedMode, setDegradedMode] = useState(false);

  // 可变实例引用
  const recognizerRef = useRef<Recognizer | null>(null);
  const workerRecognizerRef = useRef<WorkerRecognizer | null>(null);
  const ruleRecognizerRef = useRef<RuleRecognizer | null>(null);
  const continuousRecognizerRef = useRef<ContinuousRecognizer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const historyIdRef = useRef(0);

  // 初始化识别器（优先用 Worker，失败降级到主线程）
  useEffect(() => {
    // 初始化连续识别器
    continuousRecognizerRef.current = new ContinuousRecognizer();
    let cancelled = false;

    const initWorker = async () => {
      try {
        const workerRecognizer = new WorkerRecognizer();
        await workerRecognizer.init();
        if (cancelled) {
          workerRecognizer.dispose();
          return;
        }
        workerRecognizerRef.current = workerRecognizer;
        recognizerRef.current = workerRecognizer;
        setModelLoading(false);
        setSupportedGestures(workerRecognizer.getGestures());
      } catch (err) {
        console.warn('[SignToTextPage] Worker 不可用，降级到主线程:', err);
        // 降级到 RuleRecognizer
        const ruleRecognizer = new RuleRecognizer();
        await ruleRecognizer.init();
        if (cancelled) {
          ruleRecognizer.dispose();
          return;
        }
        ruleRecognizerRef.current = ruleRecognizer;
        recognizerRef.current = ruleRecognizer;
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
      stopTracking();
      workerRecognizerRef.current?.dispose();
      ruleRecognizerRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 在 canvas 上绘制视频帧与手部关键点 */
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.save();
    // 镜像绘制
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
  }, []);

  /** 帧处理循环：使用 requestAnimationFrame 持续识别手势 */
  const processFrame = useCallback(async () => {
    if (!runningRef.current) return;

    const video = videoRef.current;
    const recognizer = recognizerRef.current;
    if (!video || !recognizer || !recognizer.isReady()) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      const recognition = await recognizer.recognize({ element: video });
      drawFrame();

      if (!runningRef.current) return;

      // 用连续识别器处理结果（内置稳定检测 + 序列组合）
      const continuous = continuousRecognizerRef.current;
      if (continuous) {
        const continuousResult: ContinuousResult = continuous.process(recognition);

        // 更新连续序列状态
        setGestureSequence(continuousResult.sequence);
        setCombinedText(continuousResult.combinedText);

        if (continuousResult.newGesture) {
          // 检测到新的稳定手势加入序列
          const lastGesture = continuousResult.sequence[continuousResult.sequence.length - 1];
          if (lastGesture) {
            setResult({
              gloss_id: lastGesture.gloss_id,
              chinese: lastGesture.chinese,
              confidence: lastGesture.confidence,
            });
            setStatus('result');
            const itemId = historyIdRef.current++;
            setHistory((prev) =>
              [
                {
                  id: itemId,
                  chinese: lastGesture.chinese,
                  confidence: lastGesture.confidence,
                  gloss_id: lastGesture.gloss_id,
                  timestamp: Date.now(),
                },
                ...prev,
              ].slice(0, MAX_HISTORY),
            );
          }
        } else if (recognition && recognition.gloss_id !== 'none') {
          setStatus('capturing');
        } else {
          setStatus('waiting');
        }
      }

      // 更新降级模式状态
      const workerRec = workerRecognizerRef.current;
      if (workerRec) {
        setDegradedMode(workerRec.isDegraded());
      }
    } catch (err) {
      console.error('识别失败:', err);
    }

    if (runningRef.current) {
      rafIdRef.current = requestAnimationFrame(processFrame);
    }
  }, [drawFrame]);

  /** 启动摄像头与识别循环 */
  const startTracking = useCallback(async () => {
    if (runningRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('视频元素未就绪');
      video.srcObject = stream;
      await video.play();

      // 设置 canvas 尺寸
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 480;
        canvas.height = 360;
      }

      runningRef.current = true;
      setIsTracking(true);
      setStatus('waiting');
      rafIdRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setModelError('请允许摄像头权限');
      } else {
        setModelError(err instanceof Error ? err.message : '摄像头启动失败');
      }
    }
  }, [processFrame]);

  /** 停止追踪 */
  const stopTracking = useCallback(() => {
    runningRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setIsTracking(false);
    setStatus('idle');
  }, []);

  // 模型加载中
  if (modelLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-accent-500 border-t-transparent" />
        <p className="text-lg font-medium text-content-primary">加载预训练模型中...</p>
        <p className="mt-2 text-sm text-content-tertiary">首次加载约 2-3 秒</p>
      </div>
    );
  }

  // 模型加载失败
  if (modelError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
          <span className="text-2xl text-red-400">!</span>
        </div>
        <p className="mb-2 text-lg font-semibold text-red-400">模型加载失败</p>
        <p className="text-content-secondary">{modelError}</p>
        <p className="mt-4 text-sm text-content-muted">
          请检查网络连接（需从 CDN 加载 MediaPipe 模型）
        </p>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[status];
  const confidencePercent = Math.round((result?.confidence ?? 0) * 100);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="手势识别"
        subtitle="摄像头捕捉手势，实时识别为中文"
        icon="✋"
      />

      {/* 支持的手势说明 */}
      <div className="card animate-fade-up p-5" style={{ animationDelay: '80ms' }}>
        <p className="mb-3 text-sm font-medium text-content-secondary">
          🎯 支持 {supportedGestures.length} 种手势（JSON 数据驱动，可自定义扩展）
        </p>
        <div className="flex flex-wrap gap-2">
          {supportedGestures.map((g) => (
            <span key={g.id} className="chip">
              {g.emoji} {g.chinese}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左侧：摄像头预览 */}
        <div className="flex items-start justify-center">
          <div
            className="card animate-fade-up relative overflow-hidden p-2"
            style={{ width: 484, height: 364, animationDelay: '120ms' }}
          >
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="h-full w-full rounded-xl" />

            {/* 状态提示 */}
            <div className="absolute left-5 top-5 rounded-md bg-dark-950/70 px-3 py-1 text-sm font-medium backdrop-blur-sm">
              <span className={isTracking ? 'text-cyan-400' : 'text-content-muted'}>
                ● {isTracking ? '正在识别' : '等待启动'}
              </span>
            </div>
          </div>
        </div>

        {/* 右侧：识别结果 */}
        <div className="flex flex-col gap-4">
          {/* 启动/停止按钮 */}
          <button
            type="button"
            onClick={isTracking ? stopTracking : startTracking}
            className={`animate-fade-up rounded-lg px-6 py-3 font-medium shadow-md transition-transform hover:scale-[1.02] active:scale-95 ${
              isTracking
                ? 'border border-red-500/40 bg-red-500/15 text-red-400'
                : 'bg-accent-500 text-white hover:bg-accent-600'
            }`}
            style={{ animationDelay: '160ms' }}
          >
            {isTracking ? '⏹ 停止识别' : '▶ 启动识别'}
          </button>

          {/* 状态提示 */}
          <div className={`card animate-fade-up rounded-xl p-4 ${statusConfig.bg}`} style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2">
              {status === 'capturing' && (
                <span className="h-3 w-3 animate-pulse rounded-full bg-cyan-400" />
              )}
              {status === 'recognizing' && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-400 border-t-transparent" />
              )}
              <span className={`font-medium ${statusConfig.color}`}>{statusConfig.text}</span>
            </div>
          </div>

          {/* 识别结果 */}
          <div className="card animate-fade-up flex min-h-[120px] items-center justify-center border border-dashed border-dark-600 p-6 text-center" style={{ animationDelay: '240ms' }}>
            {status === 'result' && result ? (
              <span className="text-5xl font-bold text-accent-300">{result.chinese}</span>
            ) : status === 'waiting' ? (
              <span className="text-xl text-content-muted">等待手势...</span>
            ) : status === 'capturing' ? (
              <span className="text-xl text-cyan-400">检测到手势...</span>
            ) : (
              <span className="text-lg text-content-muted">{statusConfig.text}</span>
            )}
          </div>

          {/* 连续手势序列（新增） */}
          {gestureSequence.length > 0 && (
            <div className="card animate-fade-up border border-dark-600 p-4" style={{ animationDelay: '280ms' }}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-content-primary">
                  🔗 连续手势序列（{gestureSequence.length}）
                </h3>
                <button
                  onClick={() => {
                    continuousRecognizerRef.current?.clear();
                    setGestureSequence([]);
                    setCombinedText('');
                  }}
                  className="rounded-md border border-dark-600 bg-dark-800 px-2 py-1 text-xs text-content-secondary hover:bg-dark-700 hover:text-content-primary"
                >
                  清空
                </button>
              </div>
              {/* 序列气泡 */}
              <div className="mb-3 flex flex-wrap gap-2">
                {gestureSequence.map((g, i) => (
                  <span key={i} className="chip">
                    {g.chinese}
                  </span>
                ))}
              </div>
              {/* 组合文本 */}
              {combinedText && (
                <div className="rounded-lg border border-dark-600 bg-dark-900/50 p-3">
                  <p className="text-xs text-content-muted">组合识别</p>
                  <p className="text-lg font-bold text-accent-300">{combinedText}</p>
                </div>
              )}
            </div>
          )}

          {/* 降级模式提示（新增） */}
          {degradedMode && (
            <div className="animate-fade-up rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
              ⚠️ Worker 不可用，已降级到主线程识别（性能略降，功能正常）
            </div>
          )}

          {/* 置信度 */}
          {status === 'result' && result && (
            <div className="card animate-fade-up p-4" style={{ animationDelay: '320ms' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-content-secondary">置信度</span>
                <span className="text-sm font-bold text-accent-300">{confidencePercent}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-dark-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-300"
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
            </div>
          )}

          {/* 识别历史 */}
          <div className="card animate-fade-up flex-1 p-4" style={{ animationDelay: '360ms' }}>
            <h3 className="mb-3 text-sm font-semibold text-content-primary">识别历史</h3>
            {history.length === 0 ? (
              <p className="py-4 text-center text-sm text-content-muted">暂无识别记录</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-dark-600 bg-dark-900/40 px-3 py-2"
                  >
                    <span className="font-medium text-content-primary">{item.chinese}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-content-muted">
                        {new Date(item.timestamp).toLocaleTimeString('zh-CN')}
                      </span>
                      <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-xs font-medium text-accent-300">
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
