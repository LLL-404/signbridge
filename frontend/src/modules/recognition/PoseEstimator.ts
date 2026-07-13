/**
 * @file PoseEstimator.ts
 * @description 全身姿态估计器 —— 封装 MediaPipe PoseLandmarker + HandLandmarker
 *
 * 提供两种使用方式：
 *   1. PoseEstimator —— 主线程同步推理（简单场景）
 *   2. PoseEstimatorWorker —— Web Worker 异步推理（推荐，不阻塞渲染）
 *
 * 低置信度处理：
 *   - 身体关键点 visibility < 0.5 → 回退到上次有效值
 *   - 手部整体置信度 < 0.5 或未检测到 → 回退到上次有效值，标记 lowConfidence
 */

import {
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { appConfig } from '@/config';
import { logger } from '@/modules/debug/logger';

const log = logger.module('PoseEstimator');

// ===== 类型定义 =====

/** 单个关键点 */
export interface Keypoint {
  x: number; // 归一化坐标 [0, 1]
  y: number; // 归一化坐标 [0, 1]
  z: number; // 深度（相对 hips 的距离）
  visibility?: number; // 可见度 [0, 1]
  confidence?: number; // 置信度 [0, 1]
}

/** 手部关键点数据（21 点） */
export interface HandLandmarks {
  landmarks: Keypoint[];
  handedness: 'Left' | 'Right';
  confidence: number;
  lowConfidence: boolean; // 是否有低置信度关键点被替换
}

/** 全身姿态估计结果 */
export interface PoseEstimate {
  /** 身体 33 关键点 */
  body: Keypoint[];
  /** 左手 21 关键点（可能为 null 表示未检测到） */
  leftHand: HandLandmarks | null;
  /** 右手 21 关键点 */
  rightHand: HandLandmarks | null;
  /** 面部 468 关键点（可能为 null） */
  face: Keypoint[] | null;
  /** 时间戳（performance.now()） */
  timestamp: number;
}

// ===== 常量 =====

/** 低置信度阈值 */
const VISIBILITY_THRESHOLD = 0.5;
const CONFIDENCE_THRESHOLD = 0.5;

/** WASM 文件集 URL（从 appConfig 读取） */
const WASM_URL = appConfig.mediapipeWasmBaseUrl;

/** Pose 模型 URL（appConfig 未配置，使用默认 CDN） */
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

/** Hand 模型 URL（appConfig 未配置，使用默认 CDN） */
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// ===== 共享辅助函数（供 Worker 复用） =====

/** 将单个 NormalizedLandmark 转换为 Keypoint */
function toKeypoint(lm: NormalizedLandmark): Keypoint {
  return { x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility };
}

/** 将身体关键点数组从 NormalizedLandmark[] 转换为 Keypoint[] */
export function toBodyKeypoints(landmarks: NormalizedLandmark[]): Keypoint[] {
  return landmarks.map(toKeypoint);
}

/** 从 HandLandmarkerResult 解析左右手 */
export function parseHandResult(
  handResult: HandLandmarkerResult,
): { left: HandLandmarks | null; right: HandLandmarks | null } {
  let left: HandLandmarks | null = null;
  let right: HandLandmarks | null = null;

  for (let i = 0; i < handResult.landmarks.length; i++) {
    const landmarks = handResult.landmarks[i];
    const cat = handResult.handedness[i]?.[0];
    const side: 'Left' | 'Right' = cat?.categoryName === 'Left' ? 'Left' : 'Right';
    const confidence = cat?.score ?? 0;
    const hand: HandLandmarks = {
      landmarks: landmarks.map(toKeypoint),
      handedness: side,
      confidence,
      lowConfidence: false,
    };
    if (side === 'Left') left = hand;
    else right = hand;
  }

  return { left, right };
}

/**
 * 身体关键点低置信度回退
 * - visibility < 阈值的关键点回退到上次有效值
 * - 返回处理后的结果和更新后的 lastValid
 */
export function applyBodyFallback(
  current: Keypoint[],
  lastValid: Keypoint[] | null,
): { result: Keypoint[]; newLastValid: Keypoint[] } {
  // 首次或长度不匹配，直接使用当前值
  if (!lastValid || lastValid.length !== current.length) {
    return { result: current, newLastValid: current };
  }

  const result: Keypoint[] = [];
  const newLastValid: Keypoint[] = [];

  for (let i = 0; i < current.length; i++) {
    const kp = current[i];
    const isLow = (kp.visibility ?? 1) < VISIBILITY_THRESHOLD;
    if (isLow) {
      result.push(lastValid[i]); // 回退
      newLastValid.push(lastValid[i]); // 保持旧值
    } else {
      result.push(kp);
      newLastValid.push(kp); // 更新
    }
  }

  return { result, newLastValid };
}

/**
 * 手部低置信度回退
 * - 未检测到手 → 回退到上次有效值，标记 lowConfidence
 * - 置信度 < 阈值 → 回退到上次有效值，标记 lowConfidence
 * - 正常 → 更新 lastValid
 */
export function applyHandFallback(
  current: HandLandmarks | null,
  lastValid: HandLandmarks | null,
): { result: HandLandmarks | null; newLastValid: HandLandmarks | null } {
  // 未检测到手
  if (!current) {
    if (lastValid) {
      return { result: { ...lastValid, lowConfidence: true }, newLastValid: lastValid };
    }
    return { result: null, newLastValid: null };
  }

  // 置信度低
  if (current.confidence < CONFIDENCE_THRESHOLD) {
    if (lastValid) {
      return { result: { ...lastValid, lowConfidence: true }, newLastValid: lastValid };
    }
    // 无上次有效值，使用当前但标记低置信度
    return { result: { ...current, lowConfidence: true }, newLastValid: null };
  }

  // 正常
  return { result: current, newLastValid: current };
}

// ===== PoseEstimator 主线程类 =====

/**
 * 全身姿态估计器（主线程版本）
 * 封装 PoseLandmarker + HandLandmarker，同步推理
 */
export class PoseEstimator {
  private poseLandmarker: PoseLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private isInitialized = false;
  private lastValidBody: Keypoint[] | null = null;
  private lastValidLeftHand: HandLandmarks | null = null;
  private lastValidRightHand: HandLandmarks | null = null;

  /** 初始化：加载 WASM 和模型文件 */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    // 并行初始化两个 Landmarker
    const [pose, hand] = await Promise.all([
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL },
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    ]);

    this.poseLandmarker = pose;
    this.handLandmarker = hand;
    this.isInitialized = true;
  }

  /** 对视频帧进行推理，返回 PoseEstimate */
  estimate(video: HTMLVideoElement): PoseEstimate | null {
    if (!this.poseLandmarker || !this.handLandmarker || !this.isInitialized) {
      throw new Error('姿态估计器未初始化');
    }
    if (video.readyState < 2) return null;

    const timestamp = performance.now();

    // 身体姿态检测
    const poseResult = this.poseLandmarker.detectForVideo(video, timestamp);
    const body = this.processBody(poseResult);

    // 手部检测
    const handResult = this.handLandmarker.detectForVideo(video, timestamp);
    const { leftHand, rightHand } = this.processHands(handResult);

    return { body, leftHand, rightHand, face: null, timestamp };
  }

  /** 是否已就绪 */
  isReady(): boolean {
    return this.isInitialized && this.poseLandmarker !== null && this.handLandmarker !== null;
  }

  /** 释放资源 */
  dispose(): void {
    this.poseLandmarker?.close();
    this.handLandmarker?.close();
    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.isInitialized = false;
    this.lastValidBody = null;
    this.lastValidLeftHand = null;
    this.lastValidRightHand = null;
  }

  /** 处理身体关键点（含低置信度回退） */
  private processBody(poseResult: PoseLandmarkerResult): Keypoint[] {
    // 无检测结果时回退到上次有效值
    if (!poseResult.landmarks || poseResult.landmarks.length === 0) {
      return this.lastValidBody ?? [];
    }
    const current = toBodyKeypoints(poseResult.landmarks[0]);
    const { result, newLastValid } = applyBodyFallback(current, this.lastValidBody);
    this.lastValidBody = newLastValid;
    return result;
  }

  /** 处理手部关键点（含低置信度回退） */
  private processHands(handResult: HandLandmarkerResult): {
    leftHand: HandLandmarks | null;
    rightHand: HandLandmarks | null;
  } {
    const { left, right } = parseHandResult(handResult);

    const leftFallback = applyHandFallback(left, this.lastValidLeftHand);
    this.lastValidLeftHand = leftFallback.newLastValid;

    const rightFallback = applyHandFallback(right, this.lastValidRightHand);
    this.lastValidRightHand = rightFallback.newLastValid;

    return { leftHand: leftFallback.result, rightHand: rightFallback.result };
  }
}

