/**
 * 统一手势识别器接口
 * 所有识别器（规则、LSTM、未来模型）都实现此接口
 * 可通过 CompositeRecognizer 组合使用
 */

import type { ClassificationResult } from '@/types/recognition';

/** 视频帧输入（兼容 video 元素和 canvas） */
export interface FrameInput {
  /** 视频元素或 canvas */
  element: HTMLVideoElement | HTMLCanvasElement;
  /** 当前时间戳（用于视频帧模式） */
  timestamp?: number;
}

/** 统一识别器接口 */
export interface Recognizer {
  /** 初始化（加载模型/wasm） */
  init(): Promise<void>;
  /** 识别单帧 */
  recognize(input: FrameInput): Promise<ClassificationResult | null>;
  /** 是否已就绪 */
  isReady(): boolean;
  /** 释放资源 */
  dispose(): void;
}

// 向后兼容别名（过渡期使用，新代码请直接使用 Recognizer）
export type IRecognizer = Recognizer;

/** 识别器类型标识 */
export type RecognizerType = 'rule' | 'lstm' | 'composite';
