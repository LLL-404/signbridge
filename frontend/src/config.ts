/**
 * @file config.ts
 * @description 应用运行时配置 —— 集中管理外部资源 URL、模型路径、特性开关
 *
 * 设计原则：
 *   - 所有可变配置集中一处，避免散落在各模块的硬编码字符串
 *   - 优先读取 Vite 环境变量（import.meta.env.VITE_*），未设置则使用默认值
 *   - 切换 CDN/自托管模型时只需改 .env，无需改代码
 *
 * 环境变量约定（在 frontend/.env 中配置）：
 *   VITE_MEDIAPIPE_WASM_BASE_URL   — MediaPipe tasks-vision wasm 目录
 *   VITE_MEDIAPIPE_HANDS_CDN_BASE  — MediaPipe Hands 旧版 wasm CDN 基址
 *   VITE_GESTURE_MODEL_URL         — 预训练手势识别模型 URL
 *   VITE_GESTURE_LIBRARY_URL       — 默认手势库 JSON 路径
 *   VITE_VOCABULARY_URL            — 词汇库 JSON 路径
 *   VITE_APP_NAME                  — 应用显示名称
 *
 * 参考：https://vitejs.dev/guide/env-and-mode.html
 */

type ImportMetaEnv = Record<string, string | undefined>;

/** 读取 Vite 环境变量，未定义时返回 fallback */
function env(key: string, fallback: string): string {
  const meta = import.meta as unknown as { env?: ImportMetaEnv };
  return meta.env?.[key] ?? fallback;
}

export const appConfig = {
  /** 应用名称 */
  appName: env('VITE_APP_NAME', '手语桥 SignBridge'),

  /** MediaPipe tasks-vision wasm 基址（用于 GestureRecognizer） */
  mediapipeWasmBaseUrl: env(
    'VITE_MEDIAPIPE_WASM_BASE_URL',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  ),

  /** MediaPipe Hands 旧版 wasm CDN 基址（用于 HandTracker） */
  mediapipeHandsCdnBase: env(
    'VITE_MEDIAPIPE_HANDS_CDN_BASE',
    'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
  ),

  /** 预训练手势识别模型 URL */
  gestureModelUrl: env(
    'VITE_GESTURE_MODEL_URL',
    'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  ),

  /** 默认手势库 JSON 路径 */
  gestureLibraryUrl: env('VITE_GESTURE_LIBRARY_URL', '/gestures.json'),

  /** 词汇库 JSON 路径 */
  vocabularyUrl: env('VITE_VOCABULARY_URL', '/data/vocabulary.json'),
} as const;

export type AppConfig = typeof appConfig;
