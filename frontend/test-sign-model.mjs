// 测试 SignModel: 构建、训练、推理
import * as tf from '@tensorflow/tfjs';
import { SignModel, MODEL_TIMESTEPS, MODEL_FEATURE_DIM } from './src/modules/recognition/SignModel.js';

console.log('=== 手语识别模型测试 ===');
console.log('TF.js 版本:', tf.version.tfjs);

// 使用 CPU 后端
await tf.setBackend('cpu');
await tf.ready();
console.log('Backend:', tf.getBackend());

const NUM_CLASSES = 5;
const SAMPLES_PER_CLASS = 30;

// 生成合成训练数据
console.log(`\n[1/4] 生成训练数据: ${NUM_CLASSES} 类 × ${SAMPLES_PER_CLASS} 样本`);

function generateSample(classIdx) {
  const sequence = [];
  const center = (classIdx - NUM_CLASSES / 2) * 0.1;
  for (let t = 0; t < MODEL_TIMESTEPS; t++) {
    const frame = [];
    for (let f = 0; f < MODEL_FEATURE_DIM; f++) {
      // 不同类有不同的中心，添加噪声
      frame.push(center + (Math.random() - 0.5) * 0.05);
    }
    sequence.push(frame);
  }
  return sequence;
}

const xData = [];
const yData = [];
for (let c = 0; c < NUM_CLASSES; c++) {
  for (let s = 0; s < SAMPLES_PER_CLASS; s++) {
    xData.push(generateSample(c));
    yData.push(c);
  }
}
console.log('  输入形状:', `${xData.length} × ${MODEL_TIMESTEPS} × ${MODEL_FEATURE_DIM}`);

// 构建模型
console.log('\n[2/4] 构建 LSTM 模型...');
const model = new SignModel();
model.build(NUM_CLASSES);
console.log('  类别数:', NUM_CLASSES);

// 训练模型
console.log(`\n[3/4] 训练 10 个 epoch...`);
const startTime = Date.now();
const history = await model.train(xData, yData, 10);
console.log(`  训练耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
const finalLoss = history.history.loss?.[history.history.loss.length - 1];
const finalAcc = history.history.accuracy?.[history.history.acc.length - 1];
console.log(`  最终 loss: ${finalLoss?.toFixed(4)}, acc: ${finalAcc?.toFixed(4)}`);

// 推理测试
console.log('\n[4/4] 推理测试...');
let correct = 0;
const TEST_SAMPLES = 20;
for (let i = 0; i < TEST_SAMPLES; i++) {
  const trueClass = i % NUM_CLASSES;
  const testData = {
    data: generateSample(trueClass).flat(),
    length: MODEL_TIMESTEPS,
  };
  const probs = await model.predict(testData);
  const predicted = probs.indexOf(Math.max(...probs));
  if (predicted === trueClass) correct++;
  console.log(`  测试 ${i + 1}: 真实=${trueClass}, 预测=${predicted}, 置信度=${(probs[predicted] * 100).toFixed(1)}%`);
}
console.log(`\n  测试准确率: ${correct}/${TEST_SAMPLES} (${(correct / TEST_SAMPLES * 100).toFixed(0)}%)`);

model.dispose();
console.log('\n=== 测试完成 ===');
process.exit(0);
