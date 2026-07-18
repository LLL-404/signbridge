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

      {/* 移动端遮罩：作为可点击按钮关闭抽屉，role="button" + aria-label 支持屏幕阅读器 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-dark-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="关闭侧边栏菜单"
          onKeyDown={(e) => {
            // Enter/Space 键关闭抽屉（键盘可访问性）
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSidebarOpen(false);
            }
          }}
        />
      )}

      {/* 主区域：使用语义化 main 标签，skip-link 锚点 id="main-content" */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onMenuToggle={() => setSidebarOpen((v) => !v)}
          isMenuOpen={sidebarOpen}
        />

        <main id="main-content" className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]" aria-label="主内容区">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 md:px-10 md:py-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout;
