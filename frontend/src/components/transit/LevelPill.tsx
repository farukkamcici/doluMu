import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { HourState } from '@/lib/crowd';
import { CrowdGlyph } from './CrowdGlyph';

export const LEVEL_TEXT: Record<HourState, string> = {
  quiet: 'text-fg',
  normal: 'text-fg',
  busy: 'text-fg',
  peak: 'text-signal',
  closed: 'text-fg-subtle',
  nodata: 'text-fg-subtle',
};

/** People glyph + level word. */
export function LevelPill({ state, className }: { state: HourState; className?: string }) {
  const t = useTranslations('levels');
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-semibold', LEVEL_TEXT[state], className)}>
      {state === 'closed' || state === 'nodata' ? null : <CrowdGlyph state={state} size="sm" />}
      {t(state)}
    </span>
  );
}
