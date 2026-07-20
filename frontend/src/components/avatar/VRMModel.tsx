/**
 * VRM 虚拟人 3D 渲染组件
 *
 * 仅负责 JSX 渲染，VRM 加载/约束计算/实时驱动/PoseEstimator 访问
 * 全部下沉到 useVRMModel Hook，本组件不再直接依赖 modules/avatar 与
 * modules/recognition。
 */
import type { BonePose, VRMPose } from '@/types/avatar';
import type { UseVRMModelOptions } from '@/hooks/useVRMModel';
import { useVRMModel } from '@/hooks/useVRMModel';

/** VRMModel Props */
export interface VRMModelProps extends UseVRMModelOptions {
  /** 当前姿态（旧 BonePose，保留 prop 兼容调用方，新架构不再使用） */
  pose: BonePose;
  /** VRM 标准姿态（保留 prop 兼容调用方，新架构不再使用） */
  vrmPose?: VRMPose;
}

/** VRM 虚拟人模型组件 */
export function VRMModel({
  pose: _pose,
  vrmPose: _vrmPose,
  modelUrl,
  lookAtTarget,
  onLoaded,
  onLoadError,
  useRealtimeTracking,
  realtimePoseEstimate,
}: VRMModelProps) {
  // VRM 加载、约束计算、实时驱动、PoseEstimator 访问全部在 Hook 中完成
  // 组件仅需 groupRef 用于挂载 VRM scene
  const { groupRef } = useVRMModel({
    modelUrl,
    lookAtTarget,
    onLoaded,
    onLoadError,
    useRealtimeTracking,
    realtimePoseEstimate,
  });

  return <group ref={groupRef} />;
}
