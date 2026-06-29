// 训练数据生成器：基于词汇参数合成关键点序列并做数据增强
// 由于没有真实手语视频，使用参数化合成 + 随机增强生成训练样本

import type { SignGloss } from '@/types/sign';
import type { HandKeypoint, FrameKeypoints, KeypointSequence } from '@/types/recognition';
import { Normalizer } from './Normalizer';
import { DataAugmentor } from './DataAugmentor';
import { vocabularyStore } from '@/modules/data/VocabularyStore';
import { initializeVocabulary } from '@/modules/data/DataInitializer';
import { appConfig } from '@/config';

/** 每只手关键点数 */
const KEYPOINTS_PER_HAND = 21;
/** 每帧维度（双手 126） */
const DIMS_PER_FRAME = 126;
/** 合成序列基础帧数 */
const BASE_FRAMES = 30;
/** 每个词汇生成的增强样本数范围 */
const MIN_SAMPLES = 20;
const MAX_SAMPLES = 50;
/** 词汇数据 JSON 路径（从环境配置读取） */
const VOCABULARY_JSON_URL = appConfig.vocabularyUrl;

/** 训练数据生成结果 */
export interface TrainingData {
  /** 输入数据 [样本数, T, 126] */
  x: number[][][];
  /** 标签（类别索引） */
  y: number[];
  /** 标签列表（gloss_id），索引对应 y 中的值 */
  labels: string[];
}

/**
 * 训练数据生成器
 * 根据词汇的手形、位置、运动参数合成关键点序列，
 * 并通过随机增强扩充样本量。
 */
export class TrainingDataGenerator {
  private readonly normalizer = new Normalizer();
  private readonly augmentor = new DataAugmentor();

  /**
   * 生成完整训练数据集
   * 1. 加载词汇数据
   * 2. 对每个词汇生成 20-50 个增强样本
   * 3. 归一化所有样本
   */
  async generate(): Promise<TrainingData> {
    const glosses = await this.loadVocabulary();

    const x: number[][][] = [];
    const y: number[] = [];
    const labels: string[] = [];

    for (let classIndex = 0; classIndex < glosses.length; classIndex++) {
      const gloss = glosses[classIndex];
      labels.push(gloss.gloss_id);

      // 随机决定该词汇的样本数（20-50）
      const sampleCount = MIN_SAMPLES + Math.floor(Math.random() * (MAX_SAMPLES - MIN_SAMPLES + 1));

      for (let s = 0; s < sampleCount; s++) {
        // 生成基础合成序列并施加随机增强
        const augmented = this.generateAugmentedSequence(gloss);
        // 转换为 KeypointSequence 并归一化
        const sequence = this.toKeypointSequence(augmented);
        const normalized = this.normalizer.normalize(sequence);
        // 将一维 [T*126] 重塑为 [T, 126]
        const reshaped = this.reshape(normalized.data, normalized.length);
        x.push(reshaped);
        y.push(classIndex);
      }
    }

    return { x, y, labels };
  }

  /**
   * 根据词汇参数生成合成关键点序列
   * @param gloss 词汇定义
   * @returns [帧数, 126] 的原始关键点坐标（未归一化）
   */
  generateSyntheticSequence(gloss: SignGloss): number[][] {
    const frames: number[][] = [];
    const startHand = this.getHandShape(gloss.manual.handshape_start);
    const endHand = this.getHandShape(gloss.manual.handshape_end);
    const startPos = this.getLocation(gloss.manual.location_start);
    const endPos = this.getLocation(gloss.manual.location_end);
    const movement = gloss.manual.movement;

    for (let t = 0; t < BASE_FRAMES; t++) {
      const progress = BASE_FRAMES > 1 ? t / (BASE_FRAMES - 1) : 0;
      // 插值手形：从起始手形过渡到结束手形
      const handShape = this.interpolateHand(startHand, endHand, progress);
      // 插值位置：根据运动类型计算轨迹
      const position = this.computeTrajectory(startPos, endPos, movement, progress);

      // 生成单手关键点（平移到手形位置）
      const hand = handShape.map((kp) => ({
        x: kp.x + position.x,
        y: kp.y + position.y,
        z: kp.z,
      }));

      // 构建帧：主导手放置关键点，非主导手按是否双手决定
      const frame = this.buildFrame(hand, gloss);
      frames.push(frame);
    }

    return frames;
  }

