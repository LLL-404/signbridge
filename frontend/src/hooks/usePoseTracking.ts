import { useCallback, useEffect, useRef, useState } from 'react';
import { PoseEstimatorWorker, type PoseEstimate } from '@/modules/recognition/PoseEstimator';
import { logger } from '@/modules/debug/logger';

const log = logger.module('usePoseTracking');

/** usePoseTracking Hook 返回值 */
export interface UsePoseTrackingReturn {
  /** 视频元素 ref */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 是否正在追踪 */
  isTracking: boolean;
  /** 当前帧全身姿态估计结果 */
  poseEstimate: PoseEstimate | null;
  /** 错误信息 */
  error: string | null;
  /** 开始追踪（请求摄像头权限） */
  start: () => Promise<void>;
  /** 停止追踪 */
  stop: () => void;
}

/** usePoseTracking 配置项 */
export interface UsePoseTrackingOptions {
  /** 视频宽度，默认 640 */
  width?: number;
  /** 视频高度，默认 480 */
  height?: number;
  /** 是否镜像显示（默认 true，由调用方在绘制时应用） */
  mirror?: boolean;
}

/** 默认尺寸 */
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

/**
 * 全身姿态追踪 Hook：封装 PoseEstimatorWorker 与摄像头管理。
 * - 通过 getUserMedia 获取摄像头流
 * - 使用 requestAnimationFrame 循环处理帧
 * - 调用 PoseEstimatorWorker.estimate() 进行异步推理（Worker 不阻塞渲染）
 * - 不负责绘制，调用方根据 poseEstimate 自行渲染
 * - 组件卸载时自动清理资源
 */
export function usePoseTracking(
  options: UsePoseTrackingOptions = {},
): UsePoseTrackingReturn {
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);

  // 使用 useRef 持有可变资源，避免重渲染
  const estimatorRef = useRef<PoseEstimatorWorker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  // 标记是否处于运行中，避免 stop 后残留的 raf 继续处理
  const runningRef = useRef(false);
  // 标记是否正在处理帧，避免并发调用 estimate 导致请求积压
  const processingRef = useRef(false);

  const [isTracking, setIsTracking] = useState(false);
  const [poseEstimate, setPoseEstimate] = useState<PoseEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * 帧处理循环：使用 requestAnimationFrame 持续处理视频帧。
   * - 调用 estimator.estimate 获取全身姿态
   * - estimate 为异步，若上一帧仍在处理中则跳过当前帧，避免请求积压
   */
  const processFrame = useCallback(async () => {
    if (!runningRef.current) return;

    const video = videoRef.current;
    const estimator = estimatorRef.current;
    if (!video || !estimator) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // 上一帧还在处理中，跳过当前帧避免积压
    if (processingRef.current) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    processingRef.current = true;
    try {
      const result = await estimator.estimate(video);
      if (!runningRef.current) return;
      setPoseEstimate(result);
    } catch (err) {
      // 单帧处理失败不中断循环，仅记录错误
      log.error('处理帧失败', err);
    } finally {
      processingRef.current = false;
    }

    if (runningRef.current) {
      rafIdRef.current = requestAnimationFrame(processFrame);
    }
  }, []);

  /** 停止追踪：释放摄像头流、取消动画帧、销毁 estimator */
  const stop = useCallback(() => {
    runningRef.current = false;
    processingRef.current = false;

    // 取消动画帧
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // 停止摄像头流的所有轨道
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // 清空 video src
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    // 释放 estimator
    if (estimatorRef.current) {
      estimatorRef.current.dispose();
      estimatorRef.current = null;
    }

    setIsTracking(false);
    setPoseEstimate(null);
  }, []);

  /** 开始追踪：初始化 estimator、请求摄像头、启动帧循环 */
  const start = useCallback(async () => {
    if (runningRef.current) return;
    setError(null);

    try {
      // 1. 初始化 PoseEstimatorWorker
      if (!estimatorRef.current) {
        estimatorRef.current = new PoseEstimatorWorker();
      }
      await estimatorRef.current.init();

      // 2. 请求摄像头权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode: 'user',
        },
        audio: false,
      });
      streamRef.current = stream;

      // 3. 绑定流到 video 元素
      const video = videoRef.current;
      if (!video) {
        throw new Error('视频元素未就绪');
      }
      video.srcObject = stream;
      await video.play();

      // 4. 启动帧处理循环
      runningRef.current = true;
      setIsTracking(true);
      rafIdRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      // 失败时清理已申请的资源
      stop();

      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('请允许摄像头权限');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('未检测到摄像头设备');
      } else {
        setError(err instanceof Error ? err.message : '追踪启动失败');
      }
    }
  }, [width, height, processFrame, stop]);

  // 组件卸载时清理所有资源
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    isTracking,
    poseEstimate,
    error,
    start,
    stop,
  };
}
