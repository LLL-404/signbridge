// 虚拟人动作播放 Hook
// 封装 AvatarDriver 的初始化、rAF 更新循环与姿态状态管理
// 供学习模块各子组件复用，避免重复编写驱动逻辑
import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarDriver } from '@/modules/avatar/AvatarDriver';
import type { BonePose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import type { GlossSequence } from '@/types/grammar';

/** useAvatarPlayer 返回值 */
export interface UseAvatarPlayerReturn {
  /** 当前虚拟人姿态 */
  pose: BonePose;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 播放单个词汇动作 */
  playGloss: (glossId: string, onComplete?: () => void) => Promise<void>;
  /** 播放词汇序列 */
  playSequence: (sequence: GlossSequence, onComplete?: () => void) => Promise<void>;
  /** 停止播放 */
  stop: () => void;
}

/**
 * 虚拟人动作播放 Hook
 * - 创建 AvatarDriver 实例并管理生命周期
 * - 通过 requestAnimationFrame 循环驱动 update，同步姿态到 state
 * - 组件卸载时自动停止播放并清理 rAF
 */
export function useAvatarPlayer(): UseAvatarPlayerReturn {
  const driverRef = useRef<AvatarDriver>(new AvatarDriver());
  const [pose, setPose] = useState<BonePose>(NEUTRAL_POSE);
  const [isPlaying, setIsPlaying] = useState(false);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  // 标记组件是否已卸载，避免卸载后 setState
  const mountedRef = useRef(true);

  // rAF 循环：每帧驱动 AvatarDriver 更新并同步姿态
  useEffect(() => {
    mountedRef.current = true;
    const loop = (): void => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const driver = driverRef.current;
      driver.update(delta);
      // 仅在组件存活时更新状态
      if (mountedRef.current) {
        setPose(driver.getCurrentPose());
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      driverRef.current.stop();
    };
  }, []);

  /** 播放词汇序列 */
  const playSequence = useCallback(async (sequence: GlossSequence, onComplete?: () => void): Promise<void> => {
    setIsPlaying(true);
    const driver = driverRef.current;
    await driver.playSequence(sequence, () => {
      if (mountedRef.current) setIsPlaying(false);
      onComplete?.();
    });
    if (mountedRef.current) setIsPlaying(false);
  }, []);

  /** 播放单个词汇（基于 playSequence 封装） */
  const playGloss = useCallback(async (glossId: string, onComplete?: () => void): Promise<void> => {
    const sequence: GlossSequence = {
      items: [{ gloss_id: glossId, chinese: '' }],
    };
    await playSequence(sequence, onComplete);
  }, [playSequence]);

  /** 停止播放 */
  const stop = useCallback((): void => {
    driverRef.current.stop();
    if (mountedRef.current) setIsPlaying(false);
  }, []);

  return { pose, isPlaying, playGloss, playSequence, stop };
}
