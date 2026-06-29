/**
 * Worker 化手势识别器（健壮版）
 *
 * 健壮性强化：
 * 1. Worker 崩溃自动重启（最多 3 次，健康运行 30s 后重置计数）
 * 2. 单帧识别超时降级（>800ms 触发重启 + 当前帧用 fallback 兜底）
 * 3. 错误恢复不丢帧（超时后继续接受新帧）
 * 4. 心跳检测（Worker 卡死时自动重启）
 * 5. 重启防重入（isRestarting 标志避免竞态）
 * 6. dispose 清理 pending（避免 Promise 永挂）
 *
 * 通信协议：
 *   主线程 → Worker: { type: 'init' } | { type: 'recognize', bitmap, timestamp } | { type: 'ping' }
 *   Worker → 主线程: { type: 'ready' } | { type: 'result', result } | { type: 'error', message } | { type: 'pong' }
 */

import type { ClassificationResult } from '@/types/recognition';
import type { Recognizer, FrameInput } from './Recognizer';
import type { GestureDefinition } from './WorkerUtils';
import { loadGestureLibrary } from './WorkerUtils';
import { RuleRecognizer } from './RuleRecognizer';

/** Worker 消息类型 */
type WorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; result: ClassificationResult }
  | { type: 'error'; message: string }
  | { type: 'pong' };

/** 配置常量 */
const RECOGNIZE_TIMEOUT_MS = 800; // 单帧识别超时
const MAX_WORKER_RESTARTS = 3; // Worker 最大重启次数
const HEARTBEAT_INTERVAL_MS = 5000; // 心跳间隔
const HEARTBEAT_TIMEOUT_MS = 3000; // 心跳超时（Worker 卡死判定）
const RESTART_COUNT_RESET_MS = 30000; // 健康运行 30s 后重置重启计数

export class WorkerRecognizer implements Recognizer {
  private worker: Worker | null = null;
  private isInitialized = false;
  private ready = false;
  private pendingResolve: ((result: ClassificationResult | null) => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private gestures: GestureDefinition[] = [];

  // 健壮性状态
  private restartCount = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatPong = 0;
  private hasCrashed = false;
  private isRestarting = false; // 防止重启竞态
  private lastHealthyTime = 0; // 上次健康运行时间（用于重置 restartCount）

  // 降级识别器（Worker 不可用时使用）
  private fallbackRecognizer: RuleRecognizer | null = null;
  private isDegradedMode = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    // 主线程预加载手势列表（用于 UI 显示）
    this.gestures = await loadGestureLibrary();

    // 预初始化降级识别器（不立即 init，仅在需要时激活）
    this.fallbackRecognizer = new RuleRecognizer();

    try {
      await this.startWorker();
      this.isInitialized = true;
      this.lastHealthyTime = Date.now();
      this.startHeartbeat();
    } catch (err) {
      console.warn('[WorkerRecognizer] Worker 启动失败，直接降级:', err);
      await this.activateFallback();
      this.isInitialized = true;
    }
  }

