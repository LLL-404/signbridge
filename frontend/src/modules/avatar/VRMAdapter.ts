/**
 * VRM 虚拟人适配器
 *
 * 使用 @pixiv/three-vrm 加载标准 VRM 模型文件，
 * 将 AvatarDriver 生成的 Pose 数据映射到 VRM 人形骨骼系统。
 *
 * VRM Consortium 定义的标准骨骼名称：
 *   hips / spine / chest / neck / head
 *   leftShoulder / leftUpperArm / leftLowerArm / leftHand
 *   rightShoulder / rightUpperArm / rightLowerArm / rightHand
 *   手指骨骼：leftThumbProximalPhalanx / leftIndexProximalPhalanx ...
 *
 * 我们的内部骨骼名称（AvatarDriver 输出）：
 *   root / spine / chest / neck / head
 *   left_shoulder / left_elbow / left_wrist
 *   right_shoulder / right_elbow / right_wrist
 *   left_thumb_cmc / left_thumb_mcp / left_thumb_pip / left_thumb_dip
 *   left_index_mcp / left_index_pip / left_index_dip ...
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import type { VRMHumanBoneName } from '@pixiv/three-vrm-core';
import type { BonePose, Vec3 } from '@/types/avatar';

/** VRM Consortium 定义的标准骨骼名称（字符串值） */
type VRMBoneName = typeof VRMHumanBoneName[keyof typeof VRMHumanBoneName];

/** VRM 标准骨骼名称 → 内部骨骼名称 */
const VRM_TO_INTERNAL: Partial<Record<VRMBoneName, string>> = {
  hips: 'root',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  leftShoulder: 'left_shoulder',
  leftUpperArm: 'left_elbow',     // VRM leftUpperArm = 我们的 left_elbow（上臂）
  leftLowerArm: 'left_wrist',    // VRM leftLowerArm = 我们的 left_wrist（前臂）
  // VRM leftHand 是手部容器，不单独旋转
  rightShoulder: 'right_shoulder',
  rightUpperArm: 'right_elbow',
  rightLowerArm: 'right_wrist',
  // 手指骨骼：VRM 骨骼名称（小写字符串值）
  leftThumbMetacarpal: 'left_thumb_cmc',
  leftThumbProximal: 'left_thumb_mcp',
  leftThumbDistal: 'left_thumb_pip',
  leftIndexProximal: 'left_index_mcp',
  leftIndexIntermediate: 'left_index_pip',
  leftIndexDistal: 'left_index_dip',
  leftMiddleProximal: 'left_middle_mcp',
  leftMiddleIntermediate: 'left_middle_pip',
  leftMiddleDistal: 'left_middle_dip',
  leftRingProximal: 'left_ring_mcp',
  leftRingIntermediate: 'left_ring_pip',
  leftRingDistal: 'left_ring_dip',
  leftLittleProximal: 'left_pinky_mcp',
  leftLittleIntermediate: 'left_pinky_pip',
  leftLittleDistal: 'left_pinky_dip',
  rightThumbMetacarpal: 'right_thumb_cmc',
  rightThumbProximal: 'right_thumb_mcp',
  rightThumbDistal: 'right_thumb_pip',
  rightIndexProximal: 'right_index_mcp',
  rightIndexIntermediate: 'right_index_pip',
  rightIndexDistal: 'right_index_dip',
  rightMiddleProximal: 'right_middle_mcp',
  rightMiddleIntermediate: 'right_middle_pip',
  rightMiddleDistal: 'right_middle_dip',
  rightRingProximal: 'right_ring_mcp',
  rightRingIntermediate: 'right_ring_pip',
  rightRingDistal: 'right_ring_dip',
  rightLittleProximal: 'right_pinky_mcp',
  rightLittleIntermediate: 'right_pinky_pip',
  rightLittleDistal: 'right_pinky_dip',
};

