interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-dark-700/60 bg-dark-900/80 backdrop-blur-lg">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 shadow-glow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11V6a2 2 0 0 1 4 0v5" />
              <path d="M9 11v5a4 4 0 0 0 8 0v-5" />
              <path d="M9 11h8" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight text-content-primary">
              SignBridge
            </span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-content-tertiary">
              手语桥
            </span>
          </div>
        </div>

        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="rounded-lg p-2 text-content-secondary transition-colors hover:bg-dark-700 hover:text-content-primary md:hidden"
            aria-label="切换菜单"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
