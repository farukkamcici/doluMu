'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Info } from 'lucide-react';
import { Card } from '@/components/primitives/Card';
import { Skeleton } from '@/components/primitives/Skeleton';
import { Notice } from '@/components/primitives/Notice';
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

export function ScheduleCard({
  code,
  mode,
  schedule,
  scheduleLoading,
  direction,
  topoLine,
  nowMinutes,
}: ScheduleCardProps) {
  const t = useTranslations('line.schedule');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);

  const departures = useMemo(
    () => (direction ? toDepartures(schedule?.[direction]) : []),
    [schedule, direction],
  );

  const header = (
    <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
      <Clock className="h-4 w-4 text-fg-muted" />
      {mode === 'rail' && topoLine ? t('railHours') : t('title')}
    </h2>
  );

  if (mode === 'rail' || mode === 'ferry') {
    const note =
      mode === 'ferry' ? t('ferryNote') : code === 'MARMARAY' ? t('marmarayNote') : t('railFrequency');
    return (
      <Card className="p-5">
        {header}
        {topoLine ? (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Stat label={t('first')} value={topoLine.first_time} />
            <Stat label={t('last')} value={topoLine.last_time} />
          </div>
        ) : null}
        <Notice icon={<Info className="h-4 w-4" />}>{note}</Notice>
      </Card>
    );
  }

  if (scheduleLoading) {
    return (
      <Card className="space-y-4 p-5">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-12" />
      </Card>
    );
  }

  if (!departures.length) {
    return (
      <Card className="p-5">
        {header}
        <Notice icon={<Info className="h-4 w-4" />}>{t('unavailable')}</Notice>
      </Card>
    );
  }

  const upcoming = departures.filter((d) => d.minutes >= nowMinutes).slice(0, 3);
  const from = direction ? schedule?.meta?.[direction]?.start : null;
  const labels = { min: tc('min'), hour: tc('hour') };

  return (
    <Card className="p-5">
      {header}
      <div className="grid grid-cols-2 gap-3">
        <Stat label={t('first')} value={departures[0].label} />
        <Stat label={t('last')} value={departures[departures.length - 1].label} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-sm font-medium">{t('next')}</p>
          {from ? <p className="truncate text-xs text-fg-muted">{t('departsFrom', { stop: from })}</p> : null}
        </div>
        {upcoming.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {upcoming.map((d, i) => (
              <li key={d.minutes} className={cn('flex items-center justify-between px-4 py-3', i === 0 && 'bg-bg-subtle')}>
                <span className="text-base font-semibold tabular-nums">{d.label}</span>
                <span className={cn('text-sm tabular-nums', i === 0 ? 'font-medium text-brand' : 'text-fg-muted')}>
                  {t('in', { duration: formatDuration(d.minutes - nowMinutes, labels) })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-bg-subtle px-4 py-3 text-sm text-fg-muted">{t('noMoreToday')}</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">{t('planned')}</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {t('seeAll')}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen} title={t('fullTitle', { line: code })} description={from ? t('departsFrom', { stop: from }) : undefined}>
        <FullTimetable departures={departures} nowMinutes={nowMinutes} />
      </Sheet>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-subtle px-4 py-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
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
        <div key={hour} className="flex gap-4 py-2.5">
          <span className="w-8 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-fg-muted">
            {String(hour % 24).padStart(2, '0')}
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {items.map((d) => (
              <span
                key={d.minutes}
                className={cn('text-sm tabular-nums', d.minutes < nowMinutes ? 'text-fg-subtle' : 'text-fg')}
              >
                {String(d.minutes % 60).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