  /** 启动 Worker */
  private async startWorker(): Promise<void> {
    this.worker = new Worker(new URL('./recognition.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        this.ready = true;
        this.isDegradedMode = false;
      } else if (msg.type === 'result') {
        this.clearPendingTimer();
        this.lastHealthyTime = Date.now(); // 成功收到结果，标记健康
        this.pendingResolve?.(msg.result);
        this.pendingResolve = null;
      } else if (msg.type === 'pong') {
        this.lastHeartbeatPong = Date.now();
      } else if (msg.type === 'error') {
        console.error('[WorkerRecognizer] Worker 错误:', msg.message);
        this.clearPendingTimer();
        this.pendingResolve?.(null);
        this.pendingResolve = null;
      }
    };

    this.worker.onerror = (err) => {
      console.error('[WorkerRecognizer] Worker 异常:', err.message);
      this.hasCrashed = true;
      this.clearPendingTimer();
      this.pendingResolve?.(null);
      this.pendingResolve = null;
      // 尝试重启（防重入）
      this.handleWorkerCrash();
    };

    // 发送初始化命令
    this.worker.postMessage({ type: 'init' });

    // 等待 Worker 就绪
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker 初始化超时')), 30000);
      const checkReady = () => {
        if (this.ready) {
          clearTimeout(timeout);
          resolve();
        } else if (this.hasCrashed) {
          clearTimeout(timeout);
          reject(new Error('Worker 启动时崩溃'));
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  /** 处理 Worker 崩溃：尝试重启或降级（防重入） */
  private async handleWorkerCrash(): Promise<void> {
    // 防止重启竞态：onerror 与超时可能同时触发
    if (this.isRestarting) return;
    this.isRestarting = true;

    this.ready = false;
    this.stopHeartbeat();

    try {
      if (this.restartCount < MAX_WORKER_RESTARTS) {
        this.restartCount++;
        console.log(
          `[WorkerRecognizer] 尝试重启 Worker (${this.restartCount}/${MAX_WORKER_RESTARTS})...`,
        );
        this.worker?.terminate();
        this.worker = null;
        this.hasCrashed = false;
        await this.startWorker();
        this.lastHealthyTime = Date.now();
        this.startHeartbeat(); // 重启后必须重新启动心跳
        console.log('[WorkerRecognizer] Worker 重启成功');
      } else {
        console.error('[WorkerRecognizer] 达到最大重启次数，永久降级到主线程');
        await this.activateFallback();
      }
    } catch (err) {
      console.error('[WorkerRecognizer] 重启失败:', err);
      await this.activateFallback();
    } finally {
      this.isRestarting = false;
    }
  }

  /** 激活降级识别器 */
  private async activateFallback(): Promise<void> {
    if (this.isDegradedMode) return;
    console.warn('[WorkerRecognizer] 降级到主线程 RuleRecognizer');
    this.isDegradedMode = true;
    this.ready = false;
    this.stopHeartbeat();
    this.worker?.terminate();
    this.worker = null;

    if (this.fallbackRecognizer && !this.fallbackRecognizer.isReady()) {
      await this.fallbackRecognizer.init();
    }
    // 降级模式下 ready = true（用 fallback 的 ready 状态）
    this.ready = this.fallbackRecognizer?.isReady() ?? false;
  }

  /** 启动心跳检测 */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeatPong = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (!this.worker || this.isDegradedMode) return;

      // 健康运行超过阈值则重置重启计数（给 Worker 恢复机会）
      if (
        this.restartCount > 0 &&
        Date.now() - this.lastHealthyTime > RESTART_COUNT_RESET_MS
      ) {
        console.log('[WorkerRecognizer] 健康运行已超阈值，重置重启计数');
        this.restartCount = 0;
      }

      // 检查心跳超时
      if (Date.now() - this.lastHeartbeatPong > HEARTBEAT_TIMEOUT_MS + HEARTBEAT_INTERVAL_MS) {
        console.warn('[WorkerRecognizer] 心跳超时，Worker 可能卡死');
        this.handleWorkerCrash();
        return;
      }

      // 发送 ping
      try {
        this.worker.postMessage({ type: 'ping' });
      } catch {
        // Worker 已死，忽略
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** 停止心跳 */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** 清除待处理超时定时器 */
  private clearPendingTimer(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  async recognize(input: FrameInput): Promise<ClassificationResult | null> {
    if (!this.isInitialized) {
      throw new Error('识别器未初始化');
    }

    // 降级模式：直接用 fallback
    if (this.isDegradedMode && this.fallbackRecognizer) {
      return this.fallbackRecognizer.recognize(input);
    }

    if (!this.worker || !this.ready) {
      // Worker 不可用，临时降级
      if (this.fallbackRecognizer?.isReady()) {
        return this.fallbackRecognizer.recognize(input);
      }
      return null;
    }

    const video = input.element as HTMLVideoElement;
    if (video.readyState < 2) return null;

    // 从视频帧创建 ImageBitmap（零拷贝传输给 Worker）
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(video);
    } catch (err) {
      console.error('[WorkerRecognizer] 创建 ImageBitmap 失败:', err);
      return null;
    }
    const timestamp = input.timestamp ?? performance.now();

    return new Promise((resolve) => {
      // 设置超时：超时后用 fallback 兜底当前帧 + 异步触发 Worker 重启
      this.pendingTimer = setTimeout(() => {
        console.warn(
          `[WorkerRecognizer] 识别超时 (>${RECOGNIZE_TIMEOUT_MS}ms)，降级当前帧并重启 Worker`,
        );
        this.pendingResolve = null;
        // 当前帧用 fallback 兜底（不丢帧）
        const fallbackPromise = this.fallbackRecognizer?.isReady()
          ? this.fallbackRecognizer.recognize(input)
          : Promise.resolve(null);
        // 异步触发 Worker 重启（不阻塞当前帧返回）
        this.handleWorkerCrash();
        fallbackPromise.then(resolve);
      }, RECOGNIZE_TIMEOUT_MS);

      this.pendingResolve = resolve;
      try {
        this.worker!.postMessage(
          { type: 'recognize', bitmap, timestamp },
          [bitmap], // 转移所有权
        );
      } catch (err) {
        console.error('[WorkerRecognizer] postMessage 失败:', err);
        this.clearPendingTimer();
        this.pendingResolve = null;
        // Worker 可能已死，触发崩溃处理；当前帧返回 null
        this.handleWorkerCrash();
        resolve(null);
      }
    });
  }

  isReady(): boolean {
    if (this.isDegradedMode) {
      return this.fallbackRecognizer?.isReady() ?? false;
    }
    return this.isInitialized && this.ready;
  }

  /** 是否处于降级模式 */
  isDegraded(): boolean {
    return this.isDegradedMode;
  }

  /** 获取手势列表 */
  getGestures(): GestureDefinition[] {
    return [...this.gestures];
  }

  dispose(): void {
    this.stopHeartbeat();
    this.clearPendingTimer();
    // 清理 pending 请求，避免调用方 Promise 永挂
    this.pendingResolve?.(null);
    this.pendingResolve = null;
    this.worker?.terminate();
    this.worker = null;
    this.fallbackRecognizer?.dispose();
    this.fallbackRecognizer = null;
    this.isInitialized = false;
    this.ready = false;
    this.isDegradedMode = false;
    this.isRestarting = false;
    this.hasCrashed = false;
  }
}
