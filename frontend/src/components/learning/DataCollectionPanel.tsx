import { useCallback, useEffect, useRef, useState } from 'react';
import { useHandTracking } from '@/hooks/useHandTracking';
import { dataCollector, type RecordingState, type RecordingStats } from '@/modules/data/DataCollector';
import { vocabularyStore } from '@/modules/data/VocabularyStore';
import type { SignGloss } from '@/types/sign';

const STATUS_LABELS: Record<RecordingState, string> = {
  idle: '空闲 — 请选择词汇后开始采集',
  waiting: '等待手势开始...',
  recording: '录制中',
  stopping: '录制结束中...',
  reviewing: '录制完成，请确认标注',
};

const STATUS_COLORS: Record<RecordingState, string> = {
  idle: 'text-content-tertiary',
  waiting: 'text-accent-400 animate-pulse',
  recording: 'text-red-400',
  stopping: 'text-amber-400',
  reviewing: 'text-cyan-400',
};

export function DataCollectionPanel() {
  const [glossary, setGlossary] = useState<SignGloss[]>([]);
  const [selectedGlossId, setSelectedGlossId] = useState<string>('');
  const [selectedGloss, setSelectedGloss] = useState<SignGloss | null>(null);
  const [state, setState] = useState<RecordingState>('idle');
  const [stats, setStats] = useState<RecordingStats>({
    recordedFrames: 0,
    elapsedMs: 0,
    motionDetected: false,
    qualityScore: 0,
  });
  const [datasetStats, setDatasetStats] = useState({ totalSamples: 0, totalGlosses: 0, avgQuality: 0 });
  const [dominantHand, setDominantHand] = useState<'left' | 'right'>('right');
  const [autoMode, setAutoMode] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const {
    videoRef,
    canvasRef,
    isTracking,
    keypoints,
    error: trackError,
    start: startTracking,
    stop: stopTracking,
  } = useHandTracking({ width: 320, height: 240, mirror: true });

  useEffect(() => {
    vocabularyStore.getAll().then((words) => setGlossary(words));
    refreshDatasetStats();
    return () => { stopTracking(); runningRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isTracking) return;
    runningRef.current = true;
    const loop = () => {
      if (!runningRef.current) return;
      if (keypoints) {
        if (autoMode) {
          const newStats = dataCollector.feedFrame({ ...keypoints, timestamp: performance.now() });
          if (newStats) setStats(newStats);
          const newState = dataCollector.getState();
          if (newState !== state) setState(newState);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isTracking, keypoints, autoMode, state]);

  const refreshDatasetStats = async () => {
    const s = await dataCollector.getDatasetStats();
    setDatasetStats(s);
  };

  const handleSelectGloss = (gloss_id: string) => {
    setSelectedGlossId(gloss_id);
    const g = glossary.find((w) => w.gloss_id === gloss_id);
    setSelectedGloss(g ?? null);
  };

  const handleStart = useCallback(async () => {
    if (!selectedGloss) {
      setMessage('请先选择一个词汇');
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (!isTracking) {
      await startTracking();
    }
    dataCollector.setConfig({ autoDetectMotion: autoMode });
    if (!autoMode) {
      dataCollector.startRecording();
      setState('recording');
      setStats(dataCollector.getStats());
    } else {
      dataCollector.reset();
      setState('waiting');
    }
    setMessage(null);
  }, [selectedGloss, isTracking, autoMode, startTracking]);

  const handleStop = useCallback(() => {
    const frames = dataCollector.stopRecording();
    if (!frames) {
      setMessage('录制帧数不足，请重试');
      setTimeout(() => setMessage(null), 2000);
      dataCollector.reset();
      setState('idle');
      return;
    }
    setState('reviewing');
    setStats(dataCollector.getStats());
  }, []);

  const handleSave = async () => {
    if (!selectedGloss) return;
    try {
      await dataCollector.saveSample(selectedGloss.gloss_id, selectedGloss.chinese, dominantHand);
      setMessage(`已保存: ${selectedGloss.chinese}`);
      setState('idle');
      dataCollector.reset();
      refreshDatasetStats();
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDiscard = () => {
    dataCollector.discardSample();
    setState('idle');
    setMessage('已丢弃');
    setTimeout(() => setMessage(null), 1500);
  };

  const qualityPercent = Math.round(stats.qualityScore * 100);
  const qualityColor = qualityPercent >= 70 ? 'text-green-400' : qualityPercent >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* 左侧：摄像头 + 录制控制 */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-content-secondary mb-2">摄像头预览</h3>
          <div className="relative rounded-lg overflow-hidden bg-dark-900 aspect-[4/3]">
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
            {!isTracking && (
              <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80">
                <button onClick={handleStart} className="btn-primary px-6 py-2">
                  开始采集
                </button>
              </div>
            )}
            {state === 'recording' && (
              <div className="absolute top-2 right-2 flex items-center gap-2 bg-red-500/90 text-white text-xs px-2 py-1 rounded-full">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                REC {Math.round(stats.elapsedMs / 1000)}s
              </div>
            )}
          </div>
          {trackError && (
            <p className="text-red-400 text-xs mt-2">{trackError}</p>
          )}
        </div>

        {/* 状态与控制 */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${STATUS_COLORS[state]}`}>
              {STATUS_LABELS[state]}
            </span>
            <label className="flex items-center gap-2 text-xs text-content-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                disabled={state === 'recording'}
                className="accent-accent-500"
              />
              自动检测
            </label>
          </div>

          {isTracking && state !== 'reviewing' && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-dark-800 rounded p-2">
                <div className="text-content-muted">帧数</div>
                <div className="text-content-primary font-mono text-lg">{stats.recordedFrames}</div>
              </div>
              <div className="bg-dark-800 rounded p-2">
                <div className="text-content-muted">时长</div>
                <div className="text-content-primary font-mono text-lg">{(stats.elapsedMs / 1000).toFixed(1)}s</div>
              </div>
              <div className="bg-dark-800 rounded p-2">
                <div className="text-content-muted">质量</div>
                <div className={`font-mono text-lg ${qualityColor}`}>{qualityPercent}%</div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {state === 'recording' && !autoMode && (
              <button onClick={handleStop} className="btn-secondary flex-1 py-2">
                停止录制
              </button>
            )}
            {state === 'reviewing' && (
              <>
                <button onClick={handleSave} className="btn-primary flex-1 py-2">
                  ✓ 保存标注
                </button>
                <button onClick={handleDiscard} className="btn-ghost py-2 px-4">
                  丢弃
                </button>
              </>
            )}
            {state === 'idle' && isTracking && (
              <button onClick={handleStart} className="btn-primary flex-1 py-2">
                {autoMode ? '挥动手势开始' : '手动开始录制'}
              </button>
            )}
            {(state === 'waiting' || state === 'idle') && isTracking && (
              <button onClick={() => { stopTracking(); dataCollector.reset(); setState('idle'); }} className="btn-ghost py-2 px-3 text-xs">
                停止摄像头
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-content-muted">
            <span>主导手:</span>
            {(['left', 'right'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setDominantHand(h)}
                className={`px-2 py-0.5 rounded text-xs ${dominantHand === h ? 'bg-accent-500 text-white' : 'bg-dark-800 text-content-secondary'}`}
              >
                {h === 'left' ? '左手' : '右手'}
              </button>
            ))}
          </div>

          {message && (
            <p className="text-accent-400 text-xs text-center animate-fade-in">{message}</p>
          )}
        </div>

        {/* 数据集统计 */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-content-secondary mb-2">数据集统计</h3>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-dark-800 rounded p-2">
              <div className="text-content-muted">总样本</div>
              <div className="text-accent-400 font-mono text-lg">{datasetStats.totalSamples}</div>
            </div>
            <div className="bg-dark-800 rounded p-2">
              <div className="text-content-muted">词汇数</div>
              <div className="text-cyan-400 font-mono text-lg">{datasetStats.totalGlosses}</div>
            </div>
            <div className="bg-dark-800 rounded p-2">
              <div className="text-content-muted">平均质量</div>
              <div className="text-green-400 font-mono text-lg">{Math.round(datasetStats.avgQuality * 100)}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：词汇选择 */}
      <div className="lg:w-80 card p-4 flex flex-col">
        <h3 className="text-sm font-semibold text-content-secondary mb-2">选择采集词汇</h3>
        {selectedGloss && (
          <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg p-3 mb-3">
            <div className="text-lg font-semibold text-accent-400">{selectedGloss.chinese}</div>
            <div className="text-xs text-content-muted">{selectedGloss.category} · {'★'.repeat(selectedGloss.difficulty)}</div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-1 max-h-96 lg:max-h-none custom-scrollbar">
          {glossary.slice(0, 200).map((g) => (
            <button
              key={g.gloss_id}
              onClick={() => handleSelectGloss(g.gloss_id)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                selectedGlossId === g.gloss_id
                  ? 'bg-accent-500/20 text-accent-400 border border-accent-500/40'
                  : 'hover:bg-dark-800 text-content-secondary border border-transparent'
              }`}
            >
              <span className="font-medium">{g.chinese}</span>
              <span className="text-xs text-content-muted ml-2">{g.category}</span>
            </button>
          ))}
          {glossary.length > 200 && (
            <p className="text-xs text-content-muted text-center py-2">... 共 {glossary.length} 个词汇</p>
          )}
        </div>
      </div>
    </div>
  );
}