/** 内部骨骼名称 → VRM 标准骨骼名称 */
const INTERNAL_TO_VRM: Record<string, VRMBoneName> = Object.entries(
  VRM_TO_INTERNAL,
).reduce(
  (acc, [vrm, internal]) => {
    if (vrm && internal) acc[internal] = vrm as VRMBoneName;
    return acc;
  },
  {} as Record<string, VRMBoneName>,
);

/** 弧度转 THREE.Euler.order */
const V3_TO_EULER = (
  v: Vec3,
  order: THREE.EulerOrder = 'XYZ',
): THREE.Euler => new THREE.Euler(v.x, v.y, v.z, order);

/**
 * VRMAdapter — 加载 VRM 模型并驱动其人形骨骼
 *
 * 使用方法：
 * ```
 * const adapter = new VRMAdapter();
 * await adapter.load('/models/avatar.vrm', scene);
 * adapter.applyPose(pose);           // 每帧调用
 * adapter.setExpression('happy');    // 表情控制
 * adapter.update(deltaTime);          // VRM 内部更新
 * ```
 */
export class VRMAdapter {
  private vrm: VRM | null = null;
  private loader: GLTFLoader;
  private loadingPromise: Promise<VRM> | null = null;

  constructor() {
    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));
  }

  /**
   * 加载 VRM 模型文件
   * @param url   VRM 文件 URL（支持相对路径 /models/xxx.vrm）
   * @param scene Three.js 场景，用于添加模型
   * @param onProgress 加载进度回调
   */
  load(
    url: string,
    scene: THREE.Scene,
    onProgress?: (progress: number) => void,
  ): Promise<VRM> {
    if (this.vrm) {
      scene.remove(this.vrm.scene);
      this.vrm = null;
    }

    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = new Promise((resolve, reject) => {
      this.loader.load(
        url,
        async (gltf) => {
          const vrm = gltf.userData.vrm as VRM;
          if (!vrm) {
            reject(new Error('Loaded glTF does not contain a VRM object'));
            return;
          }

          // 性能优化
          vrm.scene.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.Mesh) {
              obj.frustumCulled = false;
            }
          });

          // 将 VRM 添加到场景
          scene.add(vrm.scene);

          this.vrm = vrm;
          this.loadingPromise = null;

          // 初始化：摆正朝向
          vrm.scene.rotation.y = Math.PI;

          resolve(vrm);
        },
        (progress) => {
          if (progress.total > 0) {
            onProgress?.(progress.loaded / progress.total);
          }
        },
        (error) => {
          this.loadingPromise = null;
          reject(error);
        },
      );
    });

    return this.loadingPromise;
  }

  /** 获取已加载的 VRM 实例 */
  getVRM(): VRM | null {
    return this.vrm;
  }

  /** 获取 VRM 场景对象（用于添加到场景） */
  getScene(): THREE.Object3D | null {
    return this.vrm?.scene ?? null;
  }

  /**
   * 应用 AvatarDriver 生成的 BonePose 到 VRM 骨骼
   *
   * 骨骼映射关系：
   *   - 身体骨骼：通过 humanoid.getRawBoneNode() 获取并旋转
   *   - 手指骨骼：通过 humanoid.getRawBoneNode() 获取并旋转
   *   - 表情：通过 expressionManager 设置 blendshape
   *
   * 注意：VRM 的 upperArm/lowerArm 与我们的 elbow/wrist 命名不同，
   *       需要通过 INTERNAL_TO_VRM 映射转换
   */
  applyPose(pose: BonePose): void {
    const vrm = this.vrm;
    if (!vrm) return;

    const humanoid = vrm.humanoid;

    // 1. 身体骨骼（root / spine / chest / neck / head / 肩肘腕）
    for (const [internalName, vrmBoneName] of Object.entries(INTERNAL_TO_VRM)) {
      // 只处理身体骨骼（不含手指）
      if (
        internalName.includes('mcp') ||
        internalName.includes('pip') ||
        internalName.includes('dip') ||
        internalName.includes('cmc')
      ) {
        continue;
      }

      const boneNode = humanoid.getRawBoneNode(vrmBoneName);
      if (!boneNode) continue;

      const poseBone = pose[internalName as keyof BonePose] as
        | { position?: Vec3; rotation?: Vec3 }
        | undefined;
      if (!poseBone) continue;

      // 旋转
      if (poseBone.rotation) {
        boneNode.rotation.copy(V3_TO_EULER(poseBone.rotation));
      }
    }

    // 2. 手指骨骼
    for (const [internalName, vrmBoneName] of Object.entries(INTERNAL_TO_VRM)) {
      if (
        !(
          internalName.includes('mcp') ||
          internalName.includes('pip') ||
          internalName.includes('dip') ||
          internalName.includes('cmc')
        )
      ) {
        continue;
      }

      const boneNode = humanoid.getRawBoneNode(vrmBoneName);
      if (!boneNode) continue;

      const poseBone = pose[internalName as keyof BonePose] as
        | { rotation?: Vec3 }
        | undefined;
      if (!poseBone?.rotation) continue;

      // VRM 手指骨骼主要绕 X 轴屈曲
      boneNode.rotation.set(poseBone.rotation.x, 0, 0);
    }

    // 3. 表情（Blendshape）
    this.applyExpression(pose.expression);
  }

  /**
   * 应用面部表情
   *
   * AvatarDriver 的 FacialExpression → VRM Blendshape 映射：
   *   NEUTRAL     → (all 0)
   *   HAPPY       → happy +Fun / Fun
   *   SAD         → sad +Sorrow / Sorrow
   *   ANGRY       → angry / Angry
   *   SURPRISED   → surprised / Surprised
   *   CONFUSED    → neutral (fallback)
   */
  applyExpression(
    expression: string,
  ): void {
    const vrm = this.vrm;
    if (!vrm?.expressionManager) return;

    const mgr = vrm.expressionManager;

    // 重置所有表情到 0
    const presets = [
      'happy', 'sad', 'angry', 'surprised', 'fun',
      'neutral', 'relaxed',
    ] as const;
    for (const p of presets) {
      mgr.setValue(p, 0);
    }

    switch (expression) {
      case 'HAPPY':
      case 'happy':
        mgr.setValue('happy', 1);
        mgr.setValue('fun', 0.5);
        break;
      case 'SAD':
      case 'sad':
        mgr.setValue('sad', 1);
        break;
      case 'ANGRY':
      case 'angry':
        mgr.setValue('angry', 1);
        break;
      case 'SURPRISED':
      case 'surprised':
        mgr.setValue('surprised', 1);
        break;
      case 'NEUTRAL':
      default:
        // 默认中性
        mgr.setValue('neutral', 1);
        break;
    }
  }

  /**
   * 设置眨眼
   * @param open 0=闭眼，1=完全睁开
   */
  setBlink(leftOpen: number, rightOpen: number): void {
    const vrm = this.vrm;
    if (!vrm?.expressionManager) return;
    vrm.expressionManager.setValue('blinkLeft', 1 - leftOpen);
    vrm.expressionManager.setValue('blinkRight', 1 - rightOpen);
  }

  /**
   * 让 VRM 模型注视指定世界坐标
   */
  lookAt(worldPosition: THREE.Vector3): void {
    const vrm = this.vrm;
    if (!vrm?.lookAt) return;
    vrm.lookAt.lookAt(worldPosition);
  }

  /**
   * 更新 VRM 内部状态（每帧必须调用）
   * @param deltaTime 秒
   */
  update(deltaTime: number): void {
    this.vrm?.update(deltaTime);
  }

  /** 重置到 T-pose（VRM 初始姿态） */
  resetToTPose(): void {
    const vrm = this.vrm;
    if (!vrm) return;

    // VRM humanoid.resetNormalizedPose() 恢复到 T-pose
    vrm.humanoid.resetNormalizedPose();
    if (vrm.expressionManager) {
      vrm.expressionManager.resetValues();
    }
  }

  /** 释放 VRM 资源 */
  dispose(): void {
    if (this.vrm) {
      this.vrm.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    }
    this.vrm = null;
  }
}
