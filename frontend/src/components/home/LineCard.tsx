'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Skeleton } from '@/components/primitives/Skeleton';
import { HourlyBars } from '@/components/transit/HourlyBars';
import { LevelPill } from '@/components/transit/LevelPill';
import { LineBadge } from '@/components/transit/LineBadge';
import { buildDayProfile, daySummary } from '@/lib/crowd';
import { useForecast, useLine } from '@/lib/queries';
import { formatHour, type IstanbulNow } from '@/lib/time';
import { useLineName } from '@/hooks/useLineName';

/** Line summary with its current level and today's shape; links to the line page. */
export function LineCard({ code, now }: { code: string; now: IstanbulNow }) {
  const t = useTranslations('home');
  const line = useLine(code);
  const name = useLineName(code, line.data);
  const forecast = useForecast(line.isSuccess ? code : null, now.date);
  const profile = useMemo(() => (forecast.data ? buildDayProfile(forecast.data) : null), [forecast.data]);
  const summary = profile ? daySummary(profile) : null;
  const point = profile?.hours[now.hour];

  if (line.isError) return null;

  return (
    <Link
      href={`/line/${encodeURIComponent(code)}`}
      className="group block rounded-2xl border border-line bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
    >
      <div className="flex items-start gap-3">
        <LineBadge code={code} typeId={line.data?.transport_type_id} />
        <div className="min-w-0 flex-1">
          {line.data ? (
            <p className="truncate text-sm font-medium leading-8">{name}</p>
          ) : (
            <Skeleton className="mt-2 h-4 w-3/4" />
          )}
        </div>
        <ChevronRight className="mt-1.5 h-5 w-5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {!profile || !point ? (
            <Skeleton className="h-6 w-24 rounded-full" />
          ) : profile.hasData ? (
            point.passengers != null ? (
              <LevelPill state={point.state} />
            ) : (
              <LevelPill state="closed" />
            )
          ) : (
            <LevelPill state="nodata" />
          )}
          {summary && profile?.hasData ? (
            <p className="truncate text-xs tabular-nums text-fg-muted">
              {t('quietestAt', { hour: formatHour(summary.quietHour) })} · {t('busiestAt', { hour: formatHour(summary.peakHour) })}
            </p>
          ) : null}
        </div>
        {profile?.hasData ? (
          <HourlyBars profile={profile} variant="mini" currentHour={now.hour} className="w-28 shrink-0" />
        ) : null}
      </div>
    </Link>
  );
}
