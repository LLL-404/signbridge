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
  const [isPlaying, setIsPlaying] = useState(false);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  // 标记组件是否已卸载，避免卸载后 setState
  const mountedRef = useRef(true);
  // pose 节流：rAF 仍以 60fps 驱动 AvatarDriver.update，但 setPose 节流到 ~30fps，
  // 避免每帧触发整条 React 组件树重渲染。
  // VRM 动画由 useVRMModel 内部 useFrame 自驱（vrmAnimator.update），不依赖此 state；
  // Avatar2D / SkeletonAvatarModel 通过 useEffect([pose]) 重绘，30fps 对手语动作足够流畅。
  const lastPoseUpdateRef = useRef<number>(0);
  const POSE_UPDATE_INTERVAL_MS = 33; // ≈30fps

  // rAF 循环：每帧驱动 AvatarDriver 更新，节流同步姿态到 state
  useEffect(() => {
    mountedRef.current = true;
    // 将 ref.current 复制到局部变量，cleanup 中使用局部变量避免 ref 已变化
    const driver = driverRef.current;
    const loop = (): void => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      // driver.update 始终以 60fps 推进，保证 VRM 动画与穿模检测时序正确
      driver.update(delta);
      // setPose 节流到 ~30fps：减少 React 重渲染频率
      if (mountedRef.current && now - lastPoseUpdateRef.current >= POSE_UPDATE_INTERVAL_MS) {
        lastPoseUpdateRef.current = now;
        setPose(driver.getCurrentPose());
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      driver.stop();
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

  // vrmPose 直接返回常量：新架构下 VRM 动画由 VRMAnimator 内部 AnimationMixer 驱动，
  // AvatarDriver.getCurrentVRMPose() 也仅返回 NEUTRAL_VRM_POSE，无需 state 化（避免无用 setState 调用）。
  // 保留字段以维持 UseAvatarPlayerReturn 接口兼容，调用方无需改动。
  return { pose, vrmPose: NEUTRAL_VRM_POSE, isPlaying, playGloss, playSequence, stop, setVRMAnimator, setSpeed };
}
