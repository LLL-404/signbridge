/**
 * VRM 虚拟人 3D 渲染组件
 *
 * 使用 drei useGLTF + VRMLoaderPlugin 加载标准 VRM 模型，
 * 将 AvatarDriver 生成的 BonePose 映射到 VRM 人形骨骼。
 *
 * 支持：
 *   - 骨骼驱动（身体 + 下肢 + 手指）
 *   - 骨骼重定向（T-pose → A-pose 差异校正）
 *   - 平滑滤波（One-Euro Filter）
 *   - 面部表情（blendshape）
 *   - 自动眨眼
 *   - 注视跟踪
 */
import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import type { BonePose } from '@/types/avatar';
import { FacialExpression, HeadMovement, HandShape } from '@/types/sign';
import { getHandShapeDefinition } from '@/modules/avatar/HandShape';
import { retargetRotation } from '@/modules/avatar/Retargeter';
import { BoneSmoother } from '@/modules/avatar/Smoother';

// 身体骨骼映射：AvatarDriver 内部名称 → VRM humanoid 标准骨骼名称
// 含躯干、上肢、下肢，覆盖完整人形骨架
const BODY_BONE_MAP: Record<string, string> = {
  root: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  // 上肢：内部 shoulder/elbow/wrist 对应 VRM shoulder/upperArm/lowerArm
  left_shoulder: 'leftShoulder',
  left_elbow: 'leftUpperArm',
  left_wrist: 'leftLowerArm',
  right_shoulder: 'rightShoulder',
  right_elbow: 'rightUpperArm',
  right_wrist: 'rightLowerArm',
  // 下肢：内部 hip/knee/ankle 对应 VRM upperLeg/lowerLeg/foot
  left_hip: 'leftUpperLeg',
  left_knee: 'leftLowerLeg',
  left_ankle: 'leftFoot',
  right_hip: 'rightUpperLeg',
  right_knee: 'rightLowerLeg',
  right_ankle: 'rightFoot',
};

/**
 * 手指骨骼映射：每只手 5 指 × 3 关节 = 15 个 VRM 骨骼
 *
 * 内部 HandShapeDefinition.fingers 顺序：[拇指, 食指, 中指, 无名指, 小指]
 * 每根手指定义包含 mcp / pip / dip 三个屈曲角度
 *
 * VRM 拇指：Metacarpal / Proximal / Distal（无 PIP，3 节）
 * VRM 其他手指：Proximal / Intermediate / Distal（3 节）
 *
 * 映射时将内部 (fingerIndex, joint) 对应到 VRM 骨骼：
 *   - 拇指 cmc→Metacarpal, mcp→Proximal, pip→Distal（内部 dip 丢弃，因 VRM 仅 3 节）
 *   - 其他 mcp→Proximal, pip→Intermediate, dip→Distal
 */
interface FingerJointMap {
  vrm: string;
  fingerIndex: number;
  joint: 'mcp' | 'pip' | 'dip';
}

