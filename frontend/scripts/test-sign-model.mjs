// 离线测试脚本：验证 SignModel 能否在纯 CPU 后端正常训练/推理
// 使用: node frontend/scripts/test-sign-model.mjs

import * as tf from '@tensorflow/tfjs';
import { SignModel, MODEL_TIMESTEPS, MODEL_FEATURE_DIM } from '../src/modules/recognition/SignModel.ts';

console.log('测试环境:');
console.log('  TF.js 版本:', tf.version.tfjs);

// 强制使用 CPU 后端
await tf.setBackend('cpu');
await tf.ready();
console.log('  Backend:', tf.getBackend());

const NUM_CLASSES = 5;
const SAMPLES_PER_CLASS = 10;
const T = MODEL_TIMESTEPS;
const D = MODEL_FEATURE_DIM;

console.log(`\n测试参数: classes=${NUM_CLASSES}, timesteps=${T}, features=${D}`);

// 生成简单的合成数据：每个类别均值偏移，训练后可区分
function generateTrainingData() {
  const x = [];
  const y = [];
  const labels = [];
  for (let c = 0; c < NUM_CLASSES; c++) {
    labels.push(`class_${c}`);
    const offset = (c - NUM_CLASSES / 2) * 0.2;
    for (let s = 0; s < SAMPLES_PER_CLASS; s++) {
      const sample = [];
      for (let t = 0; t < T; t++) {
        const frame = [];
        for (let f = 0; f < D; f++) {
          frame.push(offset + (Math.random() - 0.5) * 0.1);
        }
        sample.push(frame);
      }
      x.push(sample);
      y.push(c);
    }
  }
  return { x, y, labels };
}

console.log('\n[1/3] 构建模型...');
const model = new SignModel();
model.build(NUM_CLASSES);
console.log('  OK - 模型已构建，类别数:', model.getNumClasses());

console.log('\n[2/3] 训练模型（5 epochs）...');
const { x, y } = generateTrainingData();
const start = Date.now();
const history = await model.train(x, y, 5);
console.log(`  OK - 训练完成，用时 ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log('  最终 loss:', history.history.loss?.[history.history.loss.length - 1]?.toFixed(4));
console.log('  最终 acc:', history.history.acc?.[history.history.acc.length - 1]?.toFixed(4));

console.log('\n[3/3] 推理测试...');
const testSeq = { data: new Array(T * D).fill(0).map(() => (Math.random() - 0.5) * 0.1), length: T };
const probs = await model.predict(testSeq);
console.log('  输出概率分布维度:', probs.length);
console.log('  argmax:', probs.indexOf(Math.max(...probs)));
console.log('  sum(probs):', probs.reduce((a, b) => a + b, 0).toFixed(4));

console.log('\n✅ 所有测试通过！');
model.dispose();
process.exit(0);
