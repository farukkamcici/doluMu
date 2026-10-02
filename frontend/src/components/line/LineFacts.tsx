'use client';
import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sheet } from '@/components/primitives/Sheet';
import { useFares } from '@/lib/live/client';
import type { BusLineInfo, MetroLine } from '@/lib/live/types';

interface LineFactsProps {
  metroLine: MetroLine | null;
  busInfo: BusLineInfo | null;
  /** Bus running time end to end, minutes: recorded for this hour (`live`) or İETT's planned time. */
  busTrip?: { minutes: number; live: boolean } | null;
}

/** Line "fact sheet": length, trip time, hours, frequency, riders, fare. */
export function LineFacts({ metroLine, busInfo, busTrip }: LineFactsProps) {
  const t = useTranslations('facts');
  const locale = useLocale();
  const fares = useFares();
  const [open, setOpen] = useState(false);
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  const f = metroLine?.facts;
  const lengthKm = f?.lengthKm ?? busInfo?.lengthKm ?? null;
  const twoFare = /2\s*B[İI]LET/i.test(busInfo?.tariff ?? '');
  const anon = fares.data?.find((x) => /anonim/i.test(x.card));
  const full = anon?.items.find((i) => /^tam/i.test(i.name))?.price;
  const student = fares.data?.find((x) => /anonim/i.test(x.card))?.items.find((i) => /öğrenci/i.test(i.name))?.price;

  const items: [string, ReactNode][] = [];
  if (lengthKm) items.push([t('length'), t('km', { n: n.format(lengthKm) })]);
  if (f?.tripMinutes) items.push([t('trip'), t('min', { n: n.format(f.tripMinutes) })]);
  else if (busTrip) items.push([busTrip.live ? t('tripNow') : t('trip'), t('min', { n: n.format(Math.round(busTrip.minutes)) })]);
  if (metroLine?.firstTime) items.push([t('hours'), `${metroLine.firstTime}–${metroLine.lastTime}`]);
  if (f?.dailyRiders) items.push([t('riders'), n.format(f.dailyRiders)]);
  if (f?.vehicles) items.push([t('vehicles'), n.format(f.vehicles)]);
  if (full) items.push([t('fare'), twoFare ? `2 × ${full}` : full]);
  if (student && !twoFare) items.push([t('fareStudent'), student]);

  if (!items.length && !f?.headway.length) return null;

  return (
    <div className="px-4 py-5 sm:px-5">
      <h2 className="eyebrow mb-3">{t('title')}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-fg-muted">{label}</dt>
            <dd className="font-display text-lg font-semibold tabular-nums leading-tight">{value}</dd>
          </div>
        ))}
      </dl>
      {f?.headway.length ? (
        <div className="mt-3">
          <p className="text-xs text-fg-muted">{t('headway')}</p>
          {f.headway.map((h) => (
            <p key={h} className="text-sm font-medium">
              {h}
            </p>
          ))}
        </div>
      ) : null}
      {twoFare ? <p className="mt-3 text-sm text-fg-muted">{t('fareTwo')}</p> : null}
      {fares.data?.length ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-semibold underline underline-offset-4">
          {t('fares')}
        </button>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen} title={t('faresTitle')}>
        <div className="-mx-5 pb-6">
          {fares.data?.map((card) => (
            <div key={card.card} className="pb-3">
              <p className="eyebrow px-5 pb-1 pt-2">{card.card}</p>
              <dl className="border-y border-line">
                {card.items.map((item) => (
                  <div key={item.name} className="flex justify-between gap-4 border-b border-line px-5 py-2.5 last:border-b-0">
                    <dt className="text-sm">{item.name}</dt>
                    <dd className="font-display font-semibold tabular-nums">{item.price}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