const FINGER_BONE_MAP: Record<'left' | 'right', FingerJointMap[]> = {
  left: [
    // 拇指（fingerIndex=0）
    { vrm: 'leftThumbMetacarpal', fingerIndex: 0, joint: 'mcp' },
    { vrm: 'leftThumbProximal', fingerIndex: 0, joint: 'pip' },
    { vrm: 'leftThumbDistal', fingerIndex: 0, joint: 'dip' },
    // 食指（fingerIndex=1）
    { vrm: 'leftIndexProximal', fingerIndex: 1, joint: 'mcp' },
    { vrm: 'leftIndexIntermediate', fingerIndex: 1, joint: 'pip' },
    { vrm: 'leftIndexDistal', fingerIndex: 1, joint: 'dip' },
    // 中指（fingerIndex=2）
    { vrm: 'leftMiddleProximal', fingerIndex: 2, joint: 'mcp' },
    { vrm: 'leftMiddleIntermediate', fingerIndex: 2, joint: 'pip' },
    { vrm: 'leftMiddleDistal', fingerIndex: 2, joint: 'dip' },
    // 无名指（fingerIndex=3）
    { vrm: 'leftRingProximal', fingerIndex: 3, joint: 'mcp' },
    { vrm: 'leftRingIntermediate', fingerIndex: 3, joint: 'pip' },
    { vrm: 'leftRingDistal', fingerIndex: 3, joint: 'dip' },
    // 小指（fingerIndex=4）
    { vrm: 'leftLittleProximal', fingerIndex: 4, joint: 'mcp' },
    { vrm: 'leftLittleIntermediate', fingerIndex: 4, joint: 'pip' },
    { vrm: 'leftLittleDistal', fingerIndex: 4, joint: 'dip' },
  ],
  right: [
    { vrm: 'rightThumbMetacarpal', fingerIndex: 0, joint: 'mcp' },
    { vrm: 'rightThumbProximal', fingerIndex: 0, joint: 'pip' },
    { vrm: 'rightThumbDistal', fingerIndex: 0, joint: 'dip' },
    { vrm: 'rightIndexProximal', fingerIndex: 1, joint: 'mcp' },
    { vrm: 'rightIndexIntermediate', fingerIndex: 1, joint: 'pip' },
    { vrm: 'rightIndexDistal', fingerIndex: 1, joint: 'dip' },
    { vrm: 'rightMiddleProximal', fingerIndex: 2, joint: 'mcp' },
    { vrm: 'rightMiddleIntermediate', fingerIndex: 2, joint: 'pip' },
    { vrm: 'rightMiddleDistal', fingerIndex: 2, joint: 'dip' },
    { vrm: 'rightRingProximal', fingerIndex: 3, joint: 'mcp' },
    { vrm: 'rightRingIntermediate', fingerIndex: 3, joint: 'pip' },
    { vrm: 'rightRingDistal', fingerIndex: 3, joint: 'dip' },
    { vrm: 'rightLittleProximal', fingerIndex: 4, joint: 'mcp' },
    { vrm: 'rightLittleIntermediate', fingerIndex: 4, joint: 'pip' },
    { vrm: 'rightLittleDistal', fingerIndex: 4, joint: 'dip' },
  ],
};

// 表情映射：AvatarDriver FacialExpression → VRM expression preset
const EXPRESSION_MAP: Record<string, string> = {
  [FacialExpression.NEUTRAL]: 'neutral',
  [FacialExpression.HAPPY]: 'happy',
  [FacialExpression.SAD]: 'sad',
  [FacialExpression.ANGRY]: 'angry',
  [FacialExpression.SURPRISED]: 'surprised',
  [FacialExpression.CONFUSED]: 'sad',
  [FacialExpression.QUESTION]: 'surprised',
  [FacialExpression.NEGATIVE]: 'angry',
  [FacialExpression.EMPHASIS]: 'angry',
};

/**
 * 驱动单只手的手指骨骼
 * 从 HandShape 查表获取角度，映射到 VRM 手指骨骼的 X 轴屈曲
 */
