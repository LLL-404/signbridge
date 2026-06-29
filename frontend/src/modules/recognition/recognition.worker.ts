/**
 * 手势识别 Web Worker
 * 在后台线程运行 MediaPipe 推理，不阻塞 UI
 *
 * 通信协议：
 *   主线程 → Worker:
 *     - { type: 'init' }                                    初始化识别器
 *     - { type: 'recognize', bitmap: ImageBitmap, timestamp } 识别一帧（ImageBitmap 零拷贝传输）
 *     - { type: 'ping' }                                    心跳检测
 *   Worker → 主线程:
 *     - { type: 'ready' }                                   初始化完成
 *     - { type: 'result', result: ClassificationResult }    识别结果
 *     - { type: 'error', message: string }                  错误信息
 *     - { type: 'pong' }                                    心跳响应
 *
 * 识别流程：
 *   1. ImageBitmap → OffscreenCanvas（drawImage）
 *   2. GestureRecognizer.recognizeForVideo → 21 关键点
 *   3. extractFeatures → HandFeatures（5 指状态 + 拇指食指距离 + 张开度）
 *   4. matchRuleWithScore 遍历手势库 → 选置信度最高的命中
 *   5. 未命中则回退到 MediaPipe 官方 7 种手势
 */

import {
  GestureRecognizer,
  FilesetResolver,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision';
import type { ClassificationResult } from '@/types/recognition';
import {
  extractFeatures,
  matchRuleWithScore,
  loadGestureLibrary,
  type GestureDefinition,
  type HandFeatures,
} from './WorkerUtils';
import { appConfig } from '@/config';

const WASM_BASE_URL = appConfig.mediapipeWasmBaseUrl;
const MODEL_URL = appConfig.gestureModelUrl;

let recognizer: GestureRecognizer | null = null;
let gestures: GestureDefinition[] = [];
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

/** 初始化识别器和手势库 */
async function initRecognizer() {
  const [vision] = await Promise.all([
    FilesetResolver.forVisionTasks(WASM_BASE_URL),
    loadGestureLibrary().then((g) => {
      gestures = g;
    }),
  ]);
  recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  offscreenCanvas = new OffscreenCanvas(640, 480);
  offscreenCtx = offscreenCanvas.getContext('2d');
  (self as unknown as Worker).postMessage({ type: 'ready' });
}

/** 识别一帧 */
function recognizeFrame(bitmap: ImageBitmap, timestamp: number) {
  if (!recognizer || !offscreenCanvas || !offscreenCtx) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: '识别器未初始化',
    });
    return;
  }

  // 将 ImageBitmap 绘制到 OffscreenCanvas
  offscreenCanvas.width = bitmap.width;
  offscreenCanvas.height = bitmap.height;
  offscreenCtx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const result: GestureRecognizerResult = recognizer.recognizeForVideo(
    offscreenCanvas,
    timestamp,
  );

  if (!result.landmarks || result.landmarks.length === 0) {
    (self as unknown as Worker).postMessage({
      type: 'result',
      result: { gloss_id: 'none', chinese: '无手势', confidence: 0 } as ClassificationResult,
    });
    return;
  }

  // 几何规则匹配：选置信度最高的手势
  const landmarks = result.landmarks[0];
  const features = extractFeatures(landmarks);
  let bestGesture: GestureDefinition | null = null;
  let bestScore = 0;
  for (const gesture of gestures) {
    const score = matchRuleWithScore(features, gesture.rule);
    if (score !== null && score > bestScore) {
      bestScore = score;
      bestGesture = gesture;
    }
  }
  if (bestGesture) {
    (self as unknown as Worker).postMessage({
      type: 'result',
      result: {
        gloss_id: bestGesture.id,
        chinese: `${bestGesture.emoji} ${bestGesture.chinese}`,
        confidence: bestScore,
      } as ClassificationResult,
    });
    return;
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
    (self as unknown as Worker).postMessage({
      type: 'result',
      result: {
        gloss_id: top.categoryName.toLowerCase(),
        chinese: MAP[top.categoryName] ?? top.categoryName,
        confidence: top.score,
      } as ClassificationResult,
    });
    return;
  }

  (self as unknown as Worker).postMessage({
    type: 'result',
    result: { gloss_id: 'unknown', chinese: '未知手势', confidence: 0.3 } as ClassificationResult,
  });
}

// 消息处理
(self as unknown as Worker).onmessage = async (e: MessageEvent) => {
  const { type, bitmap, timestamp } = e.data;
  try {
    if (type === 'init') {
      await initRecognizer();
    } else if (type === 'recognize') {
      recognizeFrame(bitmap, timestamp);
    } else if (type === 'ping') {
      // 心跳响应
      (self as unknown as Worker).postMessage({ type: 'pong' });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

// 导出类型供 workerUtils 使用
export type { HandFeatures };
