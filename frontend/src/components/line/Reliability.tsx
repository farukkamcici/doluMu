'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { BusHistory } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Below this share of on-time departures a day is drawn in signal red. */
const POOR = 0.8;

/** How punctual the line actually was over the last two weeks (İETT's trip archive). */
export function Reliability({ history }: { history: BusHistory | undefined }) {
  const t = useTranslations('reliability');
  const locale = useLocale();
  const days = (history?.days ?? []).filter((d) => d.trips > 0);
  const last = days[days.length - 1];
  if (!last) return null;

  const n = new Intl.NumberFormat(locale);
  const pct = new Intl.NumberFormat(locale, { style: 'percent' });
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const rated = days.filter((d) => d.onTimeShare != null);
  const average = rated.length ? rated.reduce((sum, d) => sum + d.onTimeShare!, 0) / rated.length : null;

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">{t('title')}</h2>
        <span className="text-xs text-fg-muted">{t('days', { count: days.length })}</span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className={cn('font-display text-[40px] font-bold leading-none tabular-nums', (last.onTimeShare ?? 1) < POOR && 'text-signal')}>
            {last.onTimeShare != null ? pct.format(last.onTimeShare) : '—'}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {t('onTime')} · {t('yesterday')}
          </p>
        </div>
        {rated.length > 1 ? (
          <div className="flex h-14 shrink-0 items-end gap-[3px]" role="img" aria-label={average != null ? t('avg', { count: rated.length, pct: pct.format(average) }) : undefined}>
            {days.map((d, i) => (
              <span
                key={d.date}
                title={t('bar', {
                  date: dayLabel(d.date),
                  pct: d.onTimeShare != null ? pct.format(d.onTimeShare) : '—',
                  trips: n.format(d.trips),
                  cancelled: n.format(d.cancelled),
                })}
                className={cn(
                  'w-2 rounded-sm',
                  (d.onTimeShare ?? 1) < POOR ? 'bg-signal' : i === days.length - 1 ? 'bg-fg' : 'bg-fg/30',
                )}
                // 50–100 % on time spans the bar height, so day-to-day differences stay visible.
                style={{ height: `${Math.max(8, Math.min(100, ((d.onTimeShare ?? 0) - 0.5) * 200))}%` }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm">
        {t('summary', { trips: n.format(last.trips), cancelled: n.format(last.cancelled) })}
        {last.journeys ? ` · ${t('journeys', { count: n.format(last.journeys) })}` : null}
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        {last.medianDelayMin != null && last.medianDelayMin >= 1
          ? t('delay', { min: n.format(last.medianDelayMin) })
          : t('early')}
        {average != null && rated.length > 1 ? ` ${t('avg', { count: rated.length, pct: pct.format(average) })}.` : null}
      </p>
      <p className="mt-3 text-xs text-fg-subtle">{t('note')}</p>
    </div>
  );
}
