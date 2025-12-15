'use client';

import { cn } from '@/lib/utils';

export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  rightSlot,
  disableBlur,
  className,
}) {
  return (
    <div
      className={cn(
        'sticky top-0 z-[120] w-full',
        disableBlur
          ? 'bg-background border-b border-white/10'
          : 'bg-background/80 backdrop-blur-md border-b border-white/10',
        className
      )}
    >
      {!disableBlur ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
      ) : null}
      <div className="relative mx-auto w-full max-w-3xl px-5 pb-2 pt-7 sm:pb-3 sm:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <div className="mt-0.5 shrink-0 rounded-2xl border border-primary/25 bg-primary/10 p-2">
                <Icon size={18} className="text-secondary" />
              </div>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-text sm:text-xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
              ) : null}
            </div>
          </div>

          {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
        </div>
      </div>
    </div>
  );
}
