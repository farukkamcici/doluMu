'use client';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/primitives/Skeleton';
import { CrowdGlyph } from '@/components/transit/CrowdGlyph';
import { LEVEL_TEXT } from '@/components/transit/LevelPill';
import { findQuieterHour, hourWindows, type CrowdLevel, type DayProfile, type HourWindow } from '@/lib/crowd';
import { formatHour, type IstanbulNow } from '@/lib/time';
import { cn } from '@/lib/utils';

interface NowCardProps {
  profile: DayProfile | null;
  loading: boolean;
  now: IstanbulNow;
  nextServiceTime?: string | null;
  onPickHour: (hour: number) => void;
  onShowTomorrow: () => void;
}

const span = (w: HourWindow) => `${formatHour(w.start)}–${formatHour(w.end % 24)}`;

/** "Right now" for the line, plus the day's calm and peak windows. */
export function NowCard({ profile, loading, now, nextServiceTime, onPickHour, onShowTomorrow }: NowCardProps) {
  const t = useTranslations('line');
  const tc = useTranslations('common');
  const tl = useTranslations('levels');
  const th = useTranslations('levelHints');
  const locale = useLocale();
  const fmt = new Intl.NumberFormat(locale);
  const clock = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;

  if (loading || !profile) {
    return (
      <div className="space-y-3 px-4 py-5 sm:px-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!profile.hasData) {
    return (
      <div className="px-4 py-5 sm:px-5">
        <p className="font-display text-2xl font-bold">{t('now.noDataTitle')}</p>
        <p className="mt-1 text-sm text-fg-muted">{t('now.noDataBody')}</p>
      </div>
    );
  }

  const point = profile.hours[now.hour];
  const calm = hourWindows(profile, ['quiet']).slice(0, 2);
  const avoid = hourWindows(profile, ['peak']).slice(0, 2);

  const summary = (
    <dl className="grid grid-cols-2 border-t border-line">
      <div className="border-r border-line px-4 py-3 sm:px-5">
        <dt className="eyebrow">{t('calm')}</dt>
        <dd className="mt-1 font-display text-[17px] font-semibold tabular-nums leading-snug">
          {calm.length ? calm.map(span).join(', ') : '—'}
        </dd>
      </div>
      <div className="px-4 py-3 sm:px-5">
        <dt className="eyebrow text-signal">{t('avoid')}</dt>
        <dd className="mt-1 font-display text-[17px] font-semibold tabular-nums leading-snug">
          {avoid.length ? avoid.map(span).join(', ') : '—'}
        </dd>
      </div>
    </dl>
  );

  if (point.passengers == null) {
    const laterToday = profile.serviceHours.find((h) => h > now.hour);
    const next = nextServiceTime ?? (laterToday != null ? formatHour(laterToday) : null);
    return (
      <div>
        <div className="px-4 py-5 sm:px-5">
          <p className="eyebrow">
            {t('now.title')} · <span className="tabular-nums">{clock}</span>
          </p>
          <p className="mt-2 font-display text-[40px] font-bold leading-none tracking-tight text-fg-muted">{tl('closed')}</p>
          {next ? <p className="mt-2 text-sm text-fg-muted">{t('now.nextService', { time: next })}</p> : null}
          {laterToday == null ? (
            <button type="button" onClick={onShowTomorrow} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4">
              {t('now.tomorrowHint')}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {summary}
      </div>
    );
  }

  const level = point.state as CrowdLevel;
  const quieter = findQuieterHour(profile, now.hour);

  return (
    <div>
      <div className="px-4 py-5 sm:px-5">
        <p className="eyebrow">
          {t('now.title')} · <span className="tabular-nums">{clock}</span>
        </p>
        <div className="mt-2 flex items-end gap-4">
          <p className={cn('font-display text-[44px] font-bold leading-[0.9] tracking-tight', LEVEL_TEXT[level])}>{tl(level)}</p>
          <CrowdGlyph state={level} size="lg" className="mb-0.5" />
        </div>
        <p className="mt-3 text-[15px] text-fg-muted">
          {th(level)} · <span className="tabular-nums">{tc('passengersPerHour', { count: fmt.format(Math.round(point.passengers)) })}</span>
        </p>
      </div>

      {quieter ? (
        <button
          type="button"
          onClick={() => onPickHour(quieter.hour)}
          className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left transition-colors hover:bg-card-hover sm:px-5"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-fg-muted">{t('now.quieterSoonHint')}</span>
            <span className="block font-display text-lg font-semibold tabular-nums">
              {t('now.quieterSoon', { hour: formatHour(quieter.hour), drop: Math.round(quieter.drop * 100) })}
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0" />
        </button>
      ) : (
        <p className="border-t border-line px-4 py-3 text-sm text-fg-muted sm:px-5">
          {level === 'quiet' || level === 'normal' ? t('now.goodTime') : t('now.noBetterSoon')}
        </p>
      )}
      {summary}
    </div>
  );
}
