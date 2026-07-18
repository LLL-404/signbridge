/**
 * @file PageSkeleton.tsx
 * @description 通用页面骨架屏 —— 首屏启动期占位 UI
 *
 * 职责：
 *   - 在插件激活完成前（pluginsReady=false）替代 spinner，提供更接近真实布局的占位
 *   - 复用 Layout 框架结构：左侧 Sidebar（w-60，移动端隐藏）+ 顶部 Header（h-16）+ 主内容区
 *   - 所有骨架块使用 Tailwind 的 `animate-pulse` 实现脉动效果
 *   - 纯 React + Tailwind，不依赖任何外部库
 */

/** 骨架块 props */
interface SkeletonBlockProps {
  /** 附加的 Tailwind 类名（宽高/圆角等） */
  className?: string;
}

/**
 * 单个骨架块：基于 animate-pulse 的占位条
 * 默认使用 bg-dark-800 作为骨架色，与深色主题协调
 */
function SkeletonBlock({ className = '' }: SkeletonBlockProps): JSX.Element {
  return <div className={`animate-pulse rounded bg-dark-800 ${className}`} />;
}

/** 侧边栏骨架：复刻 Sidebar 的 w-60 宽度与菜单项结构 */
function SidebarSkeleton(): JSX.Element {
  return (
    <aside
      className="hidden w-60 flex-col border-r border-dark-700/60 bg-dark-900/95 md:flex"
      aria-hidden="true"
    >
      {/* 顶部标题区 */}
      <div className="px-3 pb-2 pt-3">
        <SkeletonBlock className="h-3 w-12" />
      </div>
      {/* 菜单项占位 */}
      <nav className="flex flex-1 flex-col gap-2 p-3" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 w-full" />
        ))}
      </nav>
      {/* 底部版本占位 */}
      <div className="border-t border-dark-700/60 p-4">
        <SkeletonBlock className="h-3 w-20" />
      </div>
    </aside>
  );
}

/** 顶部栏骨架：复刻 Header 的 h-16 高度与左右布局 */
function HeaderSkeleton(): JSX.Element {
  return (
    <header
      className="h-16 border-b border-dark-700/60 bg-dark-900/80"
      aria-hidden="true"
    >
      <div className="flex h-full items-center justify-between px-6">
        {/* 左侧 Logo + 标题 */}
        <div className="flex items-center gap-2.5">
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
          <div className="flex flex-col gap-1">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-2 w-10" />
          </div>
        </div>
        {/* 右侧移动端菜单按钮占位（仅移动端可见） */}
        <SkeletonBlock className="h-8 w-8 rounded-lg md:hidden" />
      </div>
    </header>
  );
}

/**
 * 主内容区骨架：标题 + 卡片网格
 * 命名导出，供 routes.tsx 的 Suspense fallback 复用（只渲染内容区，不含 Sidebar/Header）
 */
export function MainContentSkeleton(): JSX.Element {
  return (
    <main
      className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      aria-hidden="true"
    >
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 md:px-10 md:py-12">
        {/* 页面标题占位 */}
        <div className="mb-8 flex items-center gap-2.5">
          <SkeletonBlock className="h-9 w-9 rounded-lg" />
          <SkeletonBlock className="h-7 w-40" />
        </div>
        {/* 卡片网格占位 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-dark-700/60 bg-dark-900 p-4"
            >
              <SkeletonBlock className="mb-3 h-4 w-3/4" />
              <SkeletonBlock className="mb-2 h-3 w-full" />
              <SkeletonBlock className="mb-4 h-3 w-5/6" />
              <SkeletonBlock className="h-20 w-full" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

/**
 * 默认导出：完整页面骨架屏
 * 在 pluginsReady=false 时直接渲染（不通过 Layout，避免依赖 pluginManager）
 */
function PageSkeleton(): JSX.Element {
  return (
    <div className="flex min-h-screen bg-dark-900">
      <SidebarSkeleton />
      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderSkeleton />
        <MainContentSkeleton />
      </div>
    </div>
  );
}

export default PageSkeleton;
