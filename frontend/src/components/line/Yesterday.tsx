'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useBusReliability, useBusRidership } from '@/lib/live/client';

/** What actually happened yesterday: trips run, cancellations, punctuality, journeys. */
export function Yesterday({ code }: { code: string }) {
  const t = useTranslations('yesterday');
  const locale = useLocale();
  const reliability = useBusReliability();
  const ridership = useBusRidership();
  const r = reliability.data?.lines[code];
  const journeys = ridership.data?.lines[code];
  if (!r && !journeys) return null;

  const n = new Intl.NumberFormat(locale);
  const pct = new Intl.NumberFormat(locale, { style: 'percent' });
  const date = reliability.data?.date ?? ridership.data?.date;
  const label = date
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
    : '';

  const items: [string, string][] = [];
  if (r) {
    items.push([t('trips'), n.format(r.trips)]);
    items.push([t('completed'), r.trips ? pct.format(r.completed / r.trips) : '—']);
    if (r.cancelled) items.push([t('cancelled'), n.format(r.cancelled)]);
    if (r.onTimeShare != null) items.push([t('onTime'), pct.format(r.onTimeShare)]);
  }
  if (journeys) items.push([t('journeys'), n.format(journeys)]);

  return (
    <div className="px-4 py-5 sm:px-5">
      <h2 className="eyebrow mb-3">
        {t('title')} · <span className="normal-case tracking-normal">{label}</span>
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-fg-muted">{k}</dt>
            <dd className="font-display text-lg font-semibold tabular-nums leading-tight">{v}</dd>
          </div>
        ))}
      </dl>
      {r?.medianDelayMin != null ? (
        <p className="mt-3 text-sm text-fg-muted">{t('delay', { min: n.format(Math.max(0, r.medianDelayMin)) })}</p>
      ) : null}
      <p className="mt-2 text-xs text-fg-subtle">{t('source')}</p>
    </div>
  );
}
