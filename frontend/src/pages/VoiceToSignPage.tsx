/**
 * @file VoiceToSignPage.tsx
 * @description 语音转手语页面 —— 反向链路入口
 *
 * 数据流（完整管道）：
 *   麦克风音频 → Web Speech API 识别 → 中文文字
 *              → GrammarEngine（FMM 分词 + 词典映射）→ GlossSequence 手语词汇序列
 *              → AvatarDriver → BoneController/IKSolver → 3D/2D 虚拟人打手语
 *
 * 关键特性：
 *   - 流式处理：识别一句即打一句，通过队列管理避免堆积
 *   - 语速调节：0.5x ~ 2.0x，影响 AvatarDriver 播放速率
 *   - 模式切换：3D（Three.js 骨骼动画）/ 2D（Canvas 序列帧）
 *   - 中间结果实时显示，最终结果累积保存
 *
 * 依赖：useGrammarEngine / useAvatarPipeline / AvatarCanvas / avatarStore
 *       底层 modules（GrammarEngine、AvatarDriver）通过 hooks 间接访问
 */

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { VoiceInput } from '@/components/voice/VoiceInput';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { useGrammarEngine } from '@/hooks/useGrammarEngine';
import { useAvatarPipeline } from '@/hooks/useAvatarPipeline';
import { useAvatarStore } from '@/stores/avatarStore';
import type { GlossSequenceItem } from '@/types/grammar';
import { PageHeader } from '@/components/common/PageHeader';

/** 语速范围与步进 */
const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;
const SPEED_STEP = 0.1;

/**
 * 语音转手语页面
 * 完整管道：语音识别 → 中文文字 → 语法引擎转换 → 手语词汇序列 → 虚拟人打手语
 * 支持流式处理（识别一句即打一句，队列管理）、语速调节、3D/2D 模式切换。
 */
