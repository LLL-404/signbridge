import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: string;
}

export function PageHeader({ title, subtitle, actions, icon }: PageHeaderProps) {
  return (
    <header className="mb-8 animate-fade-up">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            {icon && (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/10 text-lg text-accent-400">
                {icon}
              </span>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-content-primary">
              {title}
            </h1>
          </div>
          {subtitle && (
            <p className="mt-1.5 text-sm text-content-secondary">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export default PageHeader;
