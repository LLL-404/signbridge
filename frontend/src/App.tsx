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
import { logger } from '@/modules/debug/logger';
import { startupTracker, type PhaseRecord } from '@/modules/debug/StartupTracker';

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
  const [currentPhase, setCurrentPhase] = useState<PhaseRecord | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // 监听 StartupTracker 阶段变化
  useEffect(() => {
    const unsubscribe = startupTracker.onPhaseChange((phases) => {
      const running = phases.find(p => p.status === 'running');
      setCurrentPhase(running ?? null);
      const failed = phases.find(p => p.status === 'failed');
      if (failed) setStartupError(failed.error ?? '未知错误');
    });
    return unsubscribe;
  }, []);

  // 计时器：每 100ms 更新已用时间
  useEffect(() => {
    if (!currentPhase && pluginsReady) return;
    const timer = setInterval(() => {
      setElapsed(startupTracker.getTotalDuration());
    }, 100);
    return () => clearInterval(timer);
  }, [currentPhase, pluginsReady]);

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

  if (!pluginsReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-900">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl">✋</div>
          {startupError ? (
            <>
              <p className="text-sm text-red-400">启动失败</p>
              <p className="text-xs text-content-muted">{startupError}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-1.5 rounded-lg bg-accent-500 text-white text-sm hover:bg-accent-600"
              >
                重试
              </button>
            </>
          ) : (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
              <p className="text-sm text-content-secondary">
                {currentPhase?.label ?? '手语桥启动中...'}
              </p>
              <p className="text-xs text-content-muted font-mono">
                {(elapsed / 1000).toFixed(1)}s
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppRoutes />
      </BrowserRouter>
      <PerformancePanel />
    </ErrorBoundary>
  );
}

export default App;
