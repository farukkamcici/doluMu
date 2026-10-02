'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { LocateFixed } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { LineBadge } from '@/components/transit/LineBadge';
import { distanceMeters, type NetworkStation } from '@/lib/network';
import type { GeoState } from '@/hooks/useGeolocation';

interface NearbyStationsProps {
  stations: NetworkStation[];
  geo: GeoState;
  onLocate: () => void;
  onSelect: (station: NetworkStation) => void;
}

export function NearbyStations({ stations, geo, onLocate, onSelect }: NearbyStationsProps) {
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

  if (geo.status !== 'ok') {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <p className="text-sm text-fg-muted">
          {geo.status === 'denied' ? t('nearbyDenied') : geo.status === 'error' ? t('nearbyError') : t('nearbyHint')}
        </p>
        <Button size="sm" onClick={onLocate} disabled={geo.status === 'locating'} className="shrink-0">
          <LocateFixed className="h-4 w-4" />
          {geo.status === 'locating' ? t('locating') : t('nearbyAction')}
        </Button>
      </div>
    );
  }

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
            </span>
            <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-fg-muted">{distance(d)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
