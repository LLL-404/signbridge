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

  useEffect(() => {
    if (!pluginsRegistered) {
      registerPlugins();
      pluginsRegistered = true;
    }

    let cancelled = false;

    const activatePromise = activateDefaultPlugins()
      .then(() => {
        if (!cancelled) setPluginsReady(true);
      })
      .catch((err: unknown) => {
        console.error('插件激活失败:', err);
        if (!cancelled) setPluginsReady(true);
      });

    const vocabPromise = initializeVocabulary()
      .then(() => {
        if (!cancelled) setVocabularyLoaded(true);
      })
      .catch((err: unknown) => {
        console.error('词汇数据初始化失败:', err);
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
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
          <p className="text-sm text-content-secondary">手语桥启动中...</p>
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
