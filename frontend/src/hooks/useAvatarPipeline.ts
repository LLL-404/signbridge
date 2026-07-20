// 虚拟人播放管线 Hook
// 在 useAvatarPlayer 基础上扩展：
// - 提供 VRM 加载完成回调（自动注入 VRMAnimator 到 AvatarDriver）
// - 维护外部播放队列，支持流式入队（识别一句即打一句，避免堆积）
import { useCallback, useRef } from 'react';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMAnimator } from '@/modules/avatar/VRMAnimator';
import type { GlossSequence } from '@/types/grammar';
import { useAvatarPlayer } from './useAvatarPlayer';

/** useAvatarPipeline 返回值 */
export interface UseAvatarPipelineReturn {
  /** 当前虚拟人姿态（旧 BonePose，供 2D/skeleton 模式） */
  pose: ReturnType<typeof useAvatarPlayer>['pose'];
  /** 当前 VRM 姿态（新骨骼轨道，供 VRM 模型驱动） */
  vrmPose: ReturnType<typeof useAvatarPlayer>['vrmPose'];
  /** 是否正在播放（基于内部队列与播放状态，用于 UI 显示） */
  isPlaying: boolean;
  /** 播放单个词汇动作 */
  playGloss: ReturnType<typeof useAvatarPlayer>['playGloss'];
  /** 播放词汇序列 */
  playSequence: ReturnType<typeof useAvatarPlayer>['playSequence'];
  /** 停止播放并清空待播队列 */
  stop: () => void;
  /** 设置播放速度 */
  setSpeed: (speed: number) => void;
  /** 清空待播队列（不影响正在播放的当前序列） */
  clearQueue: () => void;
  /** VRM 加载完成回调，传给 AvatarCanvas.onVRMLoaded */
  handleVRMLoaded: (vrm: VRM, animator: VRMAnimator) => void;
  /**
   * 播放入队：正在播放则入队，否则立即播放
   * 队列空时（最后一个序列播完）触发 onQueueEmpty 回调，让页面重置 UI 状态
   */
  playOrEnqueue: (sequence: GlossSequence, onQueueEmpty?: () => void) => void;
  /** 是否有等待播放的序列 */
  hasQueued: () => boolean;
}

/**
 * 虚拟人播放管线 Hook
 *
 * 适用场景：语音/文本流式输入 → 持续生成 GlossSequence → 自动排队播放
 * 不适用：单次播放场景（用 useAvatarPlayer 即可）
 */
export function useAvatarPipeline(): UseAvatarPipelineReturn {
  const player = useAvatarPlayer();

  /** 待播队列 */
  const queueRef = useRef<GlossSequence[]>([]);
  /** 是否正在播放（ref 版本，用于同步判断，避免 React state 闭包陈旧） */
  const isPlayingRef = useRef(false);
  /** 队列空时回调（最后一个序列播完时触发） */
  const onQueueEmptyRef = useRef<(() => void) | null>(null);
  /** 播放下一个序列的函数引用（打破循环依赖） */
  const playNextRef = useRef<(seq: GlossSequence) => void>(() => {});
  /** 持有最新的 player.playSequence 引用，避免闭包陈旧 */
  const playerPlaySequenceRef = useRef(player.playSequence);
  playerPlaySequenceRef.current = player.playSequence;

  // 播放下一个序列：递归消费队列，队空时触发 onQueueEmpty 回调
  playNextRef.current = (sequence: GlossSequence) => {
    isPlayingRef.current = true;
    void playerPlaySequenceRef.current(sequence, () => {
      const next = queueRef.current.shift();
      if (next) {
        playNextRef.current(next);
      } else {
        // 队列已空：重置状态并通知页面
        isPlayingRef.current = false;
        const cb = onQueueEmptyRef.current;
        onQueueEmptyRef.current = null;
        cb?.();
      }
    });
  };

  /** 播放入队：正在播放则入队，否则立即播放 */
  const playOrEnqueue = useCallback(
    (sequence: GlossSequence, onQueueEmpty?: () => void): void => {
      // 仅在队列为空时设置新的 onQueueEmpty 回调
      // （若队列已有内容，沿用上一次的回调；避免覆盖正在进行的播放流程）
      if (!isPlayingRef.current && queueRef.current.length === 0) {
        onQueueEmptyRef.current = onQueueEmpty ?? null;
      }
      if (isPlayingRef.current) {
        queueRef.current.push(sequence);
        return;
      }
      playNextRef.current(sequence);
    },
    [],
  );

  /** VRM 加载完成回调：注入 AvatarDriver */
  const handleVRMLoaded = useCallback(
    (vrm: VRM, animator: VRMAnimator): void => {
      player.setVRMAnimator(vrm, animator);
    },
    [player.setVRMAnimator],
  );

  /** 停止播放并清空队列 */
  const stop = useCallback((): void => {
    queueRef.current = [];
    isPlayingRef.current = false;
    onQueueEmptyRef.current = null;
    player.stop();
  }, [player.stop]);

  /** 清空待播队列（不影响正在播放的当前序列） */
  const clearQueue = useCallback((): void => {
    queueRef.current = [];
  }, []);

  /** 是否有等待播放的序列 */
  const hasQueued = useCallback((): boolean => queueRef.current.length > 0, []);

  return {
    pose: player.pose,
    vrmPose: player.vrmPose,
    isPlaying: player.isPlaying,
    playGloss: player.playGloss,
    playSequence: player.playSequence,
    stop,
    setSpeed: player.setSpeed,
    clearQueue,
    handleVRMLoaded,
    playOrEnqueue,
    hasQueued,
  };
}
