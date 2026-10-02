'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/primitives/Skeleton';
import { Button } from '@/components/primitives/Button';
import { Sheet } from '@/components/primitives/Sheet';
import type { BusSchedule, Direction } from '@/lib/api';
import type { Mode } from '@/lib/lines';
import type { TopologyLine } from '@/lib/topology';
import { formatDuration, parseClock } from '@/lib/time';
import { cn } from '@/lib/utils';

interface Departure {
  label: string;
  /** Minutes since service-day start; values past midnight continue above 1440. */
  minutes: number;
}

/** Timetables list post-midnight trips last ("00:15" after "23:50"); keep them in order. */
function toDepartures(times: string[] | undefined): Departure[] {
  const out: Departure[] = [];
  let offset = 0;
  let previous = -1;
  for (const label of times ?? []) {
    const base = parseClock(label);
    if (base == null) continue;
    if (base + offset < previous) offset += 1440;
    previous = base + offset;
    out.push({ label, minutes: previous });
  }
  return out;
}

interface ScheduleCardProps {
  code: string;
  mode: Mode;
  schedule: BusSchedule | undefined;
  scheduleLoading: boolean;
  direction: Direction | null;
  topoLine: TopologyLine | null;
  /** Minutes since Istanbul midnight. */
  nowMinutes: number;
}

function FirstLast({ first, last }: { first: string; last: string }) {
  const t = useTranslations('line.schedule');
  return (
    <div className="flex gap-8">
      <div>
        <p className="eyebrow">{t('first')}</p>
        <p className="font-display text-[28px] font-bold leading-tight tabular-nums">{first}</p>
      </div>
      <div>
        <p className="eyebrow">{t('last')}</p>
        <p className="font-display text-[28px] font-bold leading-tight tabular-nums">{last}</p>
      </div>
    </div>
  );
}

export function ScheduleCard({ code, mode, schedule, scheduleLoading, direction, topoLine, nowMinutes }: ScheduleCardProps) {
  const t = useTranslations('line.schedule');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);

  const departures = useMemo(() => (direction ? toDepartures(schedule?.[direction]) : []), [schedule, direction]);

  if (mode === 'rail' || mode === 'ferry') {
    const note = mode === 'ferry' ? t('ferryNote') : code === 'MARMARAY' ? t('marmarayNote') : t('railFrequency');
    return (
      <div className="space-y-3 px-4 py-5 sm:px-5">
        <h2 className="eyebrow">{t('railHours')}</h2>
        {topoLine ? <FirstLast first={topoLine.first_time} last={topoLine.last_time} /> : null}
        <p className="text-sm text-fg-muted">{note}</p>
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

  const upcoming = departures.filter((d) => d.minutes >= nowMinutes).slice(0, 4);
  const from = direction ? schedule?.meta?.[direction]?.start : null;
  const labels = { min: tc('min'), hour: tc('hour') };

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">{t('title')}</h2>
        {from ? <p className="truncate text-xs text-fg-muted">{t('departsFrom', { stop: from })}</p> : null}
      </div>
      <FirstLast first={departures[0].label} last={departures[departures.length - 1].label} />

      <p className="eyebrow mb-1 mt-5">{t('next')}</p>
      {upcoming.length ? (
        <ul className="border-t border-line">
          {upcoming.map((d, i) => (
            <li key={d.minutes} className="flex items-baseline justify-between border-b border-line py-2.5">
              <span className={cn('font-display text-xl font-bold tabular-nums', i > 0 && 'text-fg-muted')}>{d.label}</span>
              <span className={cn('text-sm tabular-nums', i === 0 ? 'font-semibold' : 'text-fg-muted')}>
                {t('in', { duration: formatDuration(d.minutes - nowMinutes, labels) })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-fg-muted">{t('noMoreToday')}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">{t('planned')}</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          {t('seeAll')}
        </Button>
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
