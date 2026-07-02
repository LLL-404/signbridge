import { useEffect, useMemo, useRef } from 'react';
import { useHandTracking } from '@/hooks/useHandTracking';
import type { FrameKeypoints } from '@/types/recognition';

type SizeProp = number | string;

function resolveSize(size: SizeProp, fallback: number): { numeric: number; style: string | number } {
  if (typeof size === 'number') return { numeric: size, style: size };
  return { numeric: fallback, style: size };
}

/** SignCamera 组件 Props */
export interface SignCameraProps {
  /** 关键点回调（每帧触发） */
  onKeypoints?: (keypoints: FrameKeypoints) => void;
  /** 是否显示关键点叠加，默认 true */
  showLandmarks?: boolean;
  /** 视频宽度，默认 640 */
  width?: SizeProp;
  /** 视频高度，默认 480 */
  height?: SizeProp;
}

/** 状态提示文本映射 */
function getStatusText(
  isTracking: boolean,
  error: string | null,
): string {
  if (error) return error;
  if (isTracking) return '正在追踪';
  return '等待启动';
}

/**
 * 手语摄像头组件
 * - 提供摄像头预览与关键点叠加显示
 * - 支持启动/停止追踪
 * - 通过 onKeypoints 回调向上传递每帧关键点
 */
export function SignCamera({
  onKeypoints,
  showLandmarks = true,
  width = 640,
  height = 480,
}: SignCameraProps) {
  const resolvedWidth = useMemo(() => resolveSize(width, 640), [width]);
  const resolvedHeight = useMemo(() => resolveSize(height, 480), [height]);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    videoRef,
    canvasRef,
    isTracking,
    keypoints,
    error,
    start,
    stop,
  } = useHandTracking({ width: resolvedWidth.numeric, height: resolvedHeight.numeric });

  // 关键点变化时触发回调
  useEffect(() => {
    if (keypoints && onKeypoints) {
      onKeypoints(keypoints);
    }
  }, [keypoints, onKeypoints]);

  const statusText = getStatusText(isTracking, error);
  // 错误状态优先显示红色，追踪中显示绿色，等待显示灰色
  const statusColor = error
    ? 'text-red-500'
    : isTracking
      ? 'text-green-500'
      : 'text-gray-500';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 摄像头预览容器：圆角 + 半透明边框 */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl border border-white/40 bg-black shadow-lg"
        style={{ width: resolvedWidth.style, height: resolvedHeight.style }}
      >
        {/* video 元素：隐藏，仅作为数据源 */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />

        {/* canvas 叠加层：显示视频帧与关键点 */}
        {showLandmarks ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          // 不显示关键点时，仅展示占位
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            关键点叠加已关闭
          </div>
        )}

        {/* 状态提示（左上角） */}
        <div className="absolute left-3 top-3 rounded-md bg-black/50 px-3 py-1 text-sm font-medium backdrop-blur-sm">
          <span className={statusColor}>● {statusText}</span>
        </div>
      </div>

      {/* 启动/停止按钮：渐变背景 */}
      <button
        type="button"
        onClick={isTracking ? stop : start}
        className={`rounded-lg px-6 py-2 font-medium text-white shadow-md transition-transform hover:scale-105 active:scale-95 ${
          isTracking
            ? 'bg-gradient-to-r from-red-500 to-rose-600'
            : 'bg-gradient-to-r from-brand-start to-brand-end'
        }`}
      >
        {isTracking ? '停止追踪' : '启动追踪'}
      </button>
    </div>
  );
}
