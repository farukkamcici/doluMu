'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/primitives/Skeleton';
import { Sheet } from '@/components/primitives/Sheet';
import type { BusSchedule, Direction } from '@/lib/api';
import type { Mode } from '@/lib/lines';
import { formatDuration } from '@/lib/time';
import { toDepartures, type Departure } from '@/lib/departures';
import { cn } from '@/lib/utils';

interface ScheduleCardProps {
  code: string;
  mode: Mode;
  schedule: BusSchedule | undefined;
  scheduleLoading: boolean;
  direction: Direction | null;
  /** Minutes since Istanbul midnight. */
  nowMinutes: number;
}

/** Planned departures from the first stop (buses); a short note for lines without a timetable here. */
export function ScheduleCard({ code, mode, schedule, scheduleLoading, direction, nowMinutes }: ScheduleCardProps) {
  const t = useTranslations('line.schedule');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);

  const departures = useMemo(() => (direction ? toDepartures(schedule?.[direction]) : []), [schedule, direction]);

  // Rail lines show their hours and frequency in the fact sheet instead.
  if (mode === 'ferry') {
    return (
      <div className="px-4 py-5 sm:px-5">
        <h2 className="eyebrow mb-1">{t('title')}</h2>
        <p className="text-sm text-fg-muted">{t('ferryNote')}</p>
      </div>
    );
  }

  if (scheduleLoading) {
    return (
      <div className="space-y-3 px-4 py-5 sm:px-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!departures.length) {
    return (
      <div className="space-y-2 px-4 py-5 sm:px-5">
        <h2 className="eyebrow">{t('title')}</h2>
        <p className="text-sm text-fg-muted">{t('unavailable')}</p>
      </div>
    );
  }

  const upcoming = departures.filter((d) => d.minutes >= nowMinutes).slice(0, 3);
  const from = direction ? schedule?.meta?.[direction]?.start : null;
  const labels = { min: tc('min'), hour: tc('hour') };

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">{t('title')}</h2>
        {from ? <p className="truncate text-xs text-fg-muted">{t('departsFrom', { stop: from })}</p> : null}
      </div>
      <p className="text-sm tabular-nums text-fg-muted">
        {t('firstLast', { first: departures[0].label, last: departures[departures.length - 1].label })}
      </p>
      <div className="mt-3 flex items-end gap-5">
        {upcoming.length ? (
          upcoming.map((d, i) => (
            <div key={d.minutes}>
              <p className={cn('font-display text-2xl font-bold leading-none tabular-nums', i > 0 && 'text-fg-muted')}>{d.label}</p>
              <p className={cn('mt-1 text-xs tabular-nums', i === 0 ? 'font-semibold' : 'text-fg-muted')}>
                {t('in', { duration: formatDuration(d.minutes - nowMinutes, labels) })}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-fg-muted">{t('noMoreToday')}</p>
        )}
        <button type="button" onClick={() => setOpen(true)} className="ml-auto shrink-0 self-center text-sm font-semibold underline underline-offset-4">
          {t('seeAll')}
        </button>
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t('fullTitle', { line: code })}
        description={from ? t('departsFrom', { stop: from }) : undefined}
      >
        <FullTimetable departures={departures} nowMinutes={nowMinutes} />
      </Sheet>
    </div>
  );
}

function FullTimetable({ departures, nowMinutes }: { departures: Departure[]; nowMinutes: number }) {
  const rows = useMemo(() => {
    const byHour = new Map<number, Departure[]>();
    for (const d of departures) {
      const hour = Math.floor(d.minutes / 60);
      byHour.set(hour, [...(byHour.get(hour) ?? []), d]);
    }
    return [...byHour.entries()];
  }, [departures]);

  return (
    <div className="divide-y divide-line pb-4">
      {rows.map(([hour, items]) => (
        <div key={hour} className="flex gap-4 py-2">
          <span className="w-8 shrink-0 font-display text-base font-bold tabular-nums">{String(hour % 24).padStart(2, '0')}</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-px">
            {items.map((d) => (
              <span key={d.minutes} className={cn('text-[15px] tabular-nums', d.minutes < nowMinutes && 'text-fg-subtle line-through')}>
                {String(d.minutes % 60).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
