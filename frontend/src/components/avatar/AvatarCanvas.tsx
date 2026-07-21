import { Component, lazy, memo, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { VRM } from '@pixiv/three-vrm';
import type { BonePose, VRMPose } from '@/types/avatar';
import type { VRMAnimator } from '@/modules/avatar/VRMAnimator';
import { useAvatarStore } from '@/stores/avatarStore';
import { logger } from '@/modules/debug/logger';

const log = logger.module('AvatarCanvas');

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
  /** VRM 模型加载完成回调，同时传递 VRM 和 VRMAnimator 实例 */
  onVRMLoaded?: (vrm: VRM, animator: VRMAnimator) => void;
  /** VRM 模型加载失败回调，外层可据此显示全局提示 */
  onVRMLoadError?: (error: Error) => void;
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
    log.warn('Avatar3D 渲染失败，降级到 2D 模式', error.message);
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

function AvatarCanvasInner({
  pose,
  vrmPose,
  width = '100%',
  height = '100%',
  className,
  style,
  onVRMLoaded,
  onVRMLoadError,
}: AvatarCanvasProps) {
  const mode = useAvatarStore((s) => s.mode);
  const setMode = useAvatarStore((s) => s.setMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglAvailable] = useState(() => hasWebGL());
  // VRM 加载失败时触发自动降级到 2D 模式
  const [vrmLoadFailed, setVrmLoadFailed] = useState(false);

  const size = useContainerSize(containerRef);
  // WebGL 不可用时强制降级到 2D；VRM 加载失败时也降级
  const effectiveMode = (mode === '3d' && webglAvailable && !vrmLoadFailed) ? '3d' : '2d';
  // 是否因环境原因（WebGL 不可用）被动降级，用于显示提示
  const showWebglFallbackTip = mode === '3d' && !webglAvailable;

  const handleFallback = () => {
    setMode('2d');
  };

  // VRM 加载失败处理：切换到 2D 模式并向上通知
  const handleVRMLoadError = (error: Error) => {
    log.warn('VRM 加载失败，自动降级到 2D 模式', error.message);
    setVrmLoadFailed(true);
    setMode('2d');
    onVRMLoadError?.(error);
  };

  const containerStyle: CSSProperties = {
    width,
    height,
    ...style,
  };

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      {/* WebGL 不可用兜底提示：告知用户为何降级到 2D */}
      {showWebglFallbackTip && (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-200"
        >
          ⚠️ 当前环境不支持 WebGL，已自动切换到 2D 模式
        </div>
      )}
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
              onVRMLoaded={onVRMLoaded}
              onVRMLoadError={handleVRMLoadError}
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

/**
 * memo 浅比较说明：
 * - pose / vrmPose：useAvatarPlayer 已将 vrmPose 改为常量引用（NEUTRAL_VRM_POSE），
 *   pose 通过节流后的 setPose 更新，每次都是新对象引用，memo 不会阻止必要的重渲染；
 *   当父组件因其他 state 变化重渲染但 pose 引用未变时，memo 才会跳过——这正是期望行为。
 * - onVRMLoaded / onVRMLoadError：调用方应使用 useCallback 稳定引用（已是项目惯例）。
 * - width / height / className / style：通常为字面量或稳定引用。
 * - 内部 useAvatarStore 订阅不受 memo 影响，store 变化仍会触发重渲染。
 */
export default memo(AvatarCanvasInner);
