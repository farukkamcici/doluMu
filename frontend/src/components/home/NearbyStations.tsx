'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { LineBadge } from '@/components/transit/LineBadge';
import { Link } from '@/i18n/routing';
import { useBusStops } from '@/lib/live/client';
import { useNextTrains } from '@/lib/live/nextTrains';
import { distanceMeters, type NetworkStation } from '@/lib/network';
import type { GeoState } from '@/hooks/useGeolocation';

interface NearbyStationsProps {
  stations: NetworkStation[];
  geo: GeoState;
  onSelect: (station: NetworkStation) => void;
}

export function NearbyStations({ stations, geo, onSelect }: NearbyStationsProps) {
  const t = useTranslations('home');

  const nearest = useMemo(() => {
    if (geo.status !== 'ok') return [];
    return stations
      .map((s) => ({ station: s, d: distanceMeters(geo, s) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
  }, [stations, geo]);

  const distance = (m: number) =>
    m < 1000 ? t('meters', { m: Math.round(m / 10) * 10 }) : t('km', { km: (m / 1000).toFixed(1) });

  return (
    <ul>
      {nearest.map(({ station, d }) => (
        <li key={station.id} className="border-b border-line last:border-b-0">
          <button
            type="button"
            onClick={() => onSelect(station)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card-hover sm:px-5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{station.name}</span>
              <span className="mt-1 flex flex-wrap gap-1">
                {station.lines.map((code) => (
                  <LineBadge key={code} code={code} size="sm" />
                ))}
              </span>
              <NextTrainsLine stationIds={station.metroIds} />
            </span>
            <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-fg-muted">{distance(d)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Hacıosman 3 dk · Yenikapı 5 dk": the next train each way, in one quiet line. */
function NextTrainsLine({ stationIds }: { stationIds: number[] }) {
  const t = useTranslations('station');
  const { rows } = useNextTrains(stationIds, 1);
  const upcoming = rows.filter((r) => r.inMin != null).slice(0, 3);
  if (!upcoming.length) return null;
  return (
    <span className="mt-1 block truncate text-xs text-fg-muted">
      {upcoming.map((r, i) => (
        <span key={r.key}>
          {i ? ' · ' : ''}
          {r.towards} <span className="font-semibold text-fg">{r.inMin! < 1 ? t('now') : t('inMin', { min: r.inMin! })}</span>
        </span>
      ))}
    </span>
  );
}

/** Closest İETT stops with the lines calling there (static stop index, loaded on demand). */
export function NearbyStops({ geo }: { geo: GeoState }) {
  const t = useTranslations('home');
  const stops = useBusStops(geo.status === 'ok');
  const nearest = useMemo(() => {
    if (geo.status !== 'ok' || !stops.data) return [];
    return stops.data
      .map((s) => ({ stop: s, d: distanceMeters(geo, s) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
  }, [stops.data, geo]);
  const distance = (m: number) =>
    m < 1000 ? t('meters', { m: Math.round(m / 10) * 10 }) : t('km', { km: (m / 1000).toFixed(1) });

  if (!stops.data) return <div className="h-14 animate-pulse bg-fg/[0.04]" />;
  return (
    <ul>
      {nearest.map(({ stop, d }) => {
        const codes = [...new Set(stop.lines.map((l) => l.code))];
        return (
          <li key={stop.code} className="border-b border-line last:border-b-0">
            <Link href={`/stop/${stop.code}`} className="flex items-center gap-3 px-4 py-3 hover:bg-card-hover sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{stop.name}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {codes.slice(0, 6).map((code) => (
                    <LineBadge key={code} code={code} typeId={1} size="sm" />
                  ))}
                  {codes.length > 6 ? <span className="self-center text-xs text-fg-muted">+{codes.length - 6}</span> : null}
                </span>
              </span>
              <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-fg-muted">{distance(d)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
