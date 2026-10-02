'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useCapacity } from '@/lib/queries';
import type { HourPoint } from '@/lib/crowd';
import { formatHour } from '@/lib/time';
import { cn } from '@/lib/utils';

interface DetailsCardProps {
  code: string;
  point: HourPoint | null;
}

/** Collapsible methodology + raw numbers behind the selected hour (capacity, occupancy). */
export function DetailsCard({ code, point }: DetailsCardProps) {
  const t = useTranslations('line.details');
  const locale = useLocale();
  const fmt = new Intl.NumberFormat(locale);
  const pct = new Intl.NumberFormat(locale, { style: 'percent' });
  const [open, setOpen] = useState(false);
  const capacity = useCapacity(code, open);

  const n = (value: number | null | undefined) => (value == null ? '—' : fmt.format(Math.round(value)));
  const confidence = capacity.data?.confidence;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-card-hover sm:px-5"
      >
        <span className="flex-1 text-[15px] font-semibold">{t('title')}</span>
        <ChevronDown className={cn('h-4 w-4 text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-line px-4 pb-5 pt-4 text-sm leading-relaxed text-fg-muted sm:px-5">
          <p>{t('body')}</p>
          <p>{t('relative')}</p>

          {point && point.passengers != null ? (
            <div>
              <p className="mb-2 font-medium text-fg">{t('selectedHour', { hour: formatHour(point.hour) })}</p>
              <dl className="divide-y divide-line border-y border-line text-fg">
                <Row label={t('passengers')} value={n(point.passengers)} />
                <Row label={t('trips')} value={n(point.tripsPerHour)} />
                <Row label={t('vehicleCapacity')} value={n(point.vehicleCapacity)} />
                <Row label={t('hourCapacity')} value={n(point.capacity)} />
                <Row label={t('occupancy')} value={point.occupancyPct == null ? '—' : pct.format(point.occupancyPct / 100)} />
              </dl>
            </div>
          ) : null}

          {capacity.isLoading ? (
            <Skeleton className="h-4 w-2/3" />
          ) : confidence ? (
            <p className="text-xs text-fg-subtle">
              {confidence === 'static' ? t('confidenceStatic') : t('confidenceLow')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