function driveHandFingers(
  humanoid: VRM['humanoid'],
  shape: HandShape,
  side: 'left' | 'right',
): void {
  const def = getHandShapeDefinition(shape);
  const mapping = FINGER_BONE_MAP[side];
  for (const { vrm, fingerIndex, joint } of mapping) {
    const fingerDef = def.fingers[fingerIndex];
    if (!fingerDef) continue;
    const angle = joint === 'mcp' ? fingerDef.mcp : joint === 'pip' ? fingerDef.pip : fingerDef.dip;
    const boneNode = humanoid.getRawBoneNode(vrm as never);
    if (!boneNode) continue;
    // VRM 手指屈曲绕本地 X 轴；保留 Y/Z 为 0 避免侧偏
    boneNode.rotation.set(angle, 0, 0);
  }
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
  const headAnimTimeRef = useRef(0);
  const smoother = useMemo(() => new BoneSmoother(1.5, 0.01), []);
  const [isLoaded, setIsLoaded] = useState(false);

  // 更新 pose 引用
  useEffect(() => {
    poseRef.current = pose;
    smoother.reset();
  }, [pose, smoother]);

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
  useFrame((state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !isLoaded) return;

    const currentPose = poseRef.current;
    const humanoid = vrm.humanoid;
    const timestamp = state.clock.elapsedTime * 1000;
    headAnimTimeRef.current += delta;

    // ===== 身体骨骼驱动（含重定向 + 平滑滤波）=====
    // 顺序：先下肢→躯干→头→上肢，遵循骨骼层级，避免父级旋转影响子级世界变换计算
    for (const [internalName, vrmBoneName] of Object.entries(BODY_BONE_MAP)) {
      const boneNode = humanoid.getRawBoneNode(vrmBoneName as never);
      if (!boneNode) continue;
      const poseBone = currentPose[internalName as keyof BonePose] as
        | { rotation?: { x: number; y: number; z: number } }
        | undefined;
      if (!poseBone?.rotation) continue;

      // 1. 重定向：补偿 T-pose（VRM）与 A-pose（内部 IK）的 rest pose 差异
      //    主要是肩部，T-pose 双臂水平外展，A-pose 双臂下垂
      const retargeted = retargetRotation(vrmBoneName, poseBone.rotation);
      // 2. 平滑：One-Euro Filter 抑制帧间抖动
      const smoothed = smoother.smooth(vrmBoneName, retargeted, timestamp);
      boneNode.rotation.set(smoothed.x, smoothed.y, smoothed.z);
    }

    // ===== 手指骨骼驱动（从 HandShape 查表）=====
    // 不再引用 BonePose 中不存在的 left_thumb_mcp 等字段
    driveHandFingers(humanoid, currentPose.left_hand.shape, 'left');
    driveHandFingers(humanoid, currentPose.right_hand.shape, 'right');

    // ===== 头部运动叠加 =====
    const headBone = humanoid.getRawBoneNode('head' as never);
    const neckBone = humanoid.getRawBoneNode('neck' as never);
    const poseHead = currentPose.head;
    const baseRotX = poseHead?.rotation?.x ?? 0;
    const baseRotY = poseHead?.rotation?.y ?? 0;
    const baseRotZ = poseHead?.rotation?.z ?? 0;

    let headOffsetX = 0;
    let headOffsetY = 0;
    let headOffsetZ = 0;
    const t = headAnimTimeRef.current;

    switch (currentPose.head_movement) {
      case HeadMovement.NOD:
        headOffsetX = Math.sin(t * Math.PI * 2 * 1.5) * 0.25;
        break;
      case HeadMovement.SLIGHT_NOD:
        headOffsetX = Math.sin(t * Math.PI * 2) * 0.1;
        break;
      case HeadMovement.SHAKE:
        headOffsetY = Math.sin(t * Math.PI * 2 * 2) * 0.35;
        break;
      case HeadMovement.TILT_LEFT:
        headOffsetZ = Math.abs(Math.sin(t * Math.PI)) * 0.2;
        break;
      case HeadMovement.TILT_RIGHT:
        headOffsetZ = -Math.abs(Math.sin(t * Math.PI)) * 0.2;
        break;
    }

    if (headBone) {
      headBone.rotation.x = baseRotX + headOffsetX;
      headBone.rotation.y = baseRotY + headOffsetY;
      headBone.rotation.z = baseRotZ + headOffsetZ;
    }
    if (neckBone) {
      neckBone.rotation.x = baseRotX + headOffsetX * 0.4;
      neckBone.rotation.y = baseRotY + headOffsetY * 0.4;
      neckBone.rotation.z = baseRotZ + headOffsetZ * 0.4;
    }

    // ===== 表情驱动 =====
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

    // ===== 注视跟踪 =====
    if (lookAtTarget && vrm.lookAt) {
      vrm.lookAt.lookAt(lookAtTarget);
    }

    // VRM 内部更新
    vrm.update(delta);
  });

  return <group ref={groupRef} />;
}
