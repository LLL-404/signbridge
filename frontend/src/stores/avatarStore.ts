// 虚拟人状态管理 Store
import { create } from 'zustand';
import type { AvatarMode, BonePose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';

interface AvatarStore {
  /** 渲染模式 */
  mode: AvatarMode;
  /** 当前姿态 */
  currentPose: BonePose;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 播放速度 */
  playbackSpeed: number;
  /** 设置渲染模式 */
  setMode: (mode: AvatarMode) => void;
  /** 设置当前姿态 */
  setPose: (pose: BonePose) => void;
  /** 设置播放状态 */
  setIsPlaying: (playing: boolean) => void;
  /** 设置播放速度 */
  setPlaybackSpeed: (speed: number) => void;
}

export const useAvatarStore = create<AvatarStore>((set) => ({
  mode: '3d',
  currentPose: NEUTRAL_POSE,
  isPlaying: false,
  playbackSpeed: 1.0,
  setMode: (mode) => set({ mode }),
  setPose: (currentPose) => set({ currentPose }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
}));
