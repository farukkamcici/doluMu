'use client';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CalendarClock } from 'lucide-react';
import { Card } from '@/components/primitives/Card';
import { Segmented } from '@/components/primitives/Segmented';
import { Skeleton } from '@/components/primitives/Skeleton';
import { Notice } from '@/components/primitives/Notice';
import { Button } from '@/components/primitives/Button';
import { HourlyBars } from '@/components/transit/HourlyBars';
import { LevelPill } from '@/components/transit/LevelPill';
import { daySummary, type DayProfile } from '@/lib/crowd';
import { ApiError } from '@/lib/api';
import { formatHour } from '@/lib/time';

export type Day = 'today' | 'tomorrow';

const SKELETON_HEIGHTS = Array.from({ length: 24 }, (_, i) =>
  i < 5 ? 'h-2' : i % 6 === 2 ? 'h-24' : i % 3 === 0 ? 'h-16' : 'h-11',
);

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
}: ForecastCardProps) {
  const t = useTranslations('line.chart');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();
  const fmt = new Intl.NumberFormat(locale);

  const notReady = error instanceof ApiError && error.status === 404;
  const point = profile?.hours[selectedHour];
  const summary = profile ? daySummary(profile) : null;

  let body;
  if (loading && !profile) {
    body = (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-6 w-48" />
        <div className="flex h-32 items-end gap-[3px] pt-5">
          {SKELETON_HEIGHTS.map((h, i) => (
            <Skeleton key={i} className={`flex-1 rounded-b-[2px] rounded-t-[5px] ${h}`} />
          ))}
        </div>
      </div>
    );
  } else if (notReady) {
    body = (
      <Notice icon={<CalendarClock className="h-5 w-5" />} title={t('noForecast')} />
    );
  } else if (error && !profile) {
    body = (
      <Notice
        icon={<AlertCircle className="h-5 w-5" />}
        title={te('generic')}
        action={
          <Button size="sm" onClick={onRetry}>
            {tc('retry')}
          </Button>
        }
      />
    );
  } else if (profile && !profile.hasData) {
    body = null;
  } else if (profile && point) {
    body = (
      <>
        <div className="flex min-h-[2.25rem] flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
          <span className="text-xl font-semibold tabular-nums">{formatHour(point.hour)}</span>
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
          selectedHour={selectedHour}
          currentHour={currentHour}
          onSelect={onSelectHour}
        />
        {summary ? (
          <p className="mt-4 text-sm text-fg-muted">
            {t('summary', { peak: formatHour(summary.peakHour), quiet: formatHour(summary.quietHour) })}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-fg-subtle">{t('legend')}</p>
      </>
    );
  }

  if (body === null) return null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="truncate text-[15px] font-semibold">{t('title')}</h2>
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
    </Card>
  );
}
