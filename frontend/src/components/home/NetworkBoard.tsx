'use client';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Skeleton } from '@/components/primitives/Skeleton';
import { CrowdGlyph } from '@/components/transit/CrowdGlyph';
import { LineBadge } from '@/components/transit/LineBadge';
import { LEVEL_TEXT } from '@/components/transit/LevelPill';
import { useMemo } from 'react';
import { LEVELS, buildDayProfile, type CrowdLevel, type HourState } from '@/lib/crowd';
import { useForecast } from '@/lib/queries';
import { useNow } from '@/hooks/useNow';
import { useLineDisruptions } from '@/components/live/outages';
import { useLineDisplayName } from '@/hooks/useLineName';
import { cn } from '@/lib/utils';

const rank = (s: HourState) => LEVELS.indexOf(s as CrowdLevel);

interface BoardRowProps {
  code: string;
  hour: number;
}

/** One line on the board: code, name, level at `hour` and where it's heading next hour. */
export function BoardRow({ code, hour }: BoardRowProps) {
  const t = useTranslations();
  const name = useLineDisplayName(code);
  const now = useNow();
  // Same query key as the home map's forecasts, so rows share that cache.
  const forecast = useForecast(code, now.date);
  const profile = useMemo(() => (forecast.data ? buildDayProfile(forecast.data) : undefined), [forecast.data]);
  const point = profile?.hours[hour];
  const disrupted = useLineDisruptions(code).length > 0;
  const next = profile?.hours[(hour + 1) % 24];
  const state: HourState | null = forecast.isError ? 'nodata' : !profile ? null : profile.hasData ? (point?.state ?? 'nodata') : 'nodata';

  let trend = null;
  if (disrupted) {
    trend = (
      <span className="inline-flex items-center gap-1 font-semibold text-signal">
        <AlertTriangle className="h-3.5 w-3.5" />
        {t('live.disruption')}
      </span>
    );
  } else if (state && next && rank(state) >= 0 && rank(next.state) >= 0 && rank(next.state) !== rank(state)) {
    // Only worth a line when the level changes within the hour.
    const Icon = rank(next.state) > rank(state) ? ArrowUpRight : ArrowDownRight;
    trend = (
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" />
        {t('home.nextHour')}: {t(`levels.${next.state}`).toLocaleLowerCase()}
      </span>
    );
  }

  return (
    <Link
      href={`/line/${encodeURIComponent(code)}`}
      className="group flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-card-hover sm:px-5"
    >
      <LineBadge code={code} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-tight">{name || ' '}</p>
        {trend ? <p className="mt-0.5 truncate text-xs text-fg-muted">{trend}</p> : null}
      </div>
      <div className="flex w-24 shrink-0 flex-col items-end gap-1">
        {state ? (
          <>
            {rank(state) >= 0 ? <CrowdGlyph state={state} /> : null}
            <span className={cn('font-display text-[13px] font-semibold uppercase tracking-wide', LEVEL_TEXT[state])}>
              {t(`levels.${state}`)}
            </span>
          </>
        ) : (
          <Skeleton className="h-8 w-16" />
        )}
      </div>
    </Link>
  );
}
