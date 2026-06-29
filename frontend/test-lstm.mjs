// 独立测试：模拟 SignModel 的 LSTM 分类流程
import * as tf from '@tensorflow/tfjs';

console.log('=== 手语识别 LSTM 模型测试 ===');
console.log('TF.js 版本:', tf.version.tfjs);

await tf.setBackend('cpu');
await tf.ready();
console.log('Backend:', tf.getBackend());

const TIMESTEPS = 30;
const FEATURE_DIM = 126;
const NUM_CLASSES = 5;
const SAMPLES_PER_CLASS = 30;
const EPOCHS = 5;

// 生成合成数据：每个类别有独特的时空特征模式
function generateSample(classIdx) {
  const sequence = [];
  const center = (classIdx - NUM_CLASSES / 2) * 0.15;
  const frequency = 0.1 + classIdx * 0.05;
  for (let t = 0; t < TIMESTEPS; t++) {
    const frame = [];
    for (let f = 0; f < FEATURE_DIM; f++) {
      const temporalSignal = Math.sin((t / TIMESTEPS) * Math.PI * 2 * (classIdx + 1)) * 0.1;
      frame.push(center + temporalSignal + (Math.random() - 0.5) * 0.03);
    }
    sequence.push(frame);
  }
  return sequence;
}

console.log(`\n[1/4] 生成 ${NUM_CLASSES} 类 × ${SAMPLES_PER_CLASS} 训练样本`);
const xTrain = [];
const yTrain = [];
for (let c = 0; c < NUM_CLASSES; c++) {
  for (let s = 0; s < SAMPLES_PER_CLASS; s++) {
    xTrain.push(generateSample(c));
    yTrain.push(c);
  }
}
console.log(`  形状: [${xTrain.length}, ${TIMESTEPS}, ${FEATURE_DIM}]`);

// 构建模型
console.log('\n[2/4] 构建 LSTM 模型...');
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
console.log('  模型参数:');
model.summary();

// 转换标签为 one-hot 编码
console.log('\n[3/4] 训练模型...');
const xs = tf.tensor3d(xTrain, undefined, 'float32');
const oneHotLabels = new Float32Array(yTrain.length * NUM_CLASSES);
for (let i = 0; i < yTrain.length; i++) {
  oneHotLabels[i * NUM_CLASSES + yTrain[i]] = 1.0;
}
const ys = tf.tensor2d(oneHotLabels, [yTrain.length, NUM_CLASSES], 'float32');

const startTime = Date.now();
const history = await model.fit(xs, ys, {
  epochs: EPOCHS,
  batchSize: 32,
  validationSplit: 0.2,
  shuffle: true,
});
console.log(`  训练耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

const losses = history.history.loss || [];
const accs = history.history.acc || [];
console.log(`  初始 loss: ${losses[0]?.toFixed(4)}, 最终: ${losses[losses.length - 1]?.toFixed(4)}`);
console.log(`  初始 acc:  ${accs[0]?.toFixed(4)}, 最终: ${accs[accs.length - 1]?.toFixed(4)}`);

// 推理测试
console.log('\n[4/4] 推理测试...');
let correct = 0;
const TEST_SAMPLES = 15;
for (let i = 0; i < TEST_SAMPLES; i++) {
  const trueClass = i % NUM_CLASSES;
  const newSample = generateSample(trueClass);
  const testTensor = tf.tensor3d([newSample], undefined, 'float32');
  const output = model.predict(testTensor);
  const probs = Array.from(await output.data());
  testTensor.dispose();
  
  const predicted = probs.indexOf(Math.max(...probs));
  const confidence = probs[predicted] * 100;
  const isCorrect = predicted === trueClass;
  if (isCorrect) correct++;
  
  console.log(
    `  ${isCorrect ? '✓' : '✗'} 真实=${trueClass}, 预测=${predicted}, 置信度=${confidence.toFixed(1)}%`,
  );
}

console.log(`\n  ========== 结果 ==========`);
console.log(`  测试准确率: ${correct}/${TEST_SAMPLES} (${(correct / TEST_SAMPLES * 100).toFixed(0)}%)`);

xs.dispose();
ys.dispose();
model.dispose();

console.log('\n=== 测试完成 ===');
process.exit(0);
