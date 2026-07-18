/**
 * VRM 虚拟人 3D 渲染组件
 *
 * 使用 drei useGLTF + VRMLoaderPlugin 加载标准 VRM 模型。
 *
 * 新架构下 VRM 动画由 VRMAnimator（封装 THREE.AnimationMixer）驱动：
 *   - AvatarDriver 调用 ClipBuilder.buildClip(gloss, vrm) 生成 AnimationClip
 *   - AvatarDriver 调用 vrmAnimator.playClip(clip, fadeIn) 播放
 *   - VRMModel 的 useFrame 只调用 vrmAnimator.update(delta) + vrm.update(delta)
 *
 * 保留：
 *   - VRM 加载逻辑（VRMLoaderPlugin）
 *   - 实时姿态追踪路径（RealtimePoseDriver）
 *   - lookAt 注视跟踪
 *
 * 移除（被 AnimationMixer 替代）：
 *   - applyVRMPose / applyLimbIK 手动骨骼操作
 *   - BoneSmoother 平滑
 *   - Retargeter T-pose 校正
 *   - IK 调试可视化
 *   - 手指/表情/头部运动手动驱动
 */
import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VRMHumanBoneName, type VRM } from '@pixiv/three-vrm';
import { VRMAnimator } from '@/modules/avatar/VRMAnimator';
import { VRMAdapter } from '@/modules/avatar/VRMAdapter';
import { RealtimePoseDriver } from '@/modules/avatar/RealtimePoseDriver';
import { extractVRMCConstraints, setVRMConstraintCache } from '@/modules/avatar/JointLimits';
import { loadVRM } from '@/modules/avatar/VRMCache';
import type { PoseEstimate } from '@/modules/recognition/PoseEstimator';
import type { BonePose, VRMPose } from '@/types/avatar';
import { logger } from '@/modules/debug/logger';

const log = logger.module('VRMModel');

/**
 * 设置 VRM 上肢自然下垂姿态，覆盖默认绑定姿态（T-pose 双臂平举）。
 * 必须使用 getNormalizedBoneNode 获取骨骼，否则 vrm.update() 会覆盖手动设置的旋转。
 * 旋转值为保守初始值，实际角度需要在浏览器中根据模型坐标系微调。
 */
function setNeutralPose(vrm: VRM, logFlag = false): void {
  // 上臂：自然下垂（X -1.2 ≈ -69°，接近人手自然下垂角度）+ 贴向身体（Z ±0.15）
  // VRM 约定：上臂局部 X 轴沿手臂方向，X 负值让手臂向前下挥
  const upperArmSpec: Array<[VRMHumanBoneName, THREE.Euler]> = [
    [VRMHumanBoneName.LeftUpperArm,  new THREE.Euler(-1.2,  0, -0.15, 'XYZ')],
    [VRMHumanBoneName.RightUpperArm, new THREE.Euler(-1.2,  0,  0.15, 'XYZ')],
  ];
  // 下臂：肘部微屈（X 0.30）让手肘自然向前
  const lowerArmSpec: Array<[VRMHumanBoneName, THREE.Euler]> = [
    [VRMHumanBoneName.LeftLowerArm,  new THREE.Euler( 0.30,  0,  0,    'XYZ')],
    [VRMHumanBoneName.RightLowerArm, new THREE.Euler( 0.30,  0,  0,    'XYZ')],
  ];

  let applied = 0;
  let missing = 0;
  let typeErrors = 0;
  for (const [name, euler] of [...upperArmSpec, ...lowerArmSpec]) {
    const bone = vrm.humanoid.getNormalizedBoneNode(name) as any;
    if (!bone) { missing++; continue; }
    try {
      if (bone.quaternion && typeof bone.quaternion.setFromEuler === 'function') {
        bone.quaternion.setFromEuler(euler);
      } else if (bone.rotation && typeof bone.rotation.setFromEuler === 'function') {
        bone.rotation.setFromEuler(euler);
      } else {
        typeErrors++;
        continue;
      }
      applied++;
    } catch (e) {
      typeErrors++;
    }
  }
  // 立即更新世界矩阵，使设置后的姿态在下一帧渲染前生效
  vrm.scene.updateMatrixWorld(true);

  if (logFlag) {
    log.info('setNeutralPose 完成', { applied, missing, typeErrors });
  }
}

