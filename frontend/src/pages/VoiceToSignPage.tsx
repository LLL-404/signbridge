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
 * 依赖模块：VoiceInput / GrammarEngine / AvatarDriver / AvatarCanvas / avatarStore
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { VoiceInput } from '@/components/voice/VoiceInput';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { grammarEngine } from '@/modules/grammar/GrammarEngine';
import { AvatarDriver } from '@/modules/avatar/AvatarDriver';
import { useAvatarStore } from '@/stores/avatarStore';
import { NEUTRAL_POSE } from '@/types/avatar';
import type { BonePose } from '@/types/avatar';
import type { GlossSequence, GlossSequenceItem } from '@/types/grammar';
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
  /** 当前虚拟人姿态（传给 Avatar3D） */
  const [currentPose, setCurrentPose] = useState<BonePose>(NEUTRAL_POSE);

  // ===== 全局状态（avatarStore） =====
  const mode = useAvatarStore((s) => s.mode);
  const playbackSpeed = useAvatarStore((s) => s.playbackSpeed);
  const isPlaying = useAvatarStore((s) => s.isPlaying);
  const setMode = useAvatarStore((s) => s.setMode);
  const setPlaybackSpeed = useAvatarStore((s) => s.setPlaybackSpeed);
  const setIsPlaying = useAvatarStore((s) => s.setIsPlaying);

  // ===== 实例与可变状态引用（不触发重渲染） =====
  const avatarDriverRef = useRef<AvatarDriver | null>(null);
  if (avatarDriverRef.current === null) {
    avatarDriverRef.current = new AvatarDriver();
  }
  /** 播放队列：等待播放的句子序列 */
  const queueRef = useRef<GlossSequence[]>([]);
  /** 播放状态引用（避免闭包陈旧） */
  const isPlayingRef = useRef(false);
  /** rAF 句柄 */
  const rafRef = useRef<number>(0);
  /** 上一帧时间戳（毫秒） */
  const lastTimeRef = useRef(0);
  /** 上一次的 pose 引用，仅在变化时 setState 以减少无谓重渲染 */
  const lastPoseRef = useRef<BonePose>(NEUTRAL_POSE);
  /** 播放下一个序列的函数引用（打破循环依赖） */
  const playNextRef = useRef<(seq: GlossSequence) => void>(() => {});

  // ===== 播放下一个序列（队列驱动：播完当前自动播下一个） =====
  playNextRef.current = (sequence: GlossSequence) => {
    const driver = avatarDriverRef.current;
    if (!driver) return;
    isPlayingRef.current = true;
    setIsPlaying(true);
    void driver.playSequence(sequence, () => {
      // 当前序列播放完成，检查队列是否有待播句子
      const next = queueRef.current.shift();
      if (next) {
        playNextRef.current(next);
      } else {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    });
  };

  // ===== 语法引擎转换 + 入队播放 =====
  const processSentence = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setConvertError(null);
    try {
      // 中文文字 → 手语词汇序列
      const sequence = await grammarEngine.convert(text);
      setGlossItems(sequence.items);
      // 流式处理：正在播放则入队，否则立即播放
      if (isPlayingRef.current) {
        queueRef.current.push(sequence);
      } else {
        playNextRef.current(sequence);
      }
    } catch (err) {
      console.error('语法转换失败:', err);
      setConvertError(err instanceof Error ? err.message : '转换失败');
    }
  }, []);

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

  // ===== 动画循环：requestAnimationFrame 驱动 AvatarDriver =====
  useEffect(() => {
    const tick = (timestamp: number) => {
      const driver = avatarDriverRef.current;
      if (driver) {
        // 计算帧间隔（毫秒），首帧 delta 为 0 避免大跳跃
        const delta = lastTimeRef.current === 0 ? 0 : timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;
        driver.update(delta);
        // 仅在 pose 引用变化时更新状态，减少无谓重渲染
        const pose = driver.getCurrentPose();
        if (pose !== lastPoseRef.current) {
          lastPoseRef.current = pose;
          setCurrentPose(pose);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      // 卸载时停止播放并释放资源
      avatarDriverRef.current?.stop();
      queueRef.current = [];
      isPlayingRef.current = false;
      lastTimeRef.current = 0;
    };
  }, []);

  // ===== 语速调节：实时同步到 AvatarDriver =====
  const handleSpeedChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const speed = parseFloat(e.target.value);
      setPlaybackSpeed(speed);
      avatarDriverRef.current?.setSpeed(speed);
    },
    [setPlaybackSpeed],
  );

  // ===== 停止播放：清空队列并重置状态 =====
  const handleStop = useCallback(() => {
    avatarDriverRef.current?.stop();
    queueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, [setIsPlaying]);

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
              <AvatarCanvas pose={currentPose} width="100%" height="100%" />
            </div>
          </div>
        </div>

        {/* 左侧：语音输入 + 识别文字 + 手语词汇序列 */}
        <div className="order-2 flex flex-col gap-3 md:gap-4 lg:order-1">
          {/* 语音输入区域 */}
          <div className="card animate-fade-up p-4 md:p-5" style={{ animationDelay: '80ms' }}>
            <VoiceInput onText={handleText} placeholder="点击麦克风开始说话" />
          </div>

          {/* 识别文字显示 */}
          <div className="card animate-fade-up p-4 md:p-5" style={{ animationDelay: '160ms' }}>
            <div className="mb-2 md:mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
              <h3 className="text-sm font-semibold text-content-primary">识别文字</h3>
            </div>
            <div className="min-h-[56px] md:min-h-[64px] rounded-lg border border-dark-600 bg-dark-900/50 p-3">
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
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
              <h3 className="text-sm font-semibold text-content-primary">手语词汇序列</h3>
            </div>
            {convertError ? (
              <p className="text-sm text-red-400">转换失败：{convertError}</p>
            ) : glossItems.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {glossItems.map((item, idx) => (
                  <span
                    key={`${item.gloss_id}-${idx}`}
                    className="chip animate-fade-up text-xs md:text-sm"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    {item.chinese}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-content-muted">尚未生成词汇序列</p>
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
            className="h-1.5 flex-1 w-24 md:w-32 cursor-pointer appearance-none rounded-full bg-dark-600 accent-accent-500"
          />
          <span className="w-10 md:w-12 text-xs md:text-sm font-bold text-accent-300">
            {playbackSpeed.toFixed(1)}x
          </span>
        </div>

        {/* 3D / 2D 模式切换 */}
        <div className="flex items-center gap-2">
          <span className="text-xs md:text-sm font-medium text-content-secondary whitespace-nowrap">模式</span>
          <div className="flex">
            <button
              type="button"
              onClick={() => setMode('3d')}
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
            className="flex-1 md:flex-none rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs md:text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⏹ 停止
          </button>
          <span className={`text-xs md:text-sm whitespace-nowrap ${isPlaying ? 'text-accent-300' : 'text-content-muted'}`}>
            {isPlaying ? '● 播放中' : '○ 就绪'}
          </span>
        </div>
      </div>
    </div>
  );
}
