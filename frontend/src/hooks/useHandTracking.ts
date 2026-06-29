import { useCallback, useEffect, useRef, useState } from 'react';
import { HAND_CONNECTIONS, type NormalizedLandmark } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { HandTracker, type HandTrackerConfig } from '@/components/sign/HandTracker';
import type { FrameKeypoints } from '@/types/recognition';

/** useHandTracking Hook 返回值 */
export interface UseHandTrackingReturn {
  /** 视频元素 ref */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 画布元素 ref（用于绘制关键点） */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** 是否正在追踪 */
  isTracking: boolean;
  /** 当前帧关键点 */
  keypoints: FrameKeypoints | null;
  /** 错误信息 */
  error: string | null;
  /** 开始追踪（请求摄像头权限） */
  start: () => Promise<void>;
  /** 停止追踪 */
  stop: () => void;
}

/** useHandTracking 配置项 */
export interface UseHandTrackingOptions extends HandTrackerConfig {
  /** 画布宽度，默认 640 */
  width?: number;
  /** 画布高度，默认 480 */
  height?: number;
  /** 是否镜像显示（默认 true，符合用户直觉） */
  mirror?: boolean;
}

/** 默认尺寸 */
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

/**
 * 手部追踪 Hook：封装 HandTracker 与摄像头管理。
 * - 通过 getUserMedia 获取摄像头流
 * - 使用 requestAnimationFrame 循环处理帧
 * - 在 canvas 上绘制视频帧与关键点连线
 * - 组件卸载时自动清理资源
 */
export function useHandTracking(
  options: UseHandTrackingOptions = {},
): UseHandTrackingReturn {
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    mirror = true,
    ...trackerConfig
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 使用 useRef 持有可变资源，避免重渲染
  const trackerRef = useRef<HandTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  // 标记是否处于运行中，避免 stop 后残留的 raf 继续处理
  const runningRef = useRef(false);

  const [isTracking, setIsTracking] = useState(false);
  const [keypoints, setKeypoints] = useState<FrameKeypoints | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * 在 canvas 上绘制视频帧与手部关键点。
   * - 镜像翻转以匹配用户视角
   * - 使用 MediaPipe drawing_utils 绘制连接线与关键点
   */
  const drawFrame = useCallback(
    (frameKeypoints: FrameKeypoints | null) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 确保画布尺寸与配置一致
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      ctx.save();
      // 镜像绘制：水平翻转
      if (mirror) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      // 先绘制视频帧作为背景
      ctx.drawImage(video, 0, 0, width, height);

      // 绘制关键点（若存在）
      if (frameKeypoints) {
        drawHandKeypoints(ctx, frameKeypoints.left_hand, '#FF6B6B');
        drawHandKeypoints(ctx, frameKeypoints.right_hand, '#4ECDC4');
      }
      ctx.restore();
    },
    [width, height, mirror],
  );

  /**
   * 帧处理循环：使用 requestAnimationFrame 持续处理视频帧。
   * - 调用 tracker.process 获取关键点
   * - 更新 state 与 canvas 绘制
   */
  const processFrame = useCallback(async () => {
    if (!runningRef.current) return;

    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!video || !tracker) {
      rafIdRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      const result = await tracker.process(video);
      if (!runningRef.current) return;

      setKeypoints(result);
      drawFrame(result);
    } catch (err) {
      // 单帧处理失败不中断循环，仅记录错误
      console.error('处理帧失败:', err);
    }

    if (runningRef.current) {
      rafIdRef.current = requestAnimationFrame(processFrame);
    }
  }, [drawFrame]);

  /** 停止追踪：释放摄像头流、取消动画帧、销毁 tracker */
  const stop = useCallback(() => {
    runningRef.current = false;

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

    // 释放 tracker
    if (trackerRef.current) {
      trackerRef.current.dispose();
      trackerRef.current = null;
    }

    setIsTracking(false);
    setKeypoints(null);
  }, []);

  /** 开始追踪：初始化 tracker、请求摄像头、启动帧循环 */
  const start = useCallback(async () => {
    if (runningRef.current) return;
    setError(null);

    try {
      // 1. 初始化 HandTracker
      if (!trackerRef.current) {
        trackerRef.current = new HandTracker(trackerConfig);
      }
      await trackerRef.current.init();

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
  }, [trackerConfig, width, height, processFrame, stop]);

  // 组件卸载时清理所有资源
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    canvasRef,
    isTracking,
    keypoints,
    error,
    start,
    stop,
  };
}

/**
 * 在 canvas 上绘制单手关键点与连接线。
 * - 使用 MediaPipe drawing_utils 提供的绘制函数
 * - 关键点坐标为归一化值 [0,1]，需乘以画布尺寸
 *
 * @param ctx 2D 渲染上下文
 * @param keypoints 21 个关键点（可能为 null）
 * @param color 连接线与关键点颜色
 */
function drawHandKeypoints(
  ctx: CanvasRenderingContext2D,
  keypoints: FrameKeypoints['left_hand'],
  color: string,
): void {
  if (!keypoints) return;

  // 转换为 MediaPipe 的 NormalizedLandmark 格式（坐标 [0,1]）
  const landmarks: NormalizedLandmark[] = keypoints.map((kp) => ({
    x: kp.x,
    y: kp.y,
    z: kp.z,
  }));

  // 绘制连接线（HAND_CONNECTIONS 已定义 21 点的骨架）
  drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
    color,
    lineWidth: 3,
  });

  // 绘制关键点圆圈
  drawLandmarks(ctx, landmarks, {
    color: '#FFFFFF',
    fillColor: color,
    lineWidth: 1,
    radius: 4,
  });
}