/** VRMModel Props */
export interface VRMModelProps {
  /** 当前姿态（旧 BonePose，保留 prop 兼容调用方，新架构不再使用） */
  pose: BonePose;
  /** VRM 标准姿态（保留 prop 兼容调用方，新架构不再使用） */
  vrmPose?: VRMPose;
  /** VRM 模型路径（public 目录下的相对路径） */
  modelUrl?: string;
  /** 注视目标（世界坐标） */
  lookAtTarget?: THREE.Vector3 | null;
  /**
   * 加载完成回调
   * 同时传递 VRM 和 VRMAnimator 实例，供上层（AvatarDriver）连接使用
   */
  onLoaded?: (vrm: VRM, animator: VRMAnimator) => void;
  /**
   * 加载失败回调（VRM 文件不可用、解析错误等）
   * 上层可据此降级到 2D 模式或显示错误提示
   */
  onLoadError?: (error: Error) => void;
  /**
   * 是否启用实时姿态追踪驱动（与离线播放互斥）。
   * 启用时：每帧调用 RealtimePoseDriver.update(realtimePoseEstimate, delta)
   * 禁用时：走 VRMAnimator 离线驱动路径
   */
  useRealtimeTracking?: boolean;
  /** 实时姿态估计结果（由 usePoseTracking Hook 提供；仅在 useRealtimeTracking=true 时使用） */
  realtimePoseEstimate?: PoseEstimate | null;
}

