// 最小化测试脚本：验证 LSTM + one-hot + categoricalCrossentropy 能正常训练
// 使用: cd frontend && node scripts/test-sign-model-simple.mjs

import * as tf from '@tensorflow/tfjs';

console.log('[TF.js 版本]', tf.version.tfjs);

await tf.setBackend('cpu');
await tf.ready();
console.log('[Backend]', tf.getBackend());

const TIMESTEPS = 30;
const FEATURE_DIM = 126;
const NUM_CLASSES = 5;
const SAMPLES = 50;
const EPOCHS = 5;

// 1) 构建模型
console.log('\n[1/4] 构建 LSTM 模型...');
const model = tf.sequential();
model.add(tf.layers.lstm({ units: 128, returnSequences: true, inputShape: [TIMESTEPS, FEATURE_DIM] }));
model.add(tf.layers.lstm({ units: 64, returnSequences: false }));
model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
model.add(tf.layers.dropout({ rate: 0.3 }));
model.add(tf.layers.dense({ units: NUM_CLASSES, activation: 'softmax' }));

model.compile({
  optimizer: tf.train.adam(0.001),
  loss: 'categoricalCrossentropy',
  metrics: ['accuracy'],
});
console.log('  已构建');

// 2) 构造训练数据：xs float32, ys one-hot float32
console.log('\n[2/4] 生成训练数据...');
const rawX = new Float32Array(SAMPLES * TIMESTEPS * FEATURE_DIM);
const rawY = new Float32Array(SAMPLES * NUM_CLASSES);
for (let s = 0; s < SAMPLES; s++) {
  const cls = s % NUM_CLASSES;
  const offset = (cls - NUM_CLASSES / 2) * 0.2;
  for (let t = 0; t < TIMESTEPS; t++) {
    for (let f = 0; f < FEATURE_DIM; f++) {
      rawX[s * TIMESTEPS * FEATURE_DIM + t * FEATURE_DIM + f] =
        offset + (Math.random() - 0.5) * 0.1;
    }
  }
  rawY[s * NUM_CLASSES + cls] = 1.0;
}
const xs = tf.tensor3d(rawX, [SAMPLES, TIMESTEPS, FEATURE_DIM], 'float32');
const ys = tf.tensor2d(rawY, [SAMPLES, NUM_CLASSES], 'float32');
console.log('  xs shape:', xs.shape, 'dtype:', xs.dtype);
console.log('  ys shape:', ys.shape, 'dtype:', ys.dtype);

// 3) 训练
console.log(`\n[3/4] 训练 ${EPOCHS} 轮...`);
const start = Date.now();
let finalLoss = 'N/A';
let finalAcc = 'N/A';
for (let e = 0; e < EPOCHS; e++) {
  const hist = await model.fit(xs, ys, { epochs: 1, batchSize: 16, shuffle: true, verbose: 0 });
  finalLoss = Number(hist.history.loss?.[0]).toFixed(4);
  finalAcc = Number(hist.history.acc?.[0]).toFixed(4);
  console.log(`  epoch ${e + 1}/${EPOCHS}: loss=${finalLoss}, acc=${finalAcc}`);
}
console.log(`  训练完成，用时 ${((Date.now() - start) / 1000).toFixed(1)}s`);

// 4) 推理
console.log('\n[4/4] 推理测试...');
const testData = new Float32Array(TIMESTEPS * FEATURE_DIM).map(() => (Math.random() - 0.5) * 0.1);
const input = tf.tensor3d(testData, [1, TIMESTEPS, FEATURE_DIM], 'float32');
const output = model.predict(input);
const probs = Array.from(await output.data());
console.log('  推理完成，输出维度:', probs.length);
console.log('  sum(probs):', probs.reduce((a, b) => a + b, 0).toFixed(4));
console.log('  argmax:', probs.indexOf(Math.max(...probs)));

xs.dispose();
ys.dispose();
input.dispose();
output.dispose();
model.dispose();

console.log('\n✅ 全部通过！模型能正常构建、训练并推理');
