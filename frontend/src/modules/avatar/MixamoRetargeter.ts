// Mixamo 动画重定向器
// 将 Mixamo 导出的 FBX 动画（骨骼名 mixamorigX）重映射到 VRM normalized bone
// 与 ClipBuilder.buildTrackName 风格一致：node.name + '.quaternion' / '.position'
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { logger } from '@/modules/debug/logger';

const log = logger.module('MixamoRetargeter');

/**
 * Mixamo 骨骼名 → VRM humanoid bone 名映射表
 * 仅覆盖主要躯干与四肢骨骼，手指骨（如 mixamorigLeftHandThumb1）不映射
 */
const MIXAMO_VRM_RIG_MAP: Record<string, string> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
};

/**
 * 解析 Mixamo 轨道名 'mixamorigX.<property>' 为 { mixamoBone, property }
 * 解析失败返回 null
 */
function parseMixamoTrackName(trackName: string): { mixamoBone: string; property: string } | null {
  const dotIndex = trackName.lastIndexOf('.');
  if (dotIndex < 0) return null;
  return {
    mixamoBone: trackName.slice(0, dotIndex),
    property: trackName.slice(dotIndex + 1),
  };
}

/**
 * 将 Mixamo FBX 动画 clip 重定向为 VRM 可播放 clip
 *
 * 流程：
 *   1. 遍历 fbxClip.tracks，解析轨道名获取 mixamoBone 与 property
 *   2. 查 MIXAMO_VRM_RIG_MAP 得到 VRM bone 名
 *   3. 调用 humanoid.getNormalizedBoneNode 获取节点，用 node.name 重建轨道名
 *   4. 创建新 KeyframeTrack（保留原 times 和 values）
 *   5. 跳过未映射轨道（如手指骨），log.debug 输出跳过信息
 *
 * @param fbxClip 从 FBX 加载得到的 AnimationClip
 * @param vrm 目标 VRM 模型
 * @returns 重定向后的 AnimationClip（duration 同原 clip）
 */
export function retarget(fbxClip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip {
  const humanoid = vrm.humanoid;
  const newTracks: THREE.KeyframeTrack[] = [];
  let mapped = 0;
  let skipped = 0;

  for (const track of fbxClip.tracks) {
    const parsed = parseMixamoTrackName(track.name);
    if (!parsed) {
      skipped++;
      log.debug('跳过无法解析的轨道', { trackName: track.name });
      continue;
    }

    const vrmBoneName = MIXAMO_VRM_RIG_MAP[parsed.mixamoBone];
    if (!vrmBoneName) {
      skipped++;
      log.debug('跳过未映射的 Mixamo 骨骼', { mixamoBone: parsed.mixamoBone });
      continue;
    }

    const boneNode = humanoid.getNormalizedBoneNode(vrmBoneName as never);
    if (!boneNode) {
      skipped++;
      log.debug('VRM 节点不存在', { vrmBoneName });
      continue;
    }

    // 与 ClipBuilder.buildTrackName 一致：node.name + '.<property>'
    const newTrackName = `${boneNode.name}.${parsed.property}`;

    // 根据轨道类型创建对应 KeyframeTrack，保留原 times 和 values
    let newTrack: THREE.KeyframeTrack;
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      newTrack = new THREE.QuaternionKeyframeTrack(newTrackName, track.times, track.values);
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      newTrack = new THREE.VectorKeyframeTrack(newTrackName, track.times, track.values);
    } else {
      // 兜底：使用通用 KeyframeTrack 构造（保留 times/values，使用默认插值模式）
      newTrack = new THREE.KeyframeTrack(newTrackName, track.times, track.values);
    }
    newTracks.push(newTrack);
    mapped++;
  }

  log.info(`[Mixamo重定向] 输入轨道=${fbxClip.tracks.length}, 映射成功=${mapped}, 跳过=${skipped}`);

  return new THREE.AnimationClip(fbxClip.name, fbxClip.duration, newTracks, fbxClip.blendMode);
}
