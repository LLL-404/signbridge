/**
 * 临时诊断：3 个肘部穿透词汇的详细 IK 信息
 */
import { describe, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import * as fs from 'fs';
import * as path from 'path';
import { ClipBuilder } from './ClipBuilder';
import { COMMON_VOCABULARY } from '@/modules/data/CommonVocabulary';

const VRM_PATH = path.resolve(__dirname, '../../../public/models/avatar.vrm');
let vrmInstance: VRM | null = null;

async function loadRealVRM(): Promise<VRM> {
  if (vrmInstance) return vrmInstance;
  const buffer = fs.readFileSync(VRM_PATH);
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; i++) view[i] = buffer[i];
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', (gltf) => {
      vrmInstance = (gltf as any).userData.vrm;
      if (!vrmInstance) { reject(new Error('No VRM')); return; }
      const exprProxy = new THREE.Object3D();
      exprProxy.name = 'expressionManager';
      for (const preset of ['happy', 'sad', 'angry', 'surprised', 'relaxed']) {
        Object.defineProperty(exprProxy, preset, {
          get: () => vrmInstance!.expressionManager?.getValue(preset) ?? 0,
          set: (v: number) => vrmInstance!.expressionManager?.setValue(preset, v),
          enumerable: true, configurable: true,
        });
      }
      vrmInstance!.scene.add(exprProxy);
      resolve(vrmInstance);
    }, (error) => reject(error));
  });
}

describe('诊断肘部穿透', () => {
  it('输出 3 个穿透词汇的骨骼位置', async () => {
    const vrm = await loadRealVRM();

    // 输出真实模型的骨骼世界位置（T-pose）
    vrm.scene.updateMatrixWorld(true);
    const hipsPos = new THREE.Vector3();
    vrm.humanoid.getNormalizedBoneNode('hips' as never)!.getWorldPosition(hipsPos);
    const rShoulderPos = new THREE.Vector3();
    vrm.humanoid.getNormalizedBoneNode('rightUpperArm' as never)!.getWorldPosition(rShoulderPos);
    const rElbowPos = new THREE.Vector3();
    vrm.humanoid.getNormalizedBoneNode('rightLowerArm' as never)!.getWorldPosition(rElbowPos);
    const rWristPos = new THREE.Vector3();
    vrm.humanoid.getNormalizedBoneNode('rightHand' as never)!.getWorldPosition(rWristPos);
    console.log('T-pose hips:', hipsPos.toArray());
    console.log('T-pose rightShoulder:', rShoulderPos.toArray());
    console.log('T-pose rightElbow:', rElbowPos.toArray());
    console.log('T-pose rightWrist:', rWristPos.toArray());

    const failedGlosses = ['谢谢', '对不起', '他'];
    for (const gloss of COMMON_VOCABULARY) {
      if (!failedGlosses.includes(gloss.chinese)) continue;
      console.log(`\n===== 词汇「${gloss.chinese}」=====`);
      console.log(`  movement=${gloss.manual.movement}, loc=${gloss.manual.location_start}→${gloss.manual.location_end}`);

      const clip = ClipBuilder.buildClip(gloss, vrm);
      const mixer = new THREE.AnimationMixer(vrm.scene);
      const action = mixer.clipAction(clip);
      action.reset();
      action.setEffectiveWeight(1);
      action.enabled = true;
      action.play();

      const duration = clip.duration;
      const sampleTimes = [0, duration * 0.25, duration * 0.5, duration * 0.7, duration * 0.99];

      for (const t of sampleTimes) {
        mixer.setTime(t);
        vrm.update(0);
        vrm.scene.updateMatrixWorld(true);

        const elbowPos = new THREE.Vector3();
        vrm.humanoid.getNormalizedBoneNode('rightLowerArm' as never)!.getWorldPosition(elbowPos);
        const wristPos = new THREE.Vector3();
        vrm.humanoid.getNormalizedBoneNode('rightHand' as never)!.getWorldPosition(wristPos);

        const hDist = Math.sqrt((elbowPos.x - hipsPos.x) ** 2 + (elbowPos.z - hipsPos.z) ** 2);
        console.log(`  t=${t.toFixed(2)}: elbow=(${elbowPos.x.toFixed(3)},${elbowPos.y.toFixed(3)},${elbowPos.z.toFixed(3)}) wrist=(${wristPos.x.toFixed(3)},${wristPos.y.toFixed(3)},${wristPos.z.toFixed(3)}) hDist=${hDist.toFixed(3)}`);
      }
    }
  }, 30000);
});
