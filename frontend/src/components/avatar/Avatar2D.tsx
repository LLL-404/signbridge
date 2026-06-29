// 2D 虚拟人 React 组件：使用 Canvas 2D 渲染
import { useRef, useEffect } from 'react';
import type { BonePose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import { Skeleton2D } from '@/modules/avatar/skeleton/Skeleton2D';

/** Avatar2D 组件 Props */
export interface Avatar2DProps {
  /** 当前姿态 */
  pose?: BonePose;
  /** 画布宽度 */
  width?: number;
  /** 画布高度 */
  height?: number;
}

/** 2D 虚拟人组件：基于 Canvas 2D 渲染，每帧应用最新姿态 */
export default function Avatar2D({ pose, width = 400, height = 500 }: Avatar2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skeletonRef = useRef<Skeleton2D | null>(null);
  const poseRef = useRef<BonePose>(pose ?? NEUTRAL_POSE);

  // 初始化骨骼系统
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    skeletonRef.current = new Skeleton2D(ctx, width, height);
    // 首帧渲染
    skeletonRef.current.render(poseRef.current);

    return () => {
      skeletonRef.current = null;
    };
  }, [width, height]);

  // 姿态变化时立即重绘（2D 不需要 RAF 循环，按姿态更新驱动即可）
  useEffect(() => {
    poseRef.current = pose ?? NEUTRAL_POSE;
    if (skeletonRef.current) {
      skeletonRef.current.render(poseRef.current);
    }
  }, [pose]);

  return (
    <div
      style={{ width, height }}
      className="rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center"
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
