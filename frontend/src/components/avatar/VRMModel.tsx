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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import { VRMAnimator } from '@/modules/avatar/VRMAnimator';
import { VRMAdapter } from '@/modules/avatar/VRMAdapter';
import { RealtimePoseDriver } from '@/modules/avatar/RealtimePoseDriver';
import { extractVRMCConstraints, setVRMConstraintCache } from '@/modules/avatar/JointLimits';
import type { PoseEstimate } from '@/modules/recognition/PoseEstimator';
import type { BonePose, VRMPose } from '@/types/avatar';
import { logger } from '@/modules/debug/logger';

const log = logger.module('VRMModel');

/**
 * VRM 加载缓存：防止 React StrictMode 双重渲染导致重复加载
 * 同一 URL 只发起一次 GLTFLoader.load 请求，后续调用复用 Promise
 */
const vrmLoadCache = new Map<string, Promise<VRM>>();

function loadVRMCached(url: string): Promise<VRM> {
  const cached = vrmLoadCache.get(url);
  if (cached) return cached;
  const promise = new Promise<VRM>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) { reject(new Error('VRM data not found in gltf')); return; }
        resolve(vrm);
      },
      undefined,
      (err) => reject(err),
    );
  });
  vrmLoadCache.set(url, promise);
  return promise;
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
  // 使用模块级 loadVRMCached 缓存加载 Promise：React StrictMode 双重渲染时，
  // 两次 useEffect 会复用同一个 Promise，避免 GLTFLoader 重复发起请求导致
  // 首次请求被浏览器取消（ERR_ABORTED）
  useEffect(() => {
    let cancelled = false;

    loadVRMCached(modelUrl)
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
        if (!cancelled) log.error('Failed to load VRM', err);
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
