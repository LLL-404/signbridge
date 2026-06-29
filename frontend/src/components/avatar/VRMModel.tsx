/**
 * VRM 虚拟人 3D 渲染组件
 *
 * 使用 drei useGLTF + VRMLoaderPlugin 加载标准 VRM 模型，
 * 将 AvatarDriver 生成的 BonePose 映射到 VRM 人形骨骼。
 *
 * 支持：
 *   - 骨骼驱动（身体 + 手指）
 *   - 面部表情（blendshape）
 *   - 自动眨眼
 *   - 注视跟踪
 */
import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import type { BonePose } from '@/types/avatar';

// 骨骼映射：AvatarDriver 内部名称 → VRM humanoid 标准骨骼名称
const INTERNAL_TO_VRM_BONE: Record<string, string> = {
  root: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  left_shoulder: 'leftShoulder',
  left_elbow: 'leftUpperArm',
  left_wrist: 'leftLowerArm',
  right_shoulder: 'rightShoulder',
  right_elbow: 'rightUpperArm',
  right_wrist: 'rightLowerArm',
  // 拇指：Metacarpal → Proximal → Distal（无 PIP）
  left_thumb_cmc: 'leftThumbMetacarpal',
  left_thumb_mcp: 'leftThumbProximal',
  left_thumb_pip: 'leftThumbDistal',
  left_index_mcp: 'leftIndexProximal',
  left_index_pip: 'leftIndexIntermediate',
  left_index_dip: 'leftIndexDistal',
  left_middle_mcp: 'leftMiddleProximal',
  left_middle_pip: 'leftMiddleIntermediate',
  left_middle_dip: 'leftMiddleDistal',
  left_ring_mcp: 'leftRingProximal',
  left_ring_pip: 'leftRingIntermediate',
  left_ring_dip: 'leftRingDistal',
  left_pinky_mcp: 'leftLittleProximal',
  left_pinky_pip: 'leftLittleIntermediate',
  left_pinky_dip: 'leftLittleDistal',
  right_thumb_cmc: 'rightThumbMetacarpal',
  right_thumb_mcp: 'rightThumbProximal',
  right_thumb_pip: 'rightThumbDistal',
  right_index_mcp: 'rightIndexProximal',
  right_index_pip: 'rightIndexIntermediate',
  right_index_dip: 'rightIndexDistal',
  right_middle_mcp: 'rightMiddleProximal',
  right_middle_pip: 'rightMiddleIntermediate',
  right_middle_dip: 'rightMiddleDistal',
  right_ring_mcp: 'rightRingProximal',
  right_ring_pip: 'rightRingIntermediate',
  right_ring_dip: 'rightRingDistal',
  right_pinky_mcp: 'rightLittleProximal',
  right_pinky_pip: 'rightLittleIntermediate',
  right_pinky_dip: 'rightLittleDistal',
};

// 表情映射：AvatarDriver FacialExpression → VRM expression preset
const EXPRESSION_MAP: Record<string, string> = {
  HAPPY: 'happy',
  happy: 'happy',
  SAD: 'sad',
  sad: 'sad',
  ANGRY: 'angry',
  angry: 'angry',
  SURPRISED: 'surprised',
  surprised: 'surprised',
  NEUTRAL: 'neutral',
  neutral: 'neutral',
};

function v3ToEuler(v: { x: number; y: number; z: number }) {
  return new THREE.Euler(v.x, v.y, v.z, 'XYZ');
}

/** VRMModel Props */
export interface VRMModelProps {
  /** 当前姿态 */
  pose: BonePose;
  /** VRM 模型路径（public 目录下的相对路径） */
  modelUrl?: string;
  /** 注视目标（世界坐标） */
  lookAtTarget?: THREE.Vector3 | null;
  /** 加载完成回调 */
  onLoaded?: (vrm: VRM) => void;
}

