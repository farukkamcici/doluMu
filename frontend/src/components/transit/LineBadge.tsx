import { cn } from '@/lib/utils';
import { RAIL_COLORS, modeOf, readableOn, type Mode } from '@/lib/lines';

const MODE_CLASSES: Record<Mode, string> = {
  bus: 'bg-mode-bus text-white dark:text-slate-950',
  metrobus: 'bg-mode-metrobus text-white dark:text-slate-950',
  rail: 'bg-mode-rail text-white dark:text-slate-950',
  ferry: 'bg-mode-ferry text-white dark:text-slate-950',
};

interface LineBadgeProps {
  code: string;
  typeId?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Line code pill; rail lines use their official colour, others the mode colour. */
export function LineBadge({ code, typeId, size = 'md', className }: LineBadgeProps) {
  const official = RAIL_COLORS[code];
  const mode = modeOf(code, typeId);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-bold tabular-nums tracking-tight',
        size === 'sm' && 'h-6 min-w-[2.25rem] px-1.5 text-xs',
        size === 'md' && 'h-8 min-w-[2.75rem] px-2 text-sm',
        size === 'lg' && 'h-11 min-w-[3.5rem] rounded-xl px-2.5 text-lg',
        !official && MODE_CLASSES[mode],
        className,
      )}
      style={official ? { backgroundColor: official, color: readableOn(official) } : undefined}
    >
      {code}
    </span>
  );
}