// ===== Worker 消息类型 =====

/** 主线程 → Worker 消息 */
type PoseWorkerRequest =
  | { type: 'init'; wasmUrl: string; poseModelUrl: string; handModelUrl: string }
  | { type: 'estimate'; bitmap: ImageBitmap; timestamp: number };

/** Worker → 主线程 消息 */
type PoseWorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; estimate: PoseEstimate | null }
  | { type: 'error'; message: string };

/** Worker 初始化超时（ms） */
const WORKER_INIT_TIMEOUT_MS = 60000;

/**
 * PoseEstimator 的 Web Worker 包装
 * 主线程通过此类与 Worker 通信，避免阻塞渲染
 */
export class PoseEstimatorWorker {
  private worker: Worker | null = null;
  private isInitialized = false;
  private ready = false;
  private pendingResolve: ((estimate: PoseEstimate | null) => void) | null = null;

  /** 初始化 Worker 并加载模型 */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.worker = new Worker(new URL('./pose.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e: MessageEvent<PoseWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        this.ready = true;
      } else if (msg.type === 'result') {
        this.pendingResolve?.(msg.estimate);
        this.pendingResolve = null;
      } else if (msg.type === 'error') {
        log.error('Worker 错误', msg.message);
        this.pendingResolve?.(null);
        this.pendingResolve = null;
      }
    };

