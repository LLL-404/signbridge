/**
 * @file ErrorBoundary.tsx
 * @description 全局错误边界 —— 捕获子树渲染异常，避免整个应用白屏
 *
 * 职责：
 *   - 捕获子组件树渲染期、生命周期、构造函数中的同步错误
 *   - 提供降级 UI（错误摘要 + 重试按钮 + 错误 ID）
 *   - 将错误上报到 console（生产环境可扩展为上报到监控服务）
 *
 * 限制：
 *   - 无法捕获事件回调、setTimeout、异步错误（需在调用处 try/catch）
 *   - 无法捕获 SSR 错误
 *
 * 参考：https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** 子树 */
  children: ReactNode;
  /** 自定义降级 UI（可选） */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** 错误回调（可用于上报监控） */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 控制台输出完整错误信息（含组件栈）
    console.error('[ErrorBoundary] 捕获到未处理错误:', error, info);
    this.props.onError?.(error, info);
  }

  /** 重置错误状态，触发子树重新渲染 */
  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return <DefaultFallback error={error} onReset={this.reset} />;
  }
}

/** 默认降级 UI */
function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-900 p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
          <span className="text-2xl text-red-400">!</span>
        </div>
        <h1 className="mb-3 text-xl font-bold text-red-400">应用发生错误</h1>
        <p className="mb-6 break-words text-sm text-content-secondary">{error.message}</p>
        <button type="button" onClick={onReset} className="btn-primary">
          重试
        </button>
      </div>
    </div>
  );
}

export default ErrorBoundary;
