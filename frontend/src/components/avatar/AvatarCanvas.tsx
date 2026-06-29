// 虚拟人容器组件：3D/2D 模式切换 + 错误边界自动降级
import { Component, lazy, Suspense, type CSSProperties, type ReactNode } from 'react';
import type { BonePose } from '@/types/avatar';
import { useAvatarStore } from '@/stores/avatarStore';

// 懒加载 3D 组件，避免 Three.js 初始包过大
const Avatar3D = lazy(() => import('./Avatar3D'));
const Avatar2D = lazy(() => import('./Avatar2D'));

/** 尺寸类型：数字像素或字符串（百分比等） */
type SizeProp = number | string;

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
  /** 画布宽度（数字为像素，字符串支持百分比等） */
  width?: SizeProp;
  /** 画布高度（数字为像素，字符串支持百分比等） */
  height?: SizeProp;
  /** 自定义类名 */
  className?: string;
  /** 自定义内联样式 */
  style?: CSSProperties;
}

/** 解析尺寸为 CSS 可用值 */
function resolveSize(size: SizeProp | undefined, fallback: SizeProp): SizeProp {
  return size ?? fallback;
}

interface AvatarErrorBoundaryProps {
  children: ReactNode;
  pose?: BonePose;
  onFallback?: () => void;
  fallbackWidth: SizeProp;
  fallbackHeight: SizeProp;
  fallbackClassName?: string;
  fallbackStyle?: CSSProperties;
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
      return (
        <Avatar2D
          pose={this.props.pose}
          width={this.props.fallbackWidth}
          height={this.props.fallbackHeight}
          className={this.props.fallbackClassName}
          style={this.props.fallbackStyle}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * 虚拟人容器组件
 * - 默认使用 3D 模式，WebGL 不可用自动降级为 2D
 * - 若 3D 组件在渲染过程中抛出异常，自动降级到 2D
 */
export default function AvatarCanvas({
  pose,
  width = 400,
  height = 500,
  className,
  style,
}: AvatarCanvasProps) {
  const mode = useAvatarStore((s) => s.mode);
  const setMode = useAvatarStore((s) => s.setMode);
  const webglAvailable = hasWebGL();
  const effectiveMode = mode === '3d' && webglAvailable ? '3d' : '2d';

  const resolvedWidth = resolveSize(width, 400);
  const resolvedHeight = resolveSize(height, 500);

  // 3D 渲染失败时的降级回调
  const handleFallback = () => {
    setMode('2d');
  };

  const containerStyle: CSSProperties = {
    width: resolvedWidth,
    height: resolvedHeight,
    ...style,
  };

  // 2D 组件内部使用的数值尺寸（用于 Canvas 绘制）
  const numericWidth = typeof resolvedWidth === 'number' ? resolvedWidth : 400;
  const numericHeight = typeof resolvedHeight === 'number' ? resolvedHeight : 500;

  return (
    <div className={className} style={containerStyle}>
      <Suspense fallback={<div className="w-full h-full rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 text-sm">加载中...</div>}>
        {effectiveMode === '3d' ? (
          <AvatarErrorBoundary
            pose={pose}
            onFallback={handleFallback}
            fallbackWidth={numericWidth}
            fallbackHeight={numericHeight}
          >
            <Avatar3D
              pose={pose}
              width={numericWidth}
              height={numericHeight}
              containerStyle={{ width: '100%', height: '100%' }}
              className="!w-full !h-full"
            />
          </AvatarErrorBoundary>
        ) : (
          <Avatar2D
            pose={pose}
            width={numericWidth}
            height={numericHeight}
            className="!w-full !h-full"
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </Suspense>
    </div>
  );
}