export function VoiceToSignPage() {
  // ===== 识别与转换状态 =====
  /** 中间识别结果（实时显示） */
  const [interimText, setInterimText] = useState('');
  /** 累积的最终识别文字 */
  const [finalText, setFinalText] = useState('');
  /** 当前句子的手语词汇序列 */
  const [glossItems, setGlossItems] = useState<GlossSequenceItem[]>([]);
  /** 转换错误信息 */
  const [convertError, setConvertError] = useState<string | null>(null);
  /** 未匹配到手语词汇的中文词 */
  const [unmatchedWords, setUnmatchedWords] = useState<string[]>([]);
  /** 文本输入框内容（手动输入中文文字） */
  const [textInput, setTextInput] = useState('');
  /** 管道状态：idle 空闲 / loading 加载数据 / converting 转换中 / playing 播放中 / error 错误 */
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'loading' | 'converting' | 'playing' | 'error'>('idle');

  // ===== 全局状态（avatarStore） =====
  const mode = useAvatarStore((s) => s.mode);
  const playbackSpeed = useAvatarStore((s) => s.playbackSpeed);
  const isPlaying = useAvatarStore((s) => s.isPlaying);
  const setMode = useAvatarStore((s) => s.setMode);
  const setPlaybackSpeed = useAvatarStore((s) => s.setPlaybackSpeed);
  const setIsPlaying = useAvatarStore((s) => s.setIsPlaying);

  // ===== Hooks：语法引擎 + 虚拟人播放管线（封装 modules 访问） =====
  const { convert } = useGrammarEngine();
  const {
    pose: currentPose,
    vrmPose: currentVRMPose,
    playOrEnqueue,
    handleVRMLoaded,
    setSpeed,
    stop: stopPipeline,
    isPlaying: pipelinePlaying,
  } = useAvatarPipeline();

  // 同步 pipeline 播放状态到 avatarStore（供全局 UI 使用）
  useEffect(() => {
    setIsPlaying(pipelinePlaying);
  }, [pipelinePlaying, setIsPlaying]);

  // ===== 语法引擎转换 + 入队播放 =====
  const processSentence = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setConvertError(null);
    // 进入转换阶段
    setPipelineStatus('converting');
    try {
      // 中文文字 → 手语词汇序列
      const sequence = await convert(text);
      setGlossItems(sequence.items);
      setUnmatchedWords(sequence.unmatched_words ?? []);
      if (sequence.items.length === 0) {
        setConvertError('未识别到任何手语词汇');
        // 无可播放内容：直接进入错误态（需用户重新输入）
        setPipelineStatus('error');
        return;
      }
      // 流式处理：playOrEnqueue 内部判断入队或立即播放
      // 队列空时（最后一个序列播完）触发 onQueueEmpty 回调，回到 idle
      playOrEnqueue(sequence, () => {
        setPipelineStatus('idle');
      });
      // 进入播放阶段（无论立即播放还是入队，UI 都显示"播放中"）
      setPipelineStatus('playing');
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : '转换失败');
      setPipelineStatus('error');
    }
  }, [convert, playOrEnqueue]);

  // ===== 处理语音识别文本 =====
  const handleText = useCallback(
    (text: string, isFinal: boolean) => {
      if (!isFinal) {
        // 中间结果：实时显示
        setInterimText(text);
        return;
      }
      // 最终结果：清空中间结果，累积最终文字，立即送入语法引擎
      setInterimText('');
      setFinalText((prev) => (prev ? prev + text : text));
      void processSentence(text);
    },
    [processSentence],
  );

  // ===== 处理文本输入提交（手动输入中文文字 → 语法引擎 → 虚拟人播放） =====
  const handleTextInput = useCallback(() => {
    const text = textInput.trim();
    // 空文本不触发
    if (!text) return;
    void processSentence(text);
    // 提交后清空输入框
    setTextInput('');
  }, [textInput, processSentence]);

  // ===== 输入框按键事件：回车提交 =====
  const handleTextKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleTextInput();
      }
    },
    [handleTextInput],
  );

  // ===== 语速调节：实时同步到 AvatarDriver =====
  const handleSpeedChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const speed = parseFloat(e.target.value);
      setPlaybackSpeed(speed);
      setSpeed(speed);
    },
    [setPlaybackSpeed, setSpeed],
  );

  // ===== 停止播放：清空队列并重置状态 =====
  const handleStop = useCallback(() => {
    stopPipeline();
    setIsPlaying(false);
    // 手动停止：管道回到空闲
    setPipelineStatus('idle');
  }, [stopPipeline, setIsPlaying]);

  // 组件卸载时停止播放并清理队列
  useEffect(() => {
    return () => {
      stopPipeline();
    };
  }, [stopPipeline]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="语音转手语"
        subtitle="说出中文，虚拟人将用手语为你重述"
        icon="🗣️"
      />

      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        {/* 虚拟人展示（移动端优先显示在上方） */}
        <div className="order-1 flex items-start justify-center lg:order-2">
          <div className="card animate-fade-up w-full overflow-hidden p-2 md:p-3" style={{ animationDelay: '120ms' }}>
            <div className="aspect-[4/5] w-full">
              <AvatarCanvas pose={currentPose} vrmPose={currentVRMPose} width="100%" height="100%" onVRMLoaded={handleVRMLoaded} />
            </div>
          </div>
        </div>

        {/* 左侧：语音输入 + 识别文字 + 手语词汇序列 */}
        <div className="order-2 flex flex-col gap-3 md:gap-4 lg:order-1">
          {/* 语音输入区域 */}
          <div className="card animate-fade-up p-4 md:p-5" style={{ animationDelay: '80ms' }}>
            <VoiceInput onText={handleText} placeholder="点击麦克风开始说话" />
          </div>

          {/* 文本输入区域（手动输入中文文字 → 播放手语） */}
          <div className="card animate-fade-up p-4 md:p-5" style={{ animationDelay: '120ms' }}>
            <div className="mb-2 md:mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-content-primary">文本输入</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleTextKeyDown}
                disabled={isPlaying}
                placeholder="输入中文文字，按回车播放手语"
                aria-label="中文文字输入框，按回车键播放对应手语"
                className="flex-1 rounded-lg border border-dark-600 bg-dark-900/50 px-3 py-2 text-sm md:text-base text-content-primary placeholder:text-content-muted focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              />
              <button
                type="button"
                onClick={handleTextInput}
                disabled={isPlaying}
                aria-label="播放输入文字对应的手语动作"
                className="shrink-0 rounded-lg bg-accent-500 px-4 py-2 text-xs md:text-sm font-medium text-white transition-all hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                播放手语
              </button>
            </div>
            {/* 管道状态指示器：role="status" + aria-live 让屏幕阅读器实时朗读状态变化 */}
            {pipelineStatus !== 'idle' && (
              <div className="mt-2 flex items-center gap-2" role="status" aria-live="polite">
                <span className={`h-2 w-2 rounded-full ${
                  pipelineStatus === 'converting' ? 'bg-yellow-400 animate-pulse' :
                  pipelineStatus === 'playing' ? 'bg-green-400 animate-pulse' :
                  pipelineStatus === 'error' ? 'bg-red-400' :
                  'bg-blue-400 animate-pulse'
                }`} aria-hidden="true" />
                <span className="text-xs text-content-secondary">
                  {pipelineStatus === 'loading' ? '加载数据中...' :
                   pipelineStatus === 'converting' ? '转换中...' :
                   pipelineStatus === 'playing' ? '播放中...' :
                   pipelineStatus === 'error' ? (convertError ?? '错误') : ''}
                </span>
              </div>
            )}
          </div>

          {/* 识别文字显示 */}
          <div className="card animate-fade-up p-4 md:p-5" style={{ animationDelay: '160ms' }}>
            <div className="mb-2 md:mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-content-primary">识别文字</h3>
            </div>
            <div className="min-h-[56px] md:min-h-[64px] rounded-lg border border-dark-600 bg-dark-900/50 p-3" aria-live="polite">
              {finalText || interimText ? (
                <p className="text-sm md:text-base text-content-primary">
                  {finalText}
                  <span className="text-content-tertiary">{interimText}</span>
                </p>
              ) : (
                <span className="text-sm text-content-muted">等待语音输入...</span>
              )}
            </div>
          </div>

          {/* 手语词汇序列（语法引擎转换结果） */}
          <div className="card animate-fade-up p-4 md:p-5" style={{ animationDelay: '240ms' }}>
            <div className="mb-2 md:mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-content-primary">手语词汇序列</h3>
            </div>
            {convertError ? (
              <p className="text-sm text-red-400" role="alert">转换失败：{convertError}</p>
            ) : glossItems.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="手语词汇序列">
                {glossItems.map((item, idx) => (
                  <li
                    key={`${item.gloss_id}-${idx}`}
                    className="chip animate-fade-up text-xs md:text-sm"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    {item.chinese}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-content-muted">尚未生成词汇序列</p>
            )}
            {unmatchedWords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-xs text-content-muted">未识别：</span>
                {unmatchedWords.map((word, idx) => (
                  <span key={`unmatched-${idx}`} className="text-xs text-red-400/70 line-through">
                    {word}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部控制栏：语速滑块 + 3D/2D 切换 + 播放/停止 */}
      <div className="card animate-fade-up flex flex-col gap-4 p-4 md:p-5 md:flex-row md:flex-wrap md:items-center md:gap-6" style={{ animationDelay: '320ms' }}>
        {/* 语速滑块 */}
        <div className="flex items-center gap-3">
          <label htmlFor="speed-slider" className="text-xs md:text-sm font-medium text-content-secondary whitespace-nowrap">
            语速
          </label>
          <input
            id="speed-slider"
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={SPEED_STEP}
            value={playbackSpeed}
            onChange={handleSpeedChange}
            aria-label="语速调节"
            aria-valuemin={MIN_SPEED}
            aria-valuemax={MAX_SPEED}
            aria-valuenow={playbackSpeed}
            className="h-1.5 flex-1 w-24 md:w-32 cursor-pointer appearance-none rounded-full bg-dark-600 accent-accent-500"
          />
          <span className="w-10 md:w-12 text-xs md:text-sm font-bold text-accent-300" aria-hidden="true">
            {playbackSpeed.toFixed(1)}x
          </span>
        </div>

        {/* 3D / 2D 模式切换：使用 role="group" + aria-label 标识按钮组 */}
        <div className="flex items-center gap-2" role="group" aria-label="虚拟人模式切换">
          <span className="text-xs md:text-sm font-medium text-content-secondary whitespace-nowrap" aria-hidden="true">模式</span>
          <div className="flex">
            <button
              type="button"
              onClick={() => setMode('3d')}
              aria-pressed={mode === '3d' ? 'true' : 'false'}
              aria-label="使用 3D 虚拟人模式"
              className={`rounded-l-lg px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-all ${
                mode === '3d'
                  ? 'bg-accent-500 text-white'
                  : 'border border-dark-600 border-r-0 bg-dark-800 text-content-secondary hover:text-content-primary'
              }`}
            >
              3D
            </button>
            <button
              type="button"
              onClick={() => setMode('2d')}
              aria-pressed={mode === '2d' ? 'true' : 'false'}
              aria-label="使用 2D 虚拟人模式"
              className={`rounded-r-lg px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-all ${
                mode === '2d'
                  ? 'bg-accent-500 text-white'
                  : 'border border-dark-600 bg-dark-800 text-content-secondary hover:text-content-primary'
              }`}
            >
              2D
            </button>
          </div>
        </div>

        {/* 播放 / 停止 */}
        <div className="flex items-center gap-3 md:ml-auto">
          <button
            type="button"
            onClick={handleStop}
            disabled={!isPlaying}
            aria-label="停止手语播放"
            className="flex-1 md:flex-none rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs md:text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⏹ 停止
          </button>
          <span className={`text-xs md:text-sm whitespace-nowrap ${isPlaying ? 'text-accent-300' : 'text-content-muted'}`} role="status" aria-live="polite">
            {isPlaying ? '● 播放中' : '○ 就绪'}
          </span>
        </div>
      </div>
    </div>
  );
}
