// 统一骨骼控制接口（3D 和 2D 共用）
import type { BonePose, HandPose, AvatarMode } from '@/types/avatar';

/** 骨骼控制器抽象接口 */
export interface BoneController {
  /** 应用完整姿态 */
  applyPose(pose: BonePose): void;
  /** 应用手部姿态 */
  applyHandPose(hand: 'left' | 'right', pose: HandPose): void;
  /** 获取当前姿态 */
  getPose(): BonePose;
  /** 重置到中性姿态 */
  resetToNeutral(): void;
  /** 设置渲染模式 */
  setMode(mode: AvatarMode): void;
}

// 向后兼容别名（过渡期使用，新代码请直接使用 BoneController）
export type IBoneController = BoneController;
