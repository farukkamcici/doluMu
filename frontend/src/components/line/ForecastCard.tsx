'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Segmented } from '@/components/primitives/Segmented';
import { Skeleton } from '@/components/primitives/Skeleton';
import { Button } from '@/components/primitives/Button';
import { HourlyBars } from '@/components/transit/HourlyBars';
import { LevelPill } from '@/components/transit/LevelPill';
import type { DayProfile } from '@/lib/crowd';
import { ApiError } from '@/lib/api';
import { formatHour } from '@/lib/time';

export type Day = 'today' | 'tomorrow';

interface ForecastCardProps {
  day: Day;
  onDayChange: (day: Day) => void;
  profile: DayProfile | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  currentHour: number | null;
  color: string | null;
}

export function ForecastCard({
  day,
  onDayChange,
  profile,
  loading,
  error,
  onRetry,
  selectedHour,
  onSelectHour,
  currentHour,
  color,
}: ForecastCardProps) {
  const t = useTranslations('line.chart');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();
  const fmt = new Intl.NumberFormat(locale);

  const notReady = error instanceof ApiError && error.status === 404;
  const point = profile?.hours[selectedHour];

  let body;
  if (loading && !profile) {
    body = <Skeleton className="h-44 w-full" />;
  } else if (notReady) {
    body = <p className="py-8 text-sm text-fg-muted">{t('noForecast')}</p>;
  } else if (error && !profile) {
    body = (
      <div className="flex items-center justify-between gap-4 py-6">
        <p className="text-sm text-fg-muted">{te('generic')}</p>
        <Button size="sm" onClick={onRetry}>
          {tc('retry')}
        </Button>
      </div>
    );
  } else if (profile && !profile.hasData) {
    return null;
  } else if (profile && point) {
    body = (
      <>
        <div className="flex min-h-[2rem] flex-wrap items-center gap-x-4 gap-y-1" aria-live="polite">
          <span className="font-display text-2xl font-bold tabular-nums">{formatHour(point.hour)}</span>
          <LevelPill state={point.state} />
          {point.passengers != null ? (
            <span className="text-sm tabular-nums text-fg-muted">
              {tc('approxPassengers', { count: fmt.format(Math.round(point.passengers)) })}
            </span>
          ) : null}
        </div>
        <HourlyBars
          className="mt-3"
          profile={profile}
          color={color}
          selectedHour={selectedHour}
          currentHour={currentHour}
          onSelect={onSelectHour}
        />
        <p className="mt-3 text-xs text-fg-subtle">{t('legend')}</p>
      </>
    );
  }

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="eyebrow">{t('title')}</h2>
        <Segmented
          size="sm"
          className="w-[9.5rem] shrink-0"
          label={t('title')}
          value={day}
          onChange={onDayChange}
          options={[
            { value: 'today', label: tc('today') },
            { value: 'tomorrow', label: tc('tomorrow') },
          ]}
        />
      </div>
      {body}
    </div>
  );
}
