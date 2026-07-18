/**
 * @file App.tsx
 * @description 应用根组件 —— 内核启动 + 路由容器 + 数据初始化
 *
 * 职责：
 *   - 启动微内核：registerPlugins() 注册所有内置插件 → activateDefaultPlugins() 激活
 *   - 使用 BrowserRouter 包裹 AppRoutes，启用 HTML5 history 路由
 *   - 启动时调用 initializeVocabulary 将词汇数据导入 IndexedDB（后台并行加载）
 *   - 初始化失败时展示降级 UI（避免白屏）
 *   - 全局 ErrorBoundary 捕获子树渲染异常
 *
 * 性能优化：
 *   - PerformancePanel 改为 React.lazy，仅在用户按下 Ctrl+Shift+P 时加载
 *   - validateVocabulary 改为 useEffect 中动态 import 异步执行，不阻塞首屏渲染
 *   - 启动期使用 PageSkeleton 替代 spinner，视觉更接近真实布局，减少布局抖动
 *
 * 依赖：AppRoutes / DataInitializer / appStore / ErrorBoundary / plugins / PageSkeleton
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { initializeVocabulary } from '@/modules/data/DataInitializer';
import { useAppStore } from '@/stores/appStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import PageSkeleton from '@/components/common/PageSkeleton';
import { registerPlugins, activateDefaultPlugins } from '@/plugins';
import { logger } from '@/modules/debug/logger';
import { startupTracker } from '@/modules/debug/StartupTracker';

// PerformancePanel 懒加载：仅在用户按下 Ctrl+Shift+P 时才加载，避免首屏引入调试代码
const LazyPerformancePanel = lazy(() =>
  import('@/components/debug/PerformancePanel').then((m) => ({ default: m.PerformancePanel })),
);

const log = logger.module('App');

let pluginsRegistered = false;

/**
 * 应用根组件
 * 启动顺序（并行优化）：
 *   1. registerPlugins() —— 同步注册所有插件工厂
 *   2. activateDefaultPlugins() + initializeVocabulary() —— 并行执行
 *   3. 插件就绪后立即渲染路由，词汇数据继续后台加载
 *   4. 词汇数据加载完成后更新全局状态
 */
export function App() {
  const setVocabularyLoaded = useAppStore((s) => s.setVocabularyLoaded);
  const [pluginsReady, setPluginsReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [showPerfPanel, setShowPerfPanel] = useState(false);

  // 监听 StartupTracker 阶段变化（仅捕获失败错误用于降级 UI）
  useEffect(() => {
    const unsubscribe = startupTracker.onPhaseChange((phases) => {
      const failed = phases.find((p) => p.status === 'failed');
      if (failed) setStartupError(failed.error ?? '未知错误');
    });
    return unsubscribe;
  }, []);

  // 全局快捷键 Ctrl+Shift+P：触发 PerformancePanel 懒加载
  // 注意：PerformancePanel 内部仍保留 Ctrl+Shift+P 切换逻辑（用于 enabled/expanded）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowPerfPanel(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 开发环境异步校验词汇数据（动态 import，不阻塞首屏渲染）
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import('@/modules/data/validateVocabulary').then((m) => m.runVocabularyValidationOnStartup());
  }, []);

  useEffect(() => {
    if (!pluginsRegistered) {
      startupTracker.start('plugins-register', '注册插件');
      registerPlugins();
      pluginsRegistered = true;
      startupTracker.end('plugins-register');
    }

    let cancelled = false;

    startupTracker.start('plugins-activate', '激活插件');
    const activatePromise = activateDefaultPlugins()
      .then(() => {
        if (!cancelled) {
          startupTracker.end('plugins-activate');
          setPluginsReady(true);
          startupTracker.start('first-render', '首次渲染');
          // first-render 在组件渲染后 end
          requestAnimationFrame(() => startupTracker.end('first-render'));
        }
      })
      .catch((err: unknown) => {
        log.error('插件激活失败:', err);
        startupTracker.fail('plugins-activate', err);
        if (!cancelled) setPluginsReady(true);  // 即使失败也继续渲染
      });

    startupTracker.start('vocabulary-init', '加载词汇数据');
    const vocabPromise = initializeVocabulary()
      .then(() => {
        if (!cancelled) {
          startupTracker.end('vocabulary-init');
          setVocabularyLoaded(true);
        }
      })
      .catch((err: unknown) => {
        log.error('词汇数据初始化失败:', err);
        startupTracker.fail('vocabulary-init', err);
      });

    void Promise.all([activatePromise, vocabPromise]);

    return () => {
      cancelled = true;
    };
  }, [setVocabularyLoaded]);

  // 启动失败时仍保留错误 UI（提供重试入口）
  if (!pluginsReady && startupError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-900">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl">✋</div>
          <p className="text-sm text-red-400">启动失败</p>
          <p className="text-xs text-content-muted">{startupError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 rounded-lg bg-accent-500 text-white text-sm hover:bg-accent-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 启动期：渲染骨架屏（不通过 Layout，因为 pluginsReady=false 时 pluginManager 尚未激活）
  if (!pluginsReady) {
    return <PageSkeleton />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppRoutes />
      </BrowserRouter>
      {showPerfPanel && (
        <Suspense fallback={null}>
          <LazyPerformancePanel />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}

export default App;
