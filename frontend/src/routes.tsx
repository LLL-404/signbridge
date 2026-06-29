/**
 * @file routes.tsx
 * @description 应用路由配置 —— 从内核插件管理器读取插件贡献的路由
 *
 * 设计：
 *   - 路由不再静态硬编码，而是由 pluginManager.getRoutes() 动态聚合
 *   - 每个插件通过 manifest.routes 声明自己贡献的路由（懒加载组件）
 *   - 未知路由回退到默认页 /voice-to-sign
 *
 * 依赖：pluginManager（内核）/ Layout（布局容器）
 */

import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { pluginManager } from '@/kernel';
import type { RouteConfig } from '@/kernel';

/** 路由加载占位 */
function RouteLoading() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-t-transparent" />
      <p className="text-sm text-content-muted">页面加载中...</p>
    </div>
  );
}

/** 将插件贡献的 RouteConfig 转为 React.lazy 组件 */
function toLazyComponent(route: RouteConfig): ComponentType<unknown> {
  const LazyComp = lazy(async () => {
    const mod = await route.component();
    return { default: mod.default as ComponentType<unknown> };
  });
  return LazyComp;
}

/**
 * 应用路由配置
 * 从 pluginManager 读取所有已注册插件贡献的路由，动态构建 <Route>
 */
export function AppRoutes() {
  const routes = pluginManager.getRoutes();

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/voice-to-sign" replace />} />
        {routes.map((route) => {
          const Comp = toLazyComponent(route);
          return (
            <Route
              key={route.path}
              path={route.path}
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Comp />
                </Suspense>
              }
            />
          );
        })}
        {/* 未知路由回退到默认页 */}
        <Route path="*" element={<Navigate to="/voice-to-sign" replace />} />
      </Route>
    </Routes>
  );
}
