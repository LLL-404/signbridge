// VRM 动画驱动器
// 封装 THREE.AnimationMixer，负责播放 AnimationClip 到 VRM 模型
// 替代旧的 applyVRMPose 手动骨骼操作方案
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { logger } from '@/modules/debug/logger';

const log = logger.module('VRMAnimator');

/**
 * VRM 动画驱动器
 * 封装 THREE.AnimationMixer，提供简洁的播放/停止接口
 *
 * 使用方式：
 *   const animator = new VRMAnimator(vrm);
 *   animator.playClip(clip, 0.3);
 *   // 每帧调用
 *   animator.update(delta);
 */
export class VRMAnimator {
  private mixer: THREE.AnimationMixer;
  private currentAction: THREE.AnimationAction | null = null;

  constructor(vrm: VRM) {
    // AnimationMixer 接收场景根节点，内部会遍历查找轨道目标
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    // 创建表情代理 Object3D：AnimationMixer 通过 PropertyBinding 解析
    // 'expressionManager.<preset>' 轨道名时，需要找到名为 'expressionManager' 的节点，
    // 并在其上设置 preset 属性。这里用 defineProperty 将属性转发到 vrm.expressionManager
    const exprProxy = new THREE.Object3D();
    exprProxy.name = 'expressionManager';
    for (const preset of ['happy', 'sad', 'angry', 'surprised', 'relaxed']) {
      Object.defineProperty(exprProxy, preset, {
        get: () => vrm.expressionManager?.getValue(preset) ?? 0,
        set: (v: number) => vrm.expressionManager?.setValue(preset, v),
        enumerable: true,
        configurable: true,
      });
    }
    vrm.scene.add(exprProxy);
  }

  /**
   * 播放动画片段
   * 若当前有正在播放的 action，先以 fadeIn 时长淡出，再以 fadeIn 时长淡入新 action
   *
   * @param clip THREE.AnimationClip 实例
   * @param fadeIn 淡入时间（秒），默认 0.3
   */
  playClip(clip: THREE.AnimationClip, fadeIn: number = 0.3): void {
    // 停止当前 action（用相同的 fadeIn 时长淡出，保证过渡平滑）
    if (this.currentAction) {
      this.currentAction.fadeOut(fadeIn);
    }

    // 创建新 action 并淡入播放
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveWeight(1);
    action.enabled = true;
    action.fadeIn(fadeIn);
    action.play();
    this.currentAction = action;

    log.debug('playClip', { clipName: clip.name, duration: clip.duration, fadeIn });
  }

  /**
   * 停止当前动画
   * @param fadeOut 淡出时间（秒），默认 0.3
   */
  stop(fadeOut: number = 0.3): void {
    if (!this.currentAction) return;
    this.currentAction.fadeOut(fadeOut);
    this.currentAction = null;
    log.debug('stop', { fadeOut });
  }

  /**
   * 每帧更新（由外部渲染循环调用）
   * 必须在 vrm.update(delta) 之前调用，保证 spring bone/lookAt/expression 同步
   * @param delta 帧间隔时间（秒）
   */
  update(delta: number): void {
    this.mixer.update(delta);
  }
}
