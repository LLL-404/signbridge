import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BonePose, VRMPose } from '@/types/avatar';
import { useAvatarStore } from '@/stores/avatarStore';

const Avatar3D = lazy(() => import('./Avatar3D'));
const Avatar2D = lazy(() => import('./Avatar2D'));

type SizeProp = number | string;

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

export interface AvatarCanvasProps {
  pose?: BonePose;
  /** VRM 标准姿态（新骨骼轨道，3D VRM 模式下优先使用） */
  vrmPose?: VRMPose;
  width?: SizeProp;
  height?: SizeProp;
  className?: string;
  style?: CSSProperties;
}

interface AvatarErrorBoundaryProps {
  children: ReactNode;
  pose?: BonePose;
  onFallback?: () => void;
  size: { width: number; height: number };
  fallbackClassName?: string;
  fallbackStyle?: CSSProperties;
}
interface AvatarErrorBoundaryState {
  hasError: boolean;
}

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
          width={this.props.size.width}
          height={this.props.size.height}
          className={this.props.fallbackClassName}
          style={this.props.fallbackStyle}
        />
      );
    }
    return this.props.children;
  }
}

function useContainerSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 400, height: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.max(100, Math.round(rect.width)),
        height: Math.max(100, Math.round(rect.height)),
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(el);

    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [containerRef]);

  return size;
}

export default function AvatarCanvas({
  pose,
  vrmPose,
  width = '100%',
  height = '100%',
  className,
  style,
}: AvatarCanvasProps) {
  const mode = useAvatarStore((s) => s.mode);
  const setMode = useAvatarStore((s) => s.setMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglAvailable, setWebglAvailable] = useState(true);

  useEffect(() => {
    setWebglAvailable(hasWebGL());
  }, []);

  const size = useContainerSize(containerRef);
  const effectiveMode = mode === '3d' && webglAvailable ? '3d' : '2d';

  const handleFallback = () => {
    setMode('2d');
  };

  const containerStyle: CSSProperties = {
    width,
    height,
    ...style,
  };

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      <Suspense fallback={<div className="w-full h-full rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 text-sm">加载中...</div>}>
        {effectiveMode === '3d' ? (
          <AvatarErrorBoundary
            pose={pose}
            onFallback={handleFallback}
            size={size}
            fallbackClassName="!w-full !h-full"
            fallbackStyle={{ width: '100%', height: '100%' }}
          >
            <Avatar3D
              pose={pose}
              vrmPose={vrmPose}
              width="100%"
              height="100%"
              containerStyle={{ width: '100%', height: '100%' }}
              className="!w-full !h-full"
            />
          </AvatarErrorBoundary>
        ) : (
          <Avatar2D
            pose={pose}
            width={size.width}
            height={size.height}
            className="!w-full !h-full"
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </Suspense>
    </div>
  );
}