/** VRM 虚拟人模型组件 */
export function VRMModel({
  pose,
  modelUrl = '/models/avatar.vrm',
  lookAtTarget,
  onLoaded,
}: VRMModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const poseRef = useRef<BonePose>(pose);
  const blinkTimerRef = useRef(0);
  const isBlinkingRef = useRef(false);
  const blinkOpenRef = useRef(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // 更新 pose 引用
  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);

  // 异步加载 VRM
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) return;

        vrmRef.current = vrm;
        vrm.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.frustumCulled = false;
        });

        // 摆正朝向（VRM 默认朝 -Z，Three.js 朝 +Z）
        vrm.scene.rotation.y = Math.PI;
        // VRM hips 通常在 y=0 附近，偏移对齐舞台
        vrm.scene.position.y = -0.9;

        if (groupRef.current) {
          groupRef.current.add(vrm.scene);
        }

        setIsLoaded(true);
        onLoaded?.(vrm);
      },
      undefined,
      (err) => {
        console.error('[VRMModel] Failed to load VRM:', err);
      },
    );

    return () => {
      if (vrmRef.current) {
        if (vrmRef.current.scene.parent) {
          vrmRef.current.scene.parent.remove(vrmRef.current.scene);
        }
        vrmRef.current = null;
      }
    };
  }, [modelUrl, onLoaded]);

  // 每帧驱动
  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !isLoaded) return;

    const currentPose = poseRef.current;
    const humanoid = vrm.humanoid;

    // 身体骨骼驱动
    for (const [internalName, vrmBoneName] of Object.entries(INTERNAL_TO_VRM_BONE)) {
      if (
        internalName.includes('mcp') ||
        internalName.includes('pip') ||
        internalName.includes('dip')
      ) {
        // 手指骨骼
        const boneNode = humanoid.getRawBoneNode(vrmBoneName as any);
        if (!boneNode) continue;
        const poseBone = currentPose[internalName as keyof BonePose] as
          | { rotation?: { x: number; y: number; z: number } }
          | undefined;
        if (poseBone?.rotation) {
          boneNode.rotation.set(poseBone.rotation.x, 0, 0);
        }
      } else {
        // 身体骨骼
        const boneNode = humanoid.getRawBoneNode(vrmBoneName as any);
        if (!boneNode) continue;
        const poseBone = currentPose[internalName as keyof BonePose] as
          | { rotation?: { x: number; y: number; z: number } }
          | undefined;
        if (poseBone?.rotation) {
          boneNode.rotation.copy(v3ToEuler(poseBone.rotation));
        }
      }
    }

    // 表情驱动
    const mgr = vrm.expressionManager;
    if (mgr) {
      const expr = EXPRESSION_MAP[currentPose.expression] ?? 'neutral';
      const presets = ['happy', 'sad', 'angry', 'surprised', 'fun', 'neutral'];
      for (const p of presets) {
        mgr.setValue(p, 0);
      }
      if (expr === 'happy') {
        mgr.setValue('happy', 1);
        mgr.setValue('fun', 0.4);
      } else {
        mgr.setValue(expr, 1);
      }

      // 自动眨眼
      blinkTimerRef.current -= delta;
      if (blinkTimerRef.current <= 0) {
        blinkTimerRef.current = 3 + Math.random() * 3;
        isBlinkingRef.current = true;
      }
      if (isBlinkingRef.current) {
        blinkOpenRef.current -= delta * 8;
        if (blinkOpenRef.current <= 0) {
          blinkOpenRef.current = 0;
          isBlinkingRef.current = false;
        }
      } else if (blinkOpenRef.current < 1) {
        blinkOpenRef.current += delta * 6;
        if (blinkOpenRef.current > 1) blinkOpenRef.current = 1;
      }
      mgr.setValue('blinkLeft', 1 - blinkOpenRef.current);
      mgr.setValue('blinkRight', 1 - blinkOpenRef.current);
    }

    // 注视跟踪
    if (lookAtTarget && vrm.lookAt) {
      vrm.lookAt.lookAt(lookAtTarget);
    }

    // VRM 内部更新
    vrm.update(delta);
  });

  return <group ref={groupRef} />;
}
