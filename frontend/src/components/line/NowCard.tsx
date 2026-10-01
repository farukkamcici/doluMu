'use client';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Clock, Moon, Sparkles } from 'lucide-react';
import { Card } from '@/components/primitives/Card';
import { Skeleton } from '@/components/primitives/Skeleton';
import { Notice } from '@/components/primitives/Notice';
import { LEVEL_BG, LEVEL_TEXT } from '@/components/transit/LevelPill';
import { findQuieterHour, type CrowdLevel, type DayProfile } from '@/lib/crowd';
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

export function NowCard({ profile, loading, now, nextServiceTime, onPickHour, onShowTomorrow }: NowCardProps) {
  const t = useTranslations('line.now');
  const tc = useTranslations('common');
  const tl = useTranslations('levels');
  const th = useTranslations('levelHints');
  const locale = useLocale();
  const fmt = new Intl.NumberFormat(locale);
  const clock = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;

  if (loading || !profile) {
    return (
      <Card className="space-y-4 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </Card>
    );
  }

  if (!profile.hasData) {
    return (
      <Notice icon={<Sparkles className="h-5 w-5" />} title={t('noDataTitle')}>
        {t('noDataBody')}
      </Notice>
    );
  }

  const point = profile.hours[now.hour];

  if (point.passengers == null) {
    const laterToday = profile.serviceHours.find((h) => h > now.hour);
    const next = nextServiceTime ?? (laterToday != null ? formatHour(laterToday) : null);
    return (
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bg-subtle text-fg-muted">
            <Moon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{t('closedTitle')}</p>
            {next ? <p className="mt-0.5 text-sm text-fg-muted">{t('nextService', { time: next })}</p> : null}
            {laterToday == null ? (
              <button
                type="button"
                onClick={onShowTomorrow}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {t('tomorrowHint')}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  const level = point.state as CrowdLevel;
  const quieter = findQuieterHour(profile, now.hour);

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <span className="font-medium text-fg">{t('title')}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{t('at', { time: clock })}</span>
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className={cn('h-3.5 w-3.5 shrink-0 rounded-full', LEVEL_BG[level])} aria-hidden />
          <p className={cn('text-[28px] font-bold leading-none tracking-tight', LEVEL_TEXT[level])}>{tl(level)}</p>
        </div>
        <p className="mt-2 text-sm text-fg-muted">{th(level)}</p>
        <p className="mt-3 text-sm font-medium tabular-nums">
          {tc('passengersPerHour', { count: fmt.format(Math.round(point.passengers)) })}
        </p>
      </div>

      {quieter ? (
        <button
          type="button"
          onClick={() => onPickHour(quieter.hour)}
          className="flex w-full items-center gap-3 border-t border-line bg-brand-soft/60 px-5 py-3.5 text-left transition-colors hover:bg-brand-soft"
        >
          <Clock className="h-5 w-5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-fg-muted">{t('quieterSoonHint')}</span>
            <span className="block font-semibold tabular-nums text-fg">
              {t('quieterSoon', { hour: formatHour(quieter.hour), drop: Math.round(quieter.drop * 100) })}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-fg-muted" />
        </button>
      ) : (
        <p className="border-t border-line px-5 py-3.5 text-sm text-fg-muted">
          {level === 'quiet' || level === 'normal' ? t('goodTime') : t('noBetterSoon')}
        </p>
      )}
    </Card>
  );
}
