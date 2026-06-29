/**
 * 基于关键点几何规则的手势识别器（JSON 数据驱动版）
 *
 * 改进点：
 * 1. 手势规则从代码常量 → JSON 数据文件，支持热加载和用户自定义
 * 2. 实现 Recognizer 统一接口，可与其他识别器组合
 * 3. 手势库可从 IndexedDB 加载用户自定义手势
 *
 * 规则语法：
 *   fingers: [拇指, 食指, 中指, 无名指, 小指]
 *     - "ext": 伸直
 *     - "fold": 弯曲
 *     - "!ext": 非伸直（含弯曲和半弯）
 *     - "!fold": 非弯曲
 *     - "any": 任意
 *   thumb_index_dist_max: 拇指食指指尖距离上限（归一化）
 *   thumb_index_dist_min: 拇指食指指尖距离下限
 */

import {
  GestureRecognizer,
  FilesetResolver,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision';
import type { ClassificationResult } from '@/types/recognition';
import type { Recognizer, FrameInput } from './Recognizer';
// 复用 workerUtils 的类型和函数，避免类型分叉
import type { GestureDefinition } from './WorkerUtils';
import { extractFeatures, matchRule } from './WorkerUtils';
import { appConfig } from '@/config';

// 重新导出，保持外部 import 路径兼容
export type { GestureDefinition };

/** MediaPipe wasm CDN（从环境配置读取，便于切换自托管） */
const WASM_BASE_URL = appConfig.mediapipeWasmBaseUrl;
/** 预训练模型（从环境配置读取） */
const MODEL_URL = appConfig.gestureModelUrl;
/** 默认手势库路径 */
const DEFAULT_GESTURES_URL = appConfig.gestureLibraryUrl;

/** 手势库文件格式（仅本模块使用） */
interface GestureLibrary {
  version: string;
  description?: string;
  gestures: GestureDefinition[];
}

/**
 * 基于规则的手势识别器
 * 从 JSON 加载手势规则，用 MediaPipe 提取关键点，几何规则匹配
 */
export class RuleRecognizer implements Recognizer {
  private recognizer: GestureRecognizer | null = null;
  private isInitialized = false;
  private gestures: GestureDefinition[] = [];

  /** 加载手势库（默认 + 用户自定义） */
  async loadGestureLibrary(): Promise<void> {
    // 加载默认手势库
    try {
      const res = await fetch(DEFAULT_GESTURES_URL);
      const lib: GestureLibrary = await res.json();
      this.gestures = lib.gestures;
    } catch (err) {
      console.error('[RuleRecognizer] 加载手势库失败:', err);
      this.gestures = [];
    }

    // 尝试加载用户自定义手势（从 IndexedDB）
    try {
      const custom = await this.loadCustomGestures();
      if (custom.length > 0) {
        this.gestures = [...this.gestures, ...custom];
      }
    } catch {
      // IndexedDB 不可用时静默忽略
    }
  }

  /** 从 IndexedDB 加载用户自定义手势 */
  private async loadCustomGestures(): Promise<GestureDefinition[]> {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('signbridge-custom-gestures', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('gestures', { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('gestures', 'readonly');
          const store = tx.objectStore('gestures');
          const getAll = store.getAll();
          getAll.onsuccess = () => resolve(getAll.result as GestureDefinition[]);
          getAll.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /** 添加自定义手势（运行时） */
  addGesture(gesture: GestureDefinition): void {
    // 去重：相同 id 替换
    const idx = this.gestures.findIndex((g) => g.id === gesture.id);
    if (idx >= 0) {
      this.gestures[idx] = gesture;
    } else {
      this.gestures.push(gesture);
    }
  }

  /** 获取当前所有手势定义 */
  getGestures(): GestureDefinition[] {
    return [...this.gestures];
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    // 并行加载模型和手势库
    const [vision] = await Promise.all([
      FilesetResolver.forVisionTasks(WASM_BASE_URL),
      this.loadGestureLibrary(),
    ]);

    this.recognizer = await GestureRecognizer.createFromModelPath(vision, MODEL_URL);
    this.isInitialized = true;
  }

  async recognize(input: FrameInput): Promise<ClassificationResult | null> {
    if (!this.recognizer || !this.isInitialized) {
      throw new Error('识别器未初始化');
    }

    const video = input.element as HTMLVideoElement;
    if (video.readyState < 2) return null;

    const result: GestureRecognizerResult = this.recognizer.recognize(video);

    if (!result.landmarks || result.landmarks.length === 0) {
      return { gloss_id: 'none', chinese: '无手势', confidence: 0 };
    }

    // 用几何规则匹配
    const landmarks = result.landmarks[0];
    const features = extractFeatures(landmarks);

    for (const gesture of this.gestures) {
      if (matchRule(features, gesture.rule)) {
        return {
          gloss_id: gesture.id,
          chinese: `${gesture.emoji} ${gesture.chinese}`,
          confidence: 0.85,
          all_probabilities: [{ gloss_id: gesture.id, probability: 0.85 }],
        };
      }
    }

    // 回退到 MediaPipe 官方识别
    if (result.gestures.length > 0 && result.gestures[0].length > 0) {
      const top = result.gestures[0][0];
      const MAP: Record<string, string> = {
        None: '无手势',
        Closed_Fist: '✊ 握拳',
        Open_Palm: '🖐 张开手掌',
        Pointing_Up: '☝️ 食指上指',
        Thumb_Down: '👎 踩',
        Thumb_Up: '👍 点赞',
        Victory: '✌️ 胜利',
        ILoveYou: '🤟 我爱你',
      };
      return {
        gloss_id: top.categoryName.toLowerCase(),
        chinese: MAP[top.categoryName] ?? top.categoryName,
        confidence: top.score,
      };
    }

    return { gloss_id: 'unknown', chinese: '未知手势', confidence: 0.3 };
  }

  isReady(): boolean {
    return this.isInitialized && this.recognizer !== null;
  }

  dispose(): void {
    this.recognizer?.close();
    this.recognizer = null;
    this.isInitialized = false;
  }
}
