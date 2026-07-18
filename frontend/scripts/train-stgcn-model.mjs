/**
 * ST-GCN 模型训练脚本（Node.js 环境）
 *
 * 用途：
 *   生成合成训练数据 → 训练 ST-GCN 模型 → 保存到 frontend/public/models/stgcn/
 *   训练完成后，STGCNRecognizer.init() 会从 /models/stgcn/model.json 加载预训练模型
 *
 * 运行方式：
 *   cd frontend
 *   node scripts/train-stgcn-model.mjs
 *   或：node scripts/train-stgcn-model.mjs --epochs=80 --samples=150
 *
 * 输出文件：
 *   - frontend/public/models/stgcn/model.json  （模型拓扑 + 权重清单）
 *   - frontend/public/models/stgcn/weights.bin （权重二进制）
 *   - frontend/public/models/stgcn/labelMap.json（标签映射）
 *   - frontend/public/models/stgcn/training-report.json（训练报告）
 *
 * 环境要求：
 *   - Node.js 22+（支持原生 TS 类型擦除）
 *   - 优先使用 @tensorflow/tfjs-node 原生 C++ 后端（oneDNN 优化），自动回退到 tfjs CPU 后端
 *   - Node 24 兼容性：自动补丁 util.isNullOrUndefined / util.isArray（tfjs-node 4.22 依赖）
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trainSTGCN } from '../src/modules/recognition/stgcn_train.ts';

// ===== Node 24 兼容性补丁 =====
// tfjs-node 4.22 使用了 Node 22+ 已完全移除的 util.isNullOrUndefined / util.isArray
// 必须在动态 import('@tensorflow/tfjs-node') 之前执行，利用 CJS 模块缓存生效
const require_ = createRequire(import.meta.url);
const nodeUtil = require_('util');
if (typeof nodeUtil.isNullOrUndefined !== 'function') {
  nodeUtil.isNullOrUndefined = (v) => v === null || v === undefined;
}
if (typeof nodeUtil.isArray !== 'function') {
  nodeUtil.isArray = Array.isArray;
}

// ===== 加载 TF.js 后端 =====
// 优先使用 tfjs-node 原生 C++ 后端（oneDNN 优化，训练速度显著提升）
// 加载失败时回退到 @tensorflow/tfjs CPU 纯 JS 后端
let tf;
let backendName;
try {
  tf = await import('@tensorflow/tfjs-node');
  backendName = 'tensorflow';
} catch (err) {
  console.warn(`[警告] @tensorflow/tfjs-node 加载失败，回退到 tfjs CPU 后端: ${err.message}`);
  tf = await import('@tensorflow/tfjs');
  backendName = 'cpu';
}

// ===== 路径常量 =====

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** 模型输出目录：frontend/public/models/stgcn/ */
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'models', 'stgcn');
/** model.json 路径 */
const MODEL_JSON_PATH = path.join(OUTPUT_DIR, 'model.json');
/** weights.bin 路径 */
const WEIGHTS_BIN_PATH = path.join(OUTPUT_DIR, 'weights.bin');
/** labelMap.json 路径 */
const LABEL_MAP_PATH = path.join(OUTPUT_DIR, 'labelMap.json');
/** training-report.json 路径 */
const REPORT_PATH = path.join(OUTPUT_DIR, 'training-report.json');

// ===== 命令行参数解析 =====

/** 解析 --key=value 形式的命令行参数 */
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([a-zA-Z-]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      args[key] = Number.isNaN(Number(value)) ? value : Number(value);
    }
  }
  return args;
}

// ===== 工具函数 =====

/** 带时间戳的日志输出 */
function log(message) {
  const time = new Date().toTimeString().slice(0, 8);
  console.log(`[${time}] ${message}`);
}

/** 确保输出目录存在 */
function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/** 格式化字节数为人类可读单位 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ===== 文件系统保存处理器 =====

/**
 * 创建 tf.io.IOHandler，将模型保存到文件系统
 * 输出 model.json + weights.bin，可被浏览器端 tf.loadLayersModel('/models/stgcn/model.json') 加载
 */
function createFileSystemSaveHandler() {
  return tf.io.withSaveHandler(async (artifacts) => {
    // 1. 写入 weights.bin
    const weightData = artifacts.weightData;
    const weightBuffer = Buffer.from(
      weightData instanceof ArrayBuffer ? weightData : weightData.buffer,
    );
    fs.writeFileSync(WEIGHTS_BIN_PATH, weightBuffer);

    // 2. 构建并写入 model.json
    const modelJSON = {
      modelTopology: artifacts.modelTopology,
      format: artifacts.format,
      generatedBy: artifacts.generatedBy,
      convertedBy: artifacts.convertedBy,
      weightsManifest: [
        {
          paths: ['weights.bin'],
          weights: artifacts.weightSpecs,
        },
      ],
    };
    fs.writeFileSync(MODEL_JSON_PATH, JSON.stringify(modelJSON, null, 2));

    log(`模型已保存: ${MODEL_JSON_PATH}`);
    log(`权重已保存: ${WEIGHTS_BIN_PATH} (${formatBytes(weightBuffer.length)})`);

    return {
      modelArtifactsInfo: {
        dateSaved: new Date(),
        modelTopologyType: 'JSON',
        weightDataBytes: weightBuffer.length,
      },
    };
  });
}

