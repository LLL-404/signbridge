/**
 * @file ErrorBoundary.tsx
 * @description 全局错误边界 —— 捕获子树渲染异常，避免整个应用白屏
 *
 * 职责：
 *   - 捕获子组件树渲染期、生命周期、构造函数中的同步错误
 *   - 提供降级 UI（错误摘要 + 重试按钮 + 错误 ID + 刷新页面）
 *   - 将错误上报到 console（生产环境可扩展为上报到监控服务）
 *
 * 限制：
 *   - 无法捕获事件回调、setTimeout、异步错误（需在调用处 try/catch）
 *   - 无法捕获 SSR 错误
 *
 * 参考：https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/modules/debug/logger';

const log = logger.module('ErrorBoundary');

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
  /** 错误唯一标识，用于上报与显示 */
  errorId: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // 生成简易错误 ID（时间戳 + 随机后缀），便于用户上报问题时引用
    const errorId = `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { error, errorId };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 控制台输出完整错误信息（含组件栈），便于本地调试
    log.error('捕获到未处理错误', error, info);
    // 触发外部上报回调
    this.props.onError?.(error, info);
  }

  /** 重置错误状态，触发子树重新渲染 */
  reset = (): void => {
    this.setState({ error: null, errorId: null });
  };

  /** 刷新当前页面（重试机制之一） */
  reload = (): void => {
    try {
      window.location.reload();
    } catch (e) {
      log.error('刷新页面失败', e);
    }
  };

  render(): ReactNode {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return <DefaultFallback error={error} errorId={errorId} onReset={this.reset} onReload={this.reload} />;
  }
}

/** 默认降级 UI */
function DefaultFallback({
  error,
  errorId,
  onReset,
  onReload,
}: {
  error: Error;
  errorId: string | null;
  onReset: () => void;
  onReload: () => void;
}) {
  // 生产环境隐藏技术细节（如堆栈、错误类名），仅展示友好提示
  const isProd = import.meta.env.PROD;
  // 友好错误信息：生产环境使用通用文案，开发环境展示原始 message
  const friendlyMessage = isProd
    ? '应用遇到意外错误，请尝试重试或刷新页面。'
    : error.message || '未知错误';

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-900 p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
          <span className="text-2xl text-red-400">!</span>
        </div>
        <h1 className="mb-3 text-xl font-bold text-red-400">应用发生错误</h1>
        <p className="mb-2 break-words text-sm text-content-secondary">{friendlyMessage}</p>
        {errorId && (
          <p className="mb-6 text-xs text-content-muted">
            错误编号：<span className="font-mono">{errorId}</span>
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button type="button" onClick={onReset} className="btn-primary">
            重试
          </button>
          <button
            type="button"
            onClick={onReload}
            className="rounded-lg border border-dark-600 bg-dark-800 px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-dark-700 hover:text-content-primary"
          >
            刷新页面
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