    this.worker.onerror = (err) => {
      log.error('Worker 异常', err.message);
      this.pendingResolve?.(null);
      this.pendingResolve = null;
    };

    // 发送初始化命令（传递 URL，Worker 无需导入 appConfig）
    const initMsg: PoseWorkerRequest = {
      type: 'init',
      wasmUrl: WASM_URL,
      poseModelUrl: POSE_MODEL_URL,
      handModelUrl: HAND_MODEL_URL,
    };
    this.worker.postMessage(initMsg);

    // 等待 Worker 就绪
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker 初始化超时'));
      }, WORKER_INIT_TIMEOUT_MS);
      const checkReady = () => {
        if (this.ready) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });

    this.isInitialized = true;
  }

  /** 对视频帧进行异步推理 */
  async estimate(video: HTMLVideoElement): Promise<PoseEstimate | null> {
    if (!this.worker || !this.ready) {
      throw new Error('姿态估计器未初始化');
    }
    if (video.readyState < 2) return null;

    // 将 video 帧转换为 ImageBitmap（零拷贝传输给 Worker）
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(video);
    } catch (err) {
      log.error('创建 ImageBitmap 失败', err);
      return null;
    }

    const timestamp = performance.now();

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      const msg: PoseWorkerRequest = { type: 'estimate', bitmap, timestamp };
      try {
        this.worker!.postMessage(msg, [bitmap]); // 转移所有权
      } catch (err) {
        log.error('postMessage 失败', err);
        this.pendingResolve = null;
        resolve(null);
      }
    });
  }

  /** 是否已就绪 */
  isReady(): boolean {
    return this.isInitialized && this.ready;
  }

  /** 释放资源 */
  dispose(): void {
    this.pendingResolve?.(null);
    this.pendingResolve = null;
    this.worker?.terminate();
    this.worker = null;
    this.isInitialized = false;
    this.ready = false;
  }
}
