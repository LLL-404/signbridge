import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { pluginManager } from '@/kernel';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navItems = pluginManager.getMenuItems();

  // 移动端抽屉模式下：按 Escape 键关闭侧边栏（键盘可访问性）
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <aside
      id="app-sidebar"
      className={`fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-dark-700/60 bg-dark-900/95 backdrop-blur-xl transition-transform duration-300 md:static md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label="主导航"
    >
      <div className="h-16 md:hidden" />

      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="主菜单">
        <div className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
          导航
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.route}
            onClick={onClose}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent-500/10 text-accent-300'
                  : 'text-content-secondary hover:bg-dark-800 hover:text-content-primary'
              }`
            }
            aria-label={item.label}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 h-5 w-0.5 rounded-r-full bg-accent-500" aria-hidden="true" />
                )}
                {/* 导航项图标：装饰性，对屏幕阅读器隐藏（已有 aria-label 朗读文字） */}
                <span className="text-base" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-dark-700/60 p-4">
        <p className="text-xs text-content-tertiary">
          SignBridge v1.0
        </p>
      </div>
    </aside>
  );
}

export default Sidebar;
