import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { HourState } from '@/lib/crowd';

export const LEVEL_BG: Record<HourState, string> = {
  quiet: 'bg-level-quiet',
  normal: 'bg-level-normal',
  busy: 'bg-level-busy',
  peak: 'bg-level-peak',
  closed: 'bg-level-closed',
  nodata: 'bg-level-closed',
};

export const LEVEL_TEXT: Record<HourState, string> = {
  quiet: 'text-level-quiet',
  normal: 'text-level-normal',
  busy: 'text-level-busy',
  peak: 'text-level-peak',
  closed: 'text-fg-subtle',
  nodata: 'text-fg-subtle',
};

/** Colour dot + label; the label always carries the meaning, colour only reinforces it. */
export function LevelPill({ state, className }: { state: HourState; className?: string }) {
  const t = useTranslations('levels');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-2.5 py-1 text-xs font-semibold text-fg',
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', LEVEL_BG[state])} aria-hidden />
      {t(state)}
    </span>
  );
}
