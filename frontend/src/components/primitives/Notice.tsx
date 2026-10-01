import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface NoticeProps {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'warn';
  className?: string;
}

/** Inline message for empty, error and informational states. */
export function Notice({ icon, title, children, action, tone = 'neutral', className }: NoticeProps) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl p-4 text-sm',
        tone === 'warn' ? 'bg-warn-soft text-fg' : 'bg-bg-subtle text-fg-muted',
        className,
      )}
    >
      {icon ? (
        <div className={cn('mt-0.5 shrink-0', tone === 'warn' ? 'text-warn' : 'text-fg-subtle')}>{icon}</div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium text-fg">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}
