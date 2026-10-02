'use client';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/primitives/Skeleton';
import { LineBadge } from '@/components/transit/LineBadge';
import { toDepartures } from '@/lib/departures';
import { useMetroDepartures } from '@/lib/live/client';
import { forecastCode } from '@/lib/network';
import { useNow } from '@/hooks/useNow';

/** Metro service days run past midnight; before 03:00 we're still in yesterday's timetable. */
const SERVICE_DAY_START = 180;

/** Next trains from a station, per line and direction (Metro İstanbul's live timetable). */
export function Departures({ stationIds }: { stationIds: number[] }) {
  const t = useTranslations('station');
  const now = useNow();
  const { data, loading } = useMetroDepartures(stationIds);
  const at = now.minutes < SERVICE_DAY_START ? now.minutes + 1440 : now.minutes;

  const rows = data.flatMap((station) =>
    station.directions.map((d) => ({
      key: `${station.stationId}-${d.id}`,
      line: forecastCode(station.line),
      towards: d.towards,
      next: toDepartures(d.times)
        .filter((x) => x.minutes >= at)
        .slice(0, 3),
    })),
  );

  if (!rows.length) {
    return loading && stationIds.length ? <Skeleton className="mx-5 mt-5 h-16" /> : null;
  }

  return (
    <>
      <p className="eyebrow px-5 pb-1 pt-5">{t('departures')}</p>
      <ul className="border-y border-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0">
            <LineBadge code={r.line} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{t('towards', { stop: r.towards })}</span>
            {r.next.length ? (
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-display font-bold">
                  {r.next[0].minutes - at < 1 ? t('now') : t('inMin', { min: r.next[0].minutes - at })}
                </span>
                {r.next.slice(1).map((x) => (
                  <span key={x.minutes} className="text-fg-muted">
                    {' · '}
                    {x.label}
                  </span>
                ))}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-fg-muted">{t('noMore')}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="px-5 pt-2 text-xs text-fg-subtle">{t('departuresNote')}</p>
    </>
  );
}
