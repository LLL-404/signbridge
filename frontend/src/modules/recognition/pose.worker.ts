/**
 * @file pose.worker.ts
 * @description PoseEstimator Web Worker —— 在后台线程运行 MediaPipe 姿态+手部推理
 *
 * 通信协议：
 *   主线程 → Worker:
 *     - { type: 'init', wasmUrl, poseModelUrl, handModelUrl }   初始化
 *     - { type: 'estimate', bitmap, timestamp }                  估计一帧（ImageBitmap 零拷贝传输）
 *   Worker → 主线程:
 *     - { type: 'ready' }                                        初始化完成
 *     - { type: 'result', estimate }                             估计结果
 *     - { type: 'error', message }                               错误信息
 *
 * 推理流程：
 *   1. ImageBitmap → OffscreenCanvas（drawImage）
 *   2. PoseLandmarker.detectForVideo → 33 身体关键点
 *   3. HandLandmarker.detectForVideo → 左右手各 21 关键点
 *   4. 低置信度回退（visibility / confidence < 0.5 时保留上次有效值）
 *   5. 组装 PoseEstimate 返回
 */

import {
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import {
  type PoseEstimate,
  type Keypoint,
  type HandLandmarks,
  toBodyKeypoints,
  parseHandResult,
  applyBodyFallback,
  applyHandFallback,
} from './PoseEstimator';

// ===== Worker 状态 =====

let poseLandmarker: PoseLandmarker | null = null;
let handLandmarker: HandLandmarker | null = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

// 低置信度回退状态
let lastValidBody: Keypoint[] | null = null;
let lastValidLeftHand: HandLandmarks | null = null;
let lastValidRightHand: HandLandmarks | null = null;

// ===== Worker 消息类型 =====

type WorkerRequest =
  | { type: 'init'; wasmUrl: string; poseModelUrl: string; handModelUrl: string }
  | { type: 'estimate'; bitmap: ImageBitmap; timestamp: number };

type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; estimate: PoseEstimate | null }
  | { type: 'error'; message: string };

/** 发送消息给主线程 */
function postMessage(msg: WorkerResponse): void {
  (self as unknown as Worker).postMessage(msg);
}

/** 初始化 PoseLandmarker + HandLandmarker */
async function initLandmarkers(
  wasmUrl: string,
  poseModelUrl: string,
  handModelUrl: string,
): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(wasmUrl);

  // 并行初始化两个 Landmarker
  const [pose, hand] = await Promise.all([
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: poseModelUrl },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: handModelUrl },
      runningMode: 'VIDEO',
      numHands: 2,
    }),
  ]);

  poseLandmarker = pose;
  handLandmarker = hand;

  // 创建 OffscreenCanvas 用于绘制 ImageBitmap
  offscreenCanvas = new OffscreenCanvas(640, 480);
  offscreenCtx = offscreenCanvas.getContext('2d');

  postMessage({ type: 'ready' });
}

/** 对一帧进行推理 */
function estimateFrame(bitmap: ImageBitmap, timestamp: number): void {
  if (!poseLandmarker || !handLandmarker || !offscreenCanvas || !offscreenCtx) {
    postMessage({ type: 'error', message: '姿态估计器未初始化' });
    return;
  }

  // 将 ImageBitmap 绘制到 OffscreenCanvas
  offscreenCanvas.width = bitmap.width;
  offscreenCanvas.height = bitmap.height;
  offscreenCtx.drawImage(bitmap, 0, 0);
  bitmap.close();

  // 身体姿态检测
  const poseResult = poseLandmarker.detectForVideo(offscreenCanvas, timestamp);
  const body = processBody(poseResult.landmarks[0]);

  // 手部检测
  const handResult = handLandmarker.detectForVideo(offscreenCanvas, timestamp);
  const { leftHand, rightHand } = processHands(handResult);

  const estimate: PoseEstimate = {
    body,
    leftHand,
    rightHand,
    face: null, // 未使用 FaceLandmarker
    timestamp,
  };

  postMessage({ type: 'result', estimate });
}

/** 处理身体关键点（含低置信度回退） */
function processBody(landmarks: NormalizedLandmark[] | undefined): Keypoint[] {
  // 无检测结果时回退到上次有效值
  if (!landmarks || landmarks.length === 0) {
    return lastValidBody ?? [];
  }
  const current = toBodyKeypoints(landmarks);
  const { result, newLastValid } = applyBodyFallback(current, lastValidBody);
  lastValidBody = newLastValid;
  return result;
}

/** 处理手部关键点（含低置信度回退） */
function processHands(handResult: HandLandmarkerResult): {
  leftHand: HandLandmarks | null;
  rightHand: HandLandmarks | null;
} {
  const { left, right } = parseHandResult(handResult);

  const leftFallback = applyHandFallback(left, lastValidLeftHand);
  lastValidLeftHand = leftFallback.newLastValid;

  const rightFallback = applyHandFallback(right, lastValidRightHand);
  lastValidRightHand = rightFallback.newLastValid;

  return { leftHand: leftFallback.result, rightHand: rightFallback.result };
}

// ===== 消息处理 =====

(self as unknown as Worker).onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type } = e.data;
  try {
    if (type === 'init') {
      const { wasmUrl, poseModelUrl, handModelUrl } = e.data;
      await initLandmarkers(wasmUrl, poseModelUrl, handModelUrl);
    } else if (type === 'estimate') {
      const { bitmap, timestamp } = e.data;
      estimateFrame(bitmap, timestamp);
    }
  } catch (err) {
    postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