  /**
   * 加载词汇数据
   * 优先从 public/data/vocabulary.json 读取，失败则回退到 VocabularyStore（IndexedDB）
   */
  private async loadVocabulary(): Promise<SignGloss[]> {
    // 尝试从静态 JSON 加载
    try {
      const response = await fetch(VOCABULARY_JSON_URL);
      if (response.ok) {
        const data = await response.json();
        if (data.vocabulary && data.vocabulary.length > 0) {
          return data.vocabulary as SignGloss[];
        }
      }
    } catch {
      // JSON 不可用，回退到 VocabularyStore
    }

    // 回退：从 IndexedDB 加载（确保已初始化）
    await initializeVocabulary();
    const all = await vocabularyStore.getAll();
    if (all.length === 0) {
      throw new Error('词汇数据为空，请先初始化词汇数据');
    }
    return all;
  }

  /**
   * 生成增强后的合成序列
   * 在基础序列上施加随机平移、缩放、旋转、噪声、时间扭曲
   * 再通过 DataAugmentor 施加进阶增强（镜像、遮挡、Mixup 等）
   */
  private generateAugmentedSequence(gloss: SignGloss): number[][] {
    const base = this.generateSyntheticSequence(gloss);
    // 基础增强参数
    const tx = (Math.random() - 0.5) * 0.1; // 平移 x
    const ty = (Math.random() - 0.5) * 0.1; // 平移 y
    const scale = 0.9 + Math.random() * 0.2; // 缩放 0.9-1.1
    const angle = (Math.random() - 0.5) * 0.3; // 旋转角度（弧度）
    const noiseLevel = 0.005 + Math.random() * 0.01; // 噪声幅度
    const speedFactor = 0.8 + Math.random() * 0.4; // 时间扭曲因子

    // 时间扭曲：重采样帧序列
    const warped = this.timeWarp(base, speedFactor);

    // 对每帧施加空间增强
    const spatiallyAugmented = warped.map((frame) => this.augmentFrame(frame, tx, ty, scale, angle, noiseLevel));

    // 进阶增强：镜像、遮挡、Mixup、高斯噪声、时序抖动
    return this.augmentor.augment(spatiallyAugmented, gloss);
  }

  /** 对单帧施加平移、缩放、旋转、噪声 */
  private augmentFrame(
    frame: number[],
    tx: number,
    ty: number,
    scale: number,
    angle: number,
    noiseLevel: number,
  ): number[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const result: number[] = [];

    for (let i = 0; i < frame.length; i += 3) {
      let x = frame[i];
      let y = frame[i + 1];
      const z = frame[i + 2];

      // 缩放
      x *= scale;
      y *= scale;
      // 旋转（绕中心点 0.5, 0.5）
      const dx = x - 0.5;
      const dy = y - 0.5;
      x = 0.5 + dx * cos - dy * sin;
      y = 0.5 + dx * sin + dy * cos;
      // 平移
      x += tx;
      y += ty;
      // 噪声
      x += (Math.random() - 0.5) * noiseLevel;
      y += (Math.random() - 0.5) * noiseLevel;
      const nz = z + (Math.random() - 0.5) * noiseLevel;

      result.push(x, y, nz);
    }
    return result;
  }

  /** 时间扭曲：按速度因子重采样帧序列 */
  private timeWarp(frames: number[][], speedFactor: number): number[][] {
    const srcLen = frames.length;
    const dstLen = Math.max(2, Math.round(srcLen / speedFactor));
    const result: number[][] = [];

    for (let i = 0; i < dstLen; i++) {
      const srcPos = (i / (dstLen - 1)) * (srcLen - 1);
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;
      const nextIdx = Math.min(srcIdx + 1, srcLen - 1);
      // 线性插值
      const frame: number[] = [];
      for (let d = 0; d < DIMS_PER_FRAME; d++) {
        frame.push(frames[srcIdx][d] + (frames[nextIdx][d] - frames[srcIdx][d]) * frac);
      }
      result.push(frame);
    }
    return result;
  }

