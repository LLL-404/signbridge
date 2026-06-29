// 虚拟人容器组件：3D/2D 模式切换 + 错误边界自动降级
import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { BonePose } from '@/types/avatar';
import { useAvatarStore } from '@/stores/avatarStore';

// 懒加载 3D 组件，避免 Three.js 初始包过大
const Avatar3D = lazy(() => import('./Avatar3D'));
const Avatar2D = lazy(() => import('./Avatar2D'));

/** 检测浏览器是否支持 WebGL */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ?? canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

/** AvatarCanvas 组件 Props */
export interface AvatarCanvasProps {
  /** 当前姿态（可选，未传则使用 store 中的姿态） */
  pose?: BonePose;
  /** 画布宽度 */
  width?: number;
  /** 画布高度 */
  height?: number;
}

/** 加载占位 */
function LoadingPlaceholder({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{ width, height }}
      className="rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 text-sm"
    >
      加载中...
    </div>
  );
}

interface AvatarErrorBoundaryProps {
  children: ReactNode;
  width: number;
  height: number;
  pose?: BonePose;
  onFallback?: () => void;
}
interface AvatarErrorBoundaryState {
  hasError: boolean;
}

/** 错误边界：3D 渲染失败时降级到 2D 模式 */
class AvatarErrorBoundary extends Component<AvatarErrorBoundaryProps, AvatarErrorBoundaryState> {
  constructor(props: AvatarErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AvatarErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.warn('Avatar3D 渲染失败，降级到 2D 模式:', error.message);
    this.props.onFallback?.();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <Avatar2D pose={this.props.pose} width={this.props.width} height={this.props.height} />;
    }
    return this.props.children;
  }
}

/**
 * 虚拟人容器组件
 * - 默认使用 3D 模式，WebGL 不可用自动降级为 2D
 * - 若 3D 组件在渲染过程中抛出异常，自动降级到 2D
 */
export default function AvatarCanvas({ pose, width = 400, height = 500 }: AvatarCanvasProps) {
  const mode = useAvatarStore((s) => s.mode);
  const setMode = useAvatarStore((s) => s.setMode);
  const webglAvailable = hasWebGL();
  const effectiveMode = mode === '3d' && webglAvailable ? '3d' : '2d';

  // 3D 渲染失败时的降级回调
  const handleFallback = () => {
    setMode('2d');
  };

  return (
    <Suspense fallback={<LoadingPlaceholder width={width} height={height} />}>
      {effectiveMode === '3d' ? (
        <AvatarErrorBoundary width={width} height={height} pose={pose} onFallback={handleFallback}>
          <Avatar3D pose={pose} width={width} height={height} />
        </AvatarErrorBoundary>
      ) : (
        <Avatar2D pose={pose} width={width} height={height} />
      )}
    </Suspense>
  );
}
