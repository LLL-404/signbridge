// 2D 虚拟人 React 组件：使用 Canvas 2D 渲染
import { useRef, useEffect, type CSSProperties } from 'react';
import type { BonePose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import { Skeleton2D } from '@/modules/avatar/skeleton/Skeleton2D';

/** Avatar2D 组件 Props */
export interface Avatar2DProps {
  /** 当前姿态 */
  pose?: BonePose;
  /** 画布宽度（逻辑像素，用于 Canvas 分辨率） */
  width?: number | string;
  /** 画布高度（逻辑像素，用于 Canvas 分辨率） */
  height?: number | string;
  /** 自定义类名 */
  className?: string;
  /** 自定义内联样式 */
  style?: CSSProperties;
}

/** 2D 虚拟人组件：基于 Canvas 2D 渲染，每帧应用最新姿态 */
export default function Avatar2D({
  pose,
  width = 400,
  height = 500,
  className,
  style,
}: Avatar2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skeletonRef = useRef<Skeleton2D | null>(null);
  const poseRef = useRef<BonePose>(pose ?? NEUTRAL_POSE);

  // Canvas 内部绘制使用的数值尺寸
  const numericWidth = typeof width === 'number' ? width : 400;
  const numericHeight = typeof height === 'number' ? height : 500;

  const containerStyle: CSSProperties = { width, height, ...style };

  // 初始化骨骼系统
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    skeletonRef.current = new Skeleton2D(ctx, numericWidth, numericHeight);
    // 首帧渲染
    skeletonRef.current.render(poseRef.current);

    return () => {
      skeletonRef.current = null;
    };
  }, [numericWidth, numericHeight]);

  // 姿态变化时立即重绘（2D 不需要 RAF 循环，按姿态更新驱动即可）
  useEffect(() => {
    poseRef.current = pose ?? NEUTRAL_POSE;
    if (skeletonRef.current) {
      skeletonRef.current.render(poseRef.current);
    }
  }, [pose]);

  return (
    <div
      style={containerStyle}
      className={`rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center ${className ?? ''}`}
    >
      <canvas
        ref={canvasRef}
        width={numericWidth}
        height={numericHeight}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