  /**
   * 根据手形名称获取 21 关键点的基础配置
   * 坐标以腕部为原点（0,0），手掌朝上
   */
  private getHandShape(shapeName: string): HandKeypoint[] {
    // 基础开放手形（五指伸展）
    const openHand: HandKeypoint[] = [
      { x: 0, y: 0, z: 0 }, // 0 腕部
      { x: -0.04, y: -0.02, z: 0 }, // 1 拇指 CMC
      { x: -0.07, y: -0.04, z: 0 }, // 2 拇指 MCP
      { x: -0.09, y: -0.06, z: 0 }, // 3 拇指 IP
      { x: -0.10, y: -0.08, z: 0 }, // 4 拇指 TIP
      { x: -0.03, y: -0.08, z: 0 }, // 5 食指 MCP
      { x: -0.03, y: -0.12, z: 0 }, // 6 食指 PIP
      { x: -0.03, y: -0.15, z: 0 }, // 7 食指 DIP
      { x: -0.03, y: -0.18, z: 0 }, // 8 食指 TIP
      { x: 0, y: -0.08, z: 0 }, // 9 中指 MCP
      { x: 0, y: -0.13, z: 0 }, // 10 中指 PIP
      { x: 0, y: -0.16, z: 0 }, // 11 中指 DIP
      { x: 0, y: -0.19, z: 0 }, // 12 中指 TIP
      { x: 0.03, y: -0.08, z: 0 }, // 13 无名指 MCP
      { x: 0.03, y: -0.12, z: 0 }, // 14 无名指 PIP
      { x: 0.03, y: -0.15, z: 0 }, // 15 无名指 DIP
      { x: 0.03, y: -0.17, z: 0 }, // 16 无名指 TIP
      { x: 0.06, y: -0.07, z: 0 }, // 17 小指 MCP
      { x: 0.06, y: -0.10, z: 0 }, // 18 小指 PIP
      { x: 0.06, y: -0.12, z: 0 }, // 19 小指 DIP
      { x: 0.06, y: -0.14, z: 0 }, // 20 小指 TIP
    ];

    // 根据手形名称调整手指弯曲度
    switch (shapeName) {
      case 'fist_a':
        return this.foldFingers(openHand, [1, 1, 1, 1]); // 全部弯曲
      case 'v_shape':
        return this.foldFingers(openHand, [0, 0, 1, 1]); // 食指中指伸展
      case 'index_point':
        return this.foldFingers(openHand, [1, 0, 1, 1]); // 仅食指伸展
      case 'thumb_up':
        return this.foldFingers(openHand, [0, 1, 1, 1]); // 仅拇指伸展
      case 'c_shape':
        return this.makeCShape(openHand);
      case 'o_shape':
        return this.makeOShape(openHand);
      case 'flat_b':
      case 'open_5':
      default:
        return openHand;
    }
  }

  /** 折叠指定手指（弯曲 PIP/DIP 关节） */
  private foldFingers(hand: HandKeypoint[], foldMask: number[]): HandKeypoint[] {
    // foldMask: [拇指, 食指, 中指/无名指/小指] 简化处理
    const result = hand.map((kp) => ({ ...kp }));
    // 食指(5-8)、中指(9-12)、无名指(13-16)、小指(17-20) 的弯曲
    const fingerRanges = [
      [5, 8], // 食指
      [9, 12], // 中指
      [13, 16], // 无名指
      [17, 20], // 小指
    ];
    // foldMask 索引：0=拇指, 1=食指, 2=中指, 3=无名指, 4=小指
    // 这里简化为 4 组（不含拇指），foldMask 长度适配
    for (let f = 0; f < fingerRanges.length; f++) {
      const shouldFold = foldMask[f % foldMask.length] === 1;
      if (!shouldFold) continue;
      const [mcpIdx, tipIdx] = fingerRanges[f];
      const mcp = result[mcpIdx];
      // 将该手指的 PIP/DIP/TIP 向掌心方向弯曲（y 增大，靠近腕部）
      for (let i = mcpIdx + 1; i <= tipIdx; i++) {
        result[i] = {
          x: mcp.x + (result[i].x - mcp.x) * 0.3,
          y: mcp.y - (result[i].y - mcp.y) * 0.3,
          z: result[i].z,
        };
      }
    }
    return result;
  }

  /** C 形手：拇指与食指相对弯曲形成 C */
  private makeCShape(hand: HandKeypoint[]): HandKeypoint[] {
    const result = hand.map((kp) => ({ ...kp }));
    // 拇指尖向内收
    result[4] = { x: -0.05, y: -0.05, z: 0 };
    // 食指弯曲成弧
    result[7] = { x: -0.05, y: -0.10, z: 0 };
    result[8] = { x: -0.04, y: -0.12, z: 0 };
    return result;
  }

  /** O 形手：拇指与食指尖相接 */
  private makeOShape(hand: HandKeypoint[]): HandKeypoint[] {
    const result = hand.map((kp) => ({ ...kp }));
    result[4] = { x: -0.04, y: -0.10, z: 0 };
    result[8] = { x: -0.04, y: -0.10, z: 0 };
    // 其余手指弯曲
    return this.foldFingers(result, [0, 0, 1, 1]);
  }

  /** 位置名称映射到归一化坐标 */
  private getLocation(locationName: string): { x: number; y: number } {
    const locations: Record<string, { x: number; y: number }> = {
      neutral: { x: 0.5, y: 0.5 },
      chest_center: { x: 0.5, y: 0.6 },
      chest_left: { x: 0.35, y: 0.6 },
      chest_right: { x: 0.65, y: 0.6 },
      shoulder_left: { x: 0.3, y: 0.4 },
      shoulder_right: { x: 0.7, y: 0.4 },
      face_level: { x: 0.5, y: 0.3 },
      eye_level: { x: 0.5, y: 0.25 },
      mouth_level: { x: 0.5, y: 0.35 },
      chin_level: { x: 0.5, y: 0.4 },
      forehead_level: { x: 0.5, y: 0.2 },
      abdomen_level: { x: 0.5, y: 0.7 },
      waist_level: { x: 0.5, y: 0.75 },
    };
    return locations[locationName] ?? { x: 0.5, y: 0.5 };
  }