/** VRM 虚拟人模型组件 */
export function VRMModel({
  pose: _pose,
  vrmPose: _vrmPose,
  modelUrl = `${import.meta.env.BASE_URL}models/avatar.vrm`,
  lookAtTarget,
  onLoaded,
  onLoadError,
  useRealtimeTracking = false,
  realtimePoseEstimate = null,
}: VRMModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  /** VRMAnimator 实例（封装 AnimationMixer），在 VRM 加载成功后创建 */
  const vrmAnimatorRef = useRef<VRMAnimator | null>(null);
  /** VRM.update 异常已记录标志（避免每帧刷屏） */
  const vrmUpdateErrorLoggedRef = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // ===== 实时姿态驱动相关实例（保留实时追踪路径）=====
  // VRMAdapter 包装已加载的 VRM，供 RealtimePoseDriver 使用
  // 通过类型断言绑定已加载的 VRM 实例，避免重复加载模型
  const vrmAdapterRef = useRef<VRMAdapter | null>(null);
  if (vrmAdapterRef.current === null) {
    vrmAdapterRef.current = new VRMAdapter();
  }
  // RealtimePoseDriver 连接 KalidokitSolver → VRMAdapter.applyRealtimePose
  const realtimeDriverRef = useRef<RealtimePoseDriver | null>(null);
  if (realtimeDriverRef.current === null) {
    realtimeDriverRef.current = new RealtimePoseDriver();
    realtimeDriverRef.current.attach(vrmAdapterRef.current);
  }
  // 用 ref 保存最新的 props，避免 useFrame 闭包过期
  const useRealtimeTrackingRef = useRef(useRealtimeTracking);
  const realtimePoseEstimateRef = useRef<PoseEstimate | null>(realtimePoseEstimate);
  // 加载失败回调 ref：避免将其加入 useEffect 依赖导致重复加载
  const onLoadErrorRef = useRef(onLoadError);
  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  // 同步实时追踪相关 props 到 ref，供 useFrame 读取最新值
  useEffect(() => {
    useRealtimeTrackingRef.current = useRealtimeTracking;
    realtimePoseEstimateRef.current = realtimePoseEstimate;
    // 同步启用状态到 driver
    const driver = realtimeDriverRef.current;
    if (driver) {
      driver.setEnabled(useRealtimeTracking);
      // 切换时重置解算器状态，避免上次的平滑值残留导致跳变
      driver.reset();
    }
  }, [useRealtimeTracking, realtimePoseEstimate]);

  // 异步加载 VRM
  // 使用 VRMCache.loadVRM 统一加载入口：内部实现内存缓存 + IndexedDB 持久化 + HTTP 回退
  // React StrictMode 双重渲染时，两次 useEffect 会复用同一个 Promise，避免重复请求
  useEffect(() => {
    let cancelled = false;

    loadVRM(modelUrl)
      .then((vrm) => {
        if (cancelled) return;

        vrmRef.current = vrm;
        vrm.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.frustumCulled = false;
        });

        // 提取 VRM 1.0 内置的 VRMC_node_constraint 约束并存入模块级缓存，
        // 供 ClipBuilder.buildClip 时读取（无约束时返回空 Map，回退到 JointLimits）
        const constraints = extractVRMCConstraints(vrm);
        setVRMConstraintCache(vrm, constraints);

        // 此 VRM 模型本身面朝 +Z（右臂在 -X，非标准 VRM），已朝向相机，无需旋转
        // VRM hips 通常在 y=0 附近，偏移对齐舞台
        vrm.scene.position.y = -0.9;

        // 覆盖默认绑定姿态（T-pose），设置自然下垂中立姿态
        // 失败不应中断 VRM 加载流程——回退到原始 T-pose 也比没模型好
        try {
          setNeutralPose(vrm, true);
        } catch (poseErr) {
          log.warn('setNeutralPose 失败，使用默认 T-pose', { error: String(poseErr) });
        }

        if (groupRef.current) {
          groupRef.current.add(vrm.scene);
        }

        // 将已加载的 VRM 绑定到 VRMAdapter，供 RealtimePoseDriver 使用
        // VRMAdapter.vrm 是 private 字段，这里通过类型断言设置，避免修改 VRMAdapter 接口
        // 也避免重复调用 VRMAdapter.load() 导致模型被加载两次
        (vrmAdapterRef.current as unknown as { vrm: VRM | null }).vrm = vrm;

        // 创建 VRMAnimator 实例（封装 THREE.AnimationMixer）
        // 与 AvatarDriver 共享同一份实例：AvatarDriver.playClip 触发动画，
        // VRMModel.useFrame 调用 vrmAnimator.update(delta) 推进
        vrmAnimatorRef.current = new VRMAnimator(vrm);

        setIsLoaded(true);
        log.info('VRM 加载完成', { hasAnimator: !!vrmAnimatorRef.current });

        // 通知父组件：VRM 和 VRMAnimator 已就绪
        if (vrmAnimatorRef.current) {
          onLoaded?.(vrm, vrmAnimatorRef.current);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // 包装为标准 Error 并附加模型 URL 上下文，便于上层识别与降级
          const wrapped = err instanceof Error
            ? err
            : new Error(`VRM 加载失败: ${String(err)}`);
          log.error('Failed to load VRM', wrapped, { modelUrl });
          // 通知父组件触发降级（如切换到 2D 模式或显示错误提示）
          onLoadErrorRef.current?.(wrapped);
        }
      });

    return () => {
      cancelled = true;
      if (vrmRef.current) {
        if (vrmRef.current.scene.parent) {
          vrmRef.current.scene.parent.remove(vrmRef.current.scene);
        }
        vrmRef.current = null;
        vrmAnimatorRef.current = null;
      }
    };
  }, [modelUrl, onLoaded]);

  // 每帧驱动
  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !isLoaded) return;

    // ===== 实时姿态追踪路径（与离线播放互斥）=====
    // 启用时由 RealtimePoseDriver 接管：KalidokitSolver 解算 → VRMAdapter.applyRealtimePose
    // driver.update 内部已调用 vrm.update(delta)，因此本帧无需再走离线路径末尾的 vrm.update
    if (useRealtimeTrackingRef.current) {
      realtimeDriverRef.current?.update(realtimePoseEstimateRef.current, delta);
      return;
    }

    // ===== VRM 动画驱动路径 =====
    // 推进 AnimationMixer（AvatarDriver.playClip 触发的动画在此处推进）
    vrmAnimatorRef.current?.update(delta);
    // 更新 spring bone/lookAt/expression（必须在 mixer.update 之后）
    // 包裹 try-catch：当前 VRM 模型部分 humanoid bone 节点为 null，
    // vrm.update() 内部遍历骨骼调用 updateWorldMatrix 时会抛 TypeError。
    // 捕获后 normalized→raw bone 同步可能不完整，但 AnimationMixer 已更新
    // normalized bone，部分 raw bone 仍可被正确同步，动画大体可播放。
    try {
      vrm.update(delta);
    } catch (e) {
      // 首次错误记录完整日志，后续静默避免刷屏
      if (!vrmUpdateErrorLoggedRef.current) {
        log.error('VRM.update 异常（部分骨骼节点可能为 null，动画可能不完整）', e);
        vrmUpdateErrorLoggedRef.current = true;
      }
    }

    // ===== 注视跟踪 =====
    if (lookAtTarget && vrm.lookAt) {
      vrm.lookAt.lookAt(lookAtTarget);
    }
  });

  return <group ref={groupRef} />;
}
