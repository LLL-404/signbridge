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
 *   VITE_POSE_MODEL_URL            — 姿态估计模型 URL（PoseEstimator 使用）
 *   VITE_HAND_MODEL_URL            — 手部关键点模型 URL（PoseEstimator / STGCNRecognizer 使用）
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

  /**
   * MediaPipe tasks-vision wasm 基址（用于 GestureRecognizer / PoseLandmarker / HandLandmarker）
   * 默认自托管于 public/mediapipe/tasks-vision/wasm，避免依赖外部 CDN
   * 切换 CDN 时设置 VITE_MEDIAPIPE_WASM_BASE_URL 环境变量即可
   */
  mediapipeWasmBaseUrl: env(
    'VITE_MEDIAPIPE_WASM_BASE_URL',
    import.meta.env.BASE_URL + 'mediapipe/tasks-vision/wasm',
  ),

  /**
   * MediaPipe Hands 旧版 wasm 基址（用于 HandTracker）
   * 默认自托管于 public/mediapipe/hands，避免依赖外部 CDN
   */
  mediapipeHandsCdnBase: env(
    'VITE_MEDIAPIPE_HANDS_CDN_BASE',
    import.meta.env.BASE_URL + 'mediapipe/hands',
  ),

  /**
   * 预训练手势识别模型 URL
   * 默认自托管于 public/mediapipe/models/gesture_recognizer.task，避免依赖 Google Storage
   */
  gestureModelUrl: env(
    'VITE_GESTURE_MODEL_URL',
    import.meta.env.BASE_URL + 'mediapipe/models/gesture_recognizer.task',
  ),

  /**
   * 姿态估计模型 URL
   * 默认自托管于 public/mediapipe/models/pose_landmarker_full.task，避免依赖 Google Storage
   */
  poseModelUrl: env(
    'VITE_POSE_MODEL_URL',
    import.meta.env.BASE_URL + 'mediapipe/models/pose_landmarker_full.task',
  ),

  /**
   * 手部关键点模型 URL
   * 默认自托管于 public/mediapipe/models/hand_landmarker.task，避免依赖 Google Storage
   */
  handModelUrl: env(
    'VITE_HAND_MODEL_URL',
    import.meta.env.BASE_URL + 'mediapipe/models/hand_landmarker.task',
  ),

  /** 默认手势库 JSON 路径（基于 Vite BASE_URL 拼接，兼容子路径部署） */
  gestureLibraryUrl: env('VITE_GESTURE_LIBRARY_URL', import.meta.env.BASE_URL + 'gestures.json'),

  /** 词汇库 JSON 路径（基于 Vite BASE_URL 拼接，兼容子路径部署） */
  vocabularyUrl: env('VITE_VOCABULARY_URL', import.meta.env.BASE_URL + 'data/vocabulary.json'),
} as const;

export type AppConfig = typeof appConfig;
