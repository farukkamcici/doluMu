import { cn } from '@/lib/utils';
import { RAIL_COLORS, modeOf, readableOn } from '@/lib/lines';

interface LineBadgeProps {
  code: string;
  typeId?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Line code plate. Rail lines wear their official colour; Metrobüs and Marmaray are solid ink,
 * buses an ink outline (İETT has no per-line colours), ferries sea blue.
 */
export function LineBadge({ code, typeId, size = 'md', className }: LineBadgeProps) {
  const official = RAIL_COLORS[code];
  const mode = modeOf(code, typeId);
  const label = code === 'MARMARAY' ? 'Marmaray' : code;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-display font-bold leading-none tracking-tight',
        size === 'sm' && 'h-6 min-w-[2.25rem] px-1.5 text-[13px]',
        size === 'md' && 'h-8 min-w-[2.75rem] px-2 text-base',
        size === 'lg' && 'h-12 min-w-[3.75rem] px-2.5 text-2xl',
        !official && mode === 'bus' && 'border-[1.5px] border-fg text-fg',
        !official && (mode === 'metrobus' || mode === 'rail') && 'bg-fg text-bg',
        !official && mode === 'ferry' && 'bg-mode-ferry text-white',
        className,
      )}
      style={official ? { backgroundColor: official, color: readableOn(official) } : undefined}
    >
      {label}
    </span>
  );
}
