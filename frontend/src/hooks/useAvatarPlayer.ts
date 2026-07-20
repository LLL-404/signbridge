// 虚拟人动作播放 Hook
// 封装 AvatarDriver 的初始化、rAF 更新循环与姿态状态管理
// 供学习模块各子组件复用，避免重复编写驱动逻辑
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VRM } from '@pixiv/three-vrm';
import { AvatarDriver } from '@/modules/avatar/AvatarDriver';
import type { VRMAnimator } from '@/modules/avatar/VRMAnimator';
import type { BonePose, VRMPose } from '@/types/avatar';
import { NEUTRAL_POSE, NEUTRAL_VRM_POSE } from '@/types/avatar';
import type { GlossSequence } from '@/types/grammar';
import { logger } from '@/modules/debug/logger';

const log = logger.module('useAvatarPlayer');

/** useAvatarPlayer 返回值 */
export interface UseAvatarPlayerReturn {
  /** 当前虚拟人姿态（旧 BonePose，供 2D/skeleton 模式） */
  pose: BonePose;
  /** 当前 VRM 姿态（新骨骼轨道，供 VRM 模型驱动） */
  vrmPose: VRMPose;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 播放单个词汇动作 */
  playGloss: (glossId: string, onComplete?: () => void) => Promise<void>;
  /** 播放词汇序列 */
  playSequence: (sequence: GlossSequence, onComplete?: () => void) => Promise<void>;
  /** 停止播放 */
  stop: () => void;
  /** 注入 VRMAnimator 与 VRM 实例（VRM 加载完成后调用，让 AvatarDriver 能驱动 VRM 动画） */
  setVRMAnimator: (vrm: VRM, animator: VRMAnimator) => void;
  /** 设置播放速度 */
  setSpeed: (speed: number) => void;
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
  const [vrmPose, setVrmPose] = useState<VRMPose>(NEUTRAL_VRM_POSE);
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
        setVrmPose(driver.getCurrentVRMPose());
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
      unmatched_words: [],
    };
    await playSequence(sequence, onComplete);
  }, [playSequence]);

  /** 停止播放 */
  const stop = useCallback((): void => {
    driverRef.current.stop();
    if (mountedRef.current) setIsPlaying(false);
  }, []);

  /** 注入 VRMAnimator 与 VRM 实例 */
  const setVRMAnimator = useCallback((vrm: VRM, animator: VRMAnimator): void => {
    driverRef.current.setVRMAnimator(vrm, animator);
    log.info('VRM 已加载并绑定到 AvatarDriver');
  }, []);

  /** 设置播放速度 */
  const setSpeed = useCallback((speed: number): void => {
    driverRef.current.setSpeed(speed);
  }, []);

  return { pose, vrmPose, isPlaying, playGloss, playSequence, stop, setVRMAnimator, setSpeed };
}
