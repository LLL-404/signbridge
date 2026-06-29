/**
 * @file main.tsx
 * @description React 应用入口 —— 整个手语翻译系统的启动点
 *
 * 职责：
 *   - 使用 createRoot 将根组件 App 挂载到 DOM #root 节点
 *   - 启用 StrictMode 严格模式（开发期额外检查：重复渲染检测、废弃 API 警告）
 *   - 引入全局样式 global.css（Tailwind 基础层 + 自定义动画）
 *
 * 渲染树：main.tsx → App → BrowserRouter → AppRoutes → 各业务页面
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import '@/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
