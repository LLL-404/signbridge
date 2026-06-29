/**
 * @file Layout.tsx
 * @description 布局容器 —— Header + Sidebar + Outlet
 *
 * 视觉特征：
 *   - 移动端侧边栏遮罩层（点击关闭）
 *   - 内容区最大宽度约束 + 居中
 *   - 整体深色氛围统一
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* 侧边栏 */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-dark-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuToggle={() => setSidebarOpen((v) => !v)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout;
