/**
 * @file App.tsx
 * @description 应用根组件 —— 内核启动 + 路由容器 + 数据初始化
 *
 * 职责：
 *   - 启动微内核：registerPlugins() 注册所有内置插件 → activateDefaultPlugins() 激活
 *   - 使用 BrowserRouter 包裹 AppRoutes，启用 HTML5 history 路由
 *   - 启动时调用 initializeVocabulary 将词汇数据导入 IndexedDB
 *   - 初始化失败时展示降级 UI（避免白屏）
 *   - 全局 ErrorBoundary 捕获子树渲染异常
 *
 * 依赖：AppRoutes / DataInitializer / appStore / ErrorBoundary / plugins
 */

import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { initializeVocabulary } from '@/modules/data/DataInitializer';
import { useAppStore } from '@/stores/appStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { PerformancePanel } from '@/components/debug/PerformancePanel';
import { registerPlugins, activateDefaultPlugins } from '@/plugins';

/**
 * 应用根组件
 * 启动顺序：
 *   1. registerPlugins() —— 同步注册所有插件工厂（不实例化）
 *   2. activateDefaultPlugins() —— 异步激活 activeByDefault 插件（注册路由/菜单）
 *   3. initializeVocabulary() —— 异步初始化词汇数据
 *   4. 渲染 BrowserRouter + AppRoutes
 */
export function App() {
  const setVocabularyLoaded = useAppStore((s) => s.setVocabularyLoaded);
  const [initError, setInitError] = useState<string | null>(null);
  const [pluginsReady, setPluginsReady] = useState(false);

  // 同步注册插件（仅注册工厂，不激活）
  // 使用模块级 flag 避免 StrictMode 双调用导致重复注册
  useEffect(() => {
    registerPlugins();
    let cancelled = false;
    void activateDefaultPlugins()
      .then(() => {
        if (!cancelled) setPluginsReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('插件激活失败:', err);
          // 即使插件激活失败也允许渲染（routes 会为空，显示回退）
          setPluginsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 初始化词汇数据
  useEffect(() => {
    let cancelled = false;
    void initializeVocabulary()
      .then(() => {
        if (!cancelled) setVocabularyLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('词汇数据初始化失败:', err);
          setInitError(err instanceof Error ? err.message : '初始化失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setVocabularyLoaded]);

  // 初始化失败时显示错误提示，避免页面空白难以排查
  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-900 p-6">
        <div className="card max-w-md p-8 text-center">
          <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
            <span className="text-2xl text-red-400">!</span>
          </div>
          <h1 className="mb-3 text-xl font-bold text-red-400">词汇数据加载失败</h1>
          <p className="mb-4 text-sm text-content-secondary">{initError}</p>
          <p className="text-xs text-content-muted">请检查 /data/vocabulary.json 是否存在并刷新重试</p>
        </div>
      </div>
    );
  }

  // 插件未就绪时显示启动屏（避免路由为空时闪烁）
  if (!pluginsReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-t-transparent" />
          <p className="text-content-secondary">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <PerformancePanel />
    </ErrorBoundary>
  );
}

export default App;
