/**
 * ST-GCN 模型构建模块 —— 与运行环境无关的纯 TF.js 代码
 *
 * 设计目的：
 *   将图卷积层、邻接矩阵构建、模型组装逻辑从 STGCNRecognizer.ts 抽离，
 *   使 Node.js 训练脚本可以直接 import 而不引入 @mediapipe/tasks-vision 等浏览器依赖。
 *
 * 依赖：
 *   - @tensorflow/tfjs
 *   - ./stgcn_data （仅常量与只读数据，无副作用）
 *
 * 架构：
 *   输入 (batch, 30, 21, 2) →
 *   空间图卷积 1 (21 节点, 2→64 通道) → ReLU →
 *   空间图卷积 2 (21 节点, 64→128 通道) → ReLU →
 *   时间卷积 (kernel=3, 128→256 通道) → ReLU →
 *   全局平均池化 →
 *   全连接 (256→numClasses) → Softmax
 *
 * 空间图卷积实现：X' = D^(-1/2) (A+I) D^(-1/2) X W
 */

import * as tf from '@tensorflow/tfjs';
// 显式 .ts 扩展名以兼容 Node.js ESM 解析（Vite 同样支持）
import {
  HAND_EDGES,
  NUM_KEYPOINTS,
  NUM_FRAMES,
  COORD_DIM,
  NUM_CLASSES,
} from './stgcn_data.ts';

/** 模型在 IndexedDB 中的存储路径 */
export const STGCN_MODEL_PATH = 'indexeddb://stgcn-gesture-model';

/** 浏览器端可加载的预训练模型 JSON 路径（相对站点根） */
export const STGCN_MODEL_HTTP_URL = '/models/stgcn/model.json';

/** 标签映射 JSON 路径（与模型同目录） */
export const STGCN_LABEL_MAP_URL = '/models/stgcn/labelMap.json';

// ===== 邻接矩阵构建 =====

/** 归一化邻接矩阵缓存（纯数据，避免跨 scope 张量生命周期问题） */
let adjNormDataCache: number[][] | null = null;

/**
 * 构建 21×21 归一化邻接矩阵的纯数据
 * 1. 根据骨骼边构建对称邻接矩阵 A
 * 2. 添加自环 A' = A + I
 * 3. 对称归一化：D^(-1/2) A' D^(-1/2)
 *
 * 返回 number[][] 而非 tf.Tensor，由调用方在 tf.tidy 内部转换为张量，
 * 确保张量生命周期与 tidy scope 一致。
 */
function getAdjNormData(): number[][] {
  if (adjNormDataCache) return adjNormDataCache;

  const N = NUM_KEYPOINTS;
  const adj: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  // 填充邻接矩阵（无向图，对称）
  for (const [i, j] of HAND_EDGES) {
    adj[i][j] = 1;
    adj[j][i] = 1;
  }
  // 添加自环
  for (let i = 0; i < N; i++) adj[i][i] = 1;

  // 计算度矩阵并对称归一化
  const degree = adj.map((row) => row.reduce((s, v) => s + v, 0));
  const normalized = adj.map((row, i) =>
    row.map((v, j) => v / Math.sqrt(degree[i] * degree[j] || 1)),
  );

  adjNormDataCache = normalized;
  return normalized;
}

// ===== 自定义图卷积层 =====

/** 空间图卷积层配置 */
interface GraphConvConfig {
  units: number;
  name?: string;
}

/**
 * 空间图卷积层
 * X' = A_norm @ (X @ W)
 *   X: (batch, frames, 21, in_channels)
 *   W: (in_channels, out_channels)
 *   A_norm: (21, 21) 归一化邻接矩阵
 *   输出: (batch, frames, 21, out_channels)
 */
export class GraphConvLayer extends tf.layers.Layer {
  /** 序列化类名（registerClass 需要） */
  static className = 'GraphConv';

  private units: number;
  private kernel: tf.LayerVariable | null = null;

  constructor(config: GraphConvConfig) {
    super({ name: config.name });
    this.units = config.units;
  }

  build(inputShape: tf.Shape | tf.Shape[]): void {
    const shape = inputShape as tf.Shape;
    const inChannels = shape[shape.length - 1] as number;
    this.kernel = this.addWeight(
      'kernel',
      [inChannels, this.units],
      'float32',
      tf.initializers.glorotNormal({}),
    );
    super.build(inputShape);
  }

  computeOutputShape(inputShape: tf.Shape | tf.Shape[]): tf.Shape | tf.Shape[] {
    const shape = inputShape as tf.Shape;
    return [...shape.slice(0, -1), this.units];
  }

