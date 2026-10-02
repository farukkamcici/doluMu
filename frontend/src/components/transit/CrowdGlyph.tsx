import { cn } from '@/lib/utils';
import type { HourState } from '@/lib/crowd';

const COUNT: Record<HourState, number> = { quiet: 1, normal: 2, busy: 3, peak: 4, closed: 0, nodata: 0 };

function Person({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 10 20" aria-hidden className={cn('h-full w-auto', className)}>
      <circle cx="5" cy="3.4" r="3" className={filled ? 'fill-current' : 'fill-current opacity-[0.16]'} />
      <path d="M1 9.5a4 4 0 0 1 8 0V20H1z" className={filled ? 'fill-current' : 'fill-current opacity-[0.16]'} />
    </svg>
  );
}

/**
 * Occupancy shown as people, after SBB/JR East: 1–4 figures filled, peak drawn in signal red.
 * Always paired with a text label by the caller.
 */
export function CrowdGlyph({ state, size = 'md', className }: { state: HourState; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const n = COUNT[state];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-end gap-[2px]',
        size === 'sm' && 'h-3.5',
        size === 'md' && 'h-[18px]',
        size === 'lg' && 'h-8 gap-[3px]',
        state === 'peak' ? 'text-signal' : 'text-fg',
        className,
      )}
    >
      {[1, 2, 3, 4].map((i) => (
        <Person key={i} filled={i <= n} />
      ))}
    </span>
  );
}