// ===== 主流程 =====

async function main() {
  const args = parseArgs(process.argv);

  log('===== ST-GCN 模型训练脚本 =====');
  // tfjs-node 加载成功时 tf.version 含 'tfjs-node' 字段，否则仅有 tfjs 版本
  const tfjsNodeVer = tf.version['tfjs-node'] ? ` (tfjs-node ${tf.version['tfjs-node']})` : '';
  log(`TF.js 版本: ${tf.version.tfjs}${tfjsNodeVer}`);
  log(`Node 版本: ${process.version}`);
  log(`输出目录: ${OUTPUT_DIR}`);

  // 设置后端：tfjs-node 加载时已注册 'tensorflow' 后端，此处确保切换并就绪
  await tf.setBackend(backendName);
  await tf.ready();
  log(`TF.js 后端: ${tf.getBackend()}`);

  // 准备输出目录
  ensureOutputDir();

  // 训练参数（命令行可覆盖）
  // 默认配置基于实测：200 样本/类 × 10 类 = 2000 总样本，100 epoch + lr=0.005
  // 实测结果：train acc 87.94%，val acc 88.50%，独立测试集 acc 83.50%（13.2 分钟）
  // 准确率随 epoch 增长曲线：50ep→70%，76ep→85%，100ep→88.5%（val）
  // 训练时间约 8 秒/epoch，100 epoch ≈ 13 分钟（在 15 分钟硬上限内）
  const samplesPerGesture = args.samples ?? 200;
  const epochs = args.epochs ?? 100;
  const batchSize = args.batchSize ?? 32;
  const learningRate = args.lr ?? 0.005;

  log(`训练参数: samplesPerGesture=${samplesPerGesture}, epochs=${epochs}, batchSize=${batchSize}, lr=${learningRate}`);
  log('----------------------------------------');

  // 执行训练
  const result = await trainSTGCN({
    samplesPerGesture,
    epochs,
    batchSize,
    learningRate,
    saveToIndexedDB: false, // Node.js 环境无 IndexedDB
    saveHandler: createFileSystemSaveHandler(),
    onLog: (msg) => log(msg),
    onLabelMap: (labelMap) => {
      fs.writeFileSync(LABEL_MAP_PATH, JSON.stringify(labelMap, null, 2));
      log(`标签映射已保存: ${LABEL_MAP_PATH}`);
    },
  });

  // 写入训练报告
  const report = {
    modelFormat: 'stgcn-v1',
    tfjsVersion: tf.version.tfjs,
    nodeVersion: process.version,
    backend: tf.getBackend(),
    trainingParams: {
      samplesPerGesture,
      epochs,
      totalSamples: samplesPerGesture * 10, // 10 类手势
      numClasses: 10,
      numFrames: 30,
      numKeypoints: 21,
      coordDim: 2,
    },
    metrics: {
      finalLoss: result.finalLoss,
      finalAccuracy: result.finalAccuracy,
      evalAccuracy: result.evalAccuracy,
      trainingTimeMs: result.trainingTimeMs,
      trainingTimeSec: result.trainingTimeMs / 1000,
    },
    files: {
      modelJson: 'model.json',
      weightsBin: 'weights.bin',
      labelMap: 'labelMap.json',
    },
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  log(`训练报告已保存: ${REPORT_PATH}`);

  // 释放模型资源
  result.model.dispose();

  log('----------------------------------------');
  log('===== 训练完成 =====');
  log(`最终 loss: ${result.finalLoss.toFixed(4)}`);
  log(`最终 accuracy: ${result.finalAccuracy.toFixed(4)}`);
  log(`测试集 accuracy: ${result.evalAccuracy.toFixed(4)}`);
  log(`训练耗时: ${(result.trainingTimeMs / 1000).toFixed(1)}s`);

  // 输出文件大小
  const modelStat = fs.statSync(MODEL_JSON_PATH);
  const weightsStat = fs.statSync(WEIGHTS_BIN_PATH);
  log(`model.json: ${formatBytes(modelStat.size)}`);
  log(`weights.bin: ${formatBytes(weightsStat.size)}`);

  // 准确率未达标时以非零退出码提醒（但仍保留生成的文件）
  if (result.evalAccuracy < 0.85) {
    log(`⚠️ 评估准确率 ${result.evalAccuracy.toFixed(4)} 低于目标 0.85，建议增加 epochs 或 samples`);
    process.exit(2);
  }

  process.exit(0);
}

// 异常处理
main().catch((err) => {
  console.error('训练失败:', err);
  process.exit(1);
});