  call(inputs: tf.Tensor | tf.Tensor[], _kwargs: { [key: string]: unknown }): tf.Tensor | tf.Tensor[] {
    const x = (Array.isArray(inputs) ? inputs[0] : inputs) as tf.Tensor4D;
    const w = this.kernel!.read();
    const [B, F, N, inCh] = x.shape as number[];
    const outCh = this.units;

    // 全部用 2D matMul 实现，避免：
    //   - 3D×2D matMul 的 BatchMatMul 梯度形状不匹配
    //   - tf.einsum 在 TF.js 4.22 无梯度函数
    // 邻接矩阵在 tidy 内从纯数据创建，避免缓存张量跨 scope 的 moveData 错误
    return tf.tidy(() => {
      // 1. X @ W: (B,F,N,inCh) @ (inCh,outCh) → (B,F,N,outCh)
      //    展平为 (B*F*N, inCh) × (inCh, outCh) 的 2D matMul
      const x2d = x.reshape([B * F * N, inCh]);
      const xw2d = tf.matMul(x2d, w);
      const xw = xw2d.reshape([B, F, N, outCh]);

      // 2. A @ XW: (N,N) @ (B,F,N,outCh) → (B,F,N,outCh)
      //    转置让 N 成为 matMul 的首维：(B,F,N,outCh) → (N,B,F,outCh) → (N, B*F*outCh)
      const xwPerm = tf.transpose(xw, [2, 0, 1, 3]); // (N, B, F, outCh)
      const xwMat = xwPerm.reshape([N, B * F * outCh]);
      const adj = tf.tensor2d(getAdjNormData(), [N, N], 'float32');
      const axwMat = tf.matMul(adj, xwMat); // (N, B*F*outCh)
      // 还原形状：(N, B, F, outCh) → (B, F, N, outCh)
      const axwPerm = axwMat.reshape([N, B, F, outCh]);
      const axw = tf.transpose(axwPerm, [1, 2, 0, 3]);
      return axw;
    });
  }

  getClassName(): string {
    return 'GraphConv';
  }

  getConfig(): tf.serialization.ConfigDict {
    const config = super.getConfig();
    config.units = this.units;
    return config;
  }
}

/** 是否已注册过 GraphConv 自定义层（避免重复注册） */
let graphConvRegistered = false;

/**
 * 注册 GraphConv 自定义层
 * 加载含 GraphConv 层的模型前必须调用一次，否则反序列化会失败
 */
export function registerGraphConvLayer(): void {
  if (graphConvRegistered) return;
  // GraphConvLayer 通过继承获得 Container.fromConfig（4 参数泛型签名），
  // TS 无法正确推断其满足 SerializableConstructor 的 2 参数约束，故使用类型断言
  tf.serialization.registerClass(
    GraphConvLayer as unknown as Parameters<typeof tf.serialization.registerClass>[0],
  );
  graphConvRegistered = true;
}

// 模块加载时自动注册一次，确保浏览器端 STGCNRecognizer 直接可用
registerGraphConvLayer();

// ===== ST-GCN 模型构建 =====

/**
 * 构建 ST-GCN 模型
 * @param numClasses 输出类别数，默认 NUM_CLASSES
 * @returns 未编译的 LayersModel（训练前需 compile）
 */
export function buildSTGCNModel(numClasses: number = NUM_CLASSES): tf.LayersModel {
  const input = tf.input({ shape: [NUM_FRAMES, NUM_KEYPOINTS, COORD_DIM] });

  // 空间图卷积 1: 2 → 64 通道
  const gcn1 = new GraphConvLayer({ units: 64, name: 'gcn1' }).apply(input);
  const relu1 = tf.layers.reLU().apply(gcn1);

  // 空间图卷积 2: 64 → 128 通道
  const gcn2 = new GraphConvLayer({ units: 128, name: 'gcn2' }).apply(relu1);
  const relu2 = tf.layers.reLU().apply(gcn2);

  // 时间卷积: 128 → 256 通道, kernel=(3,1) 沿时间轴滑动
  const tempConv = tf.layers
    .conv2d({
      filters: 256,
      kernelSize: [3, 1],
      strides: [1, 1],
      padding: 'same',
      activation: 'relu',
      name: 'temporal_conv',
    })
    .apply(relu2);

  // 全局平均池化: (B, 30, 21, 256) → (B, 256)
  const pooled = tf.layers.globalAveragePooling2d({}).apply(tempConv);

  // 全连接分类层: 256 → numClasses
  const output = tf.layers
    .dense({ units: numClasses, activation: 'softmax', name: 'classifier' })
    .apply(pooled);

  const model = tf.model({ inputs: input, outputs: output as tf.SymbolicTensor });
  return model;
}