  /** 根据运动类型计算 t 时刻的位置 */
  private computeTrajectory(
    start: { x: number; y: number },
    end: { x: number; y: number },
    movement: string,
    progress: number,
  ): { x: number; y: number } {
    // 线性插值基础位置
    const baseX = start.x + (end.x - start.x) * progress;
    const baseY = start.y + (end.y - start.y) * progress;

    switch (movement) {
      case 'static':
        return start;
      case 'circular': {
        // 圆周运动
        const radius = 0.08;
        const angle = progress * Math.PI * 2;
        return { x: start.x + Math.cos(angle) * radius, y: start.y + Math.sin(angle) * radius };
      }
      case 'upward_arc':
      case 'downward_arc': {
        // 弧形运动：叠加抛物线偏移
        const arcOffset = Math.sin(progress * Math.PI) * 0.08;
        return { x: baseX, y: baseY - arcOffset };
      }
      case 'zigzag': {
        // Z 字形：x 方向叠加正弦
        return { x: baseX + Math.sin(progress * Math.PI * 4) * 0.05, y: baseY };
      }
      case 'upward':
      case 'downward':
      case 'leftward':
      case 'rightward':
      case 'horizontal_line':
      case 'vertical_line':
      case 'toward_body':
      case 'away_from_body':
      default:
        return { x: baseX, y: baseY };
    }
  }

  /** 线性插值两个手形 */
  private interpolateHand(a: HandKeypoint[], b: HandKeypoint[], t: number): HandKeypoint[] {
    return a.map((kp, i) => ({
      x: kp.x + (b[i].x - kp.x) * t,
      y: kp.y + (b[i].y - kp.y) * t,
      z: kp.z + (b[i].z - kp.z) * t,
    }));
  }

  /** 构建单帧 126 维向量：主导手放关键点，另一手按是否双手决定 */
  private buildFrame(hand: HandKeypoint[], gloss: SignGloss): number[] {
    const handFlat = this.flattenHand(hand);
    const zeroHand = new Array(KEYPOINTS_PER_HAND * 3).fill(0);

    if (gloss.manual.is_two_handed) {
      // 双手：两手镜像偏移
      const mirrorHand = hand.map((kp) => ({ ...kp, x: -kp.x }));
      const mirrorFlat = this.flattenHand(mirrorHand);
      // 主导手在前
      return gloss.manual.dominant_hand === 'left'
        ? [...handFlat, ...mirrorFlat]
        : [...mirrorFlat, ...handFlat];
    }
    // 单手：仅主导手有关键点
    return gloss.manual.dominant_hand === 'left'
      ? [...handFlat, ...zeroHand]
      : [...zeroHand, ...handFlat];
  }

  /** 将 HandKeypoint[] 展平为 63 维数组 */
  private flattenHand(hand: HandKeypoint[]): number[] {
    const coords: number[] = [];
    for (const kp of hand) {
      coords.push(kp.x, kp.y, kp.z);
    }
    return coords;
  }

  /** 将 [帧数, 126] 的原始数据转换为 KeypointSequence */
  private toKeypointSequence(frames: number[][]): KeypointSequence {
    const frameKeypoints: FrameKeypoints[] = frames.map((frame, i) => {
      const left = this.unflattenHand(frame.slice(0, KEYPOINTS_PER_HAND * 3));
      const right = this.unflattenHand(frame.slice(KEYPOINTS_PER_HAND * 3));
      return { left_hand: left, right_hand: right, timestamp: i * 33 };
    });
    return { frames: frameKeypoints, fps: 30 };
  }

  /** 将 63 维数组还原为 HandKeypoint[]，全 0 时返回 null */
  private unflattenHand(flat: number[]): HandKeypoint[] | null {
    const isAllZero = flat.every((v) => v === 0);
    if (isAllZero) return null;
    const hand: HandKeypoint[] = [];
    for (let i = 0; i < flat.length; i += 3) {
      hand.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2] });
    }
    return hand;
  }

  /** 将一维 [T*126] 重塑为 [T, 126] */
  private reshape(data: number[], length: number): number[][] {
    const result: number[][] = [];
    for (let t = 0; t < length; t++) {
      result.push(data.slice(t * DIMS_PER_FRAME, (t + 1) * DIMS_PER_FRAME));
    }
    return result;
  }
}
