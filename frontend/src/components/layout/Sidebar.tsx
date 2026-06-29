import { NavLink } from 'react-router-dom';
import { pluginManager } from '@/kernel';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navItems = pluginManager.getMenuItems();

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-dark-700/60 bg-dark-900/95 backdrop-blur-xl transition-transform duration-300 md:static md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-16 md:hidden" />

      <nav className="flex flex-1 flex-col gap-1 p-3">
        <div className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
          导航
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.route}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent-500/10 text-accent-300'
                  : 'text-content-secondary hover:bg-dark-800 hover:text-content-primary'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 h-5 w-0.5 rounded-r-full bg-accent-500" />
                )}
                <span className="text-base">{item.icon}</span>
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
