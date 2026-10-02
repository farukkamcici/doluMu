'use client';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/primitives/Sheet';
import { BoardRow } from '@/components/home/NetworkBoard';
import type { NetworkStation } from '@/lib/network';
import { useOutagesByStation } from '@/components/live/outages';
import { useParking, useRailRidership } from '@/lib/live/client';
import { distanceMeters, stationEntries } from '@/lib/network';
import { useLocale } from 'next-intl';
import { Departures } from './Departures';

interface StationSheetProps {
  station: NetworkStation | null;
  onClose: () => void;
  hour: number;
}

/** A station: the lines calling there with their current level, and facilities. */
export function StationSheet({ station, onClose, hour }: StationSheetProps) {
  const t = useTranslations('station');
  const tl = useTranslations('live');
  const tp = useTranslations('parking');
  const locale = useLocale();
  const parking = useParking(!!station);
  const ridership = useRailRidership(!!station);
  const entries = station ? stationEntries(station, ridership.data) : null;
  const nearbyParks =
    station && Number.isFinite(station.lat) && parking.data
      ? parking.data
          .map((p) => ({ p, d: distanceMeters(station, p) }))
          .filter(({ d }) => d <= 800)
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)
      : [];
  const nf = new Intl.NumberFormat(locale);
  const outagesByStation = useOutagesByStation();
  const outages = station ? station.metroIds.flatMap((id) => outagesByStation.get(id) ?? []) : [];
  const f = station?.facilities;
  const amenities = f
    ? [
        f.lifts ? `${f.lifts} ${t('elevator').toLocaleLowerCase()}` : null,
        f.escalators ? `${f.escalators} ${t('escalator').toLocaleLowerCase()}` : null,
        f.wc ? t('wc') : null,
        f.babyRoom ? t('babyRoom') : null,
        f.masjid ? t('masjid') : null,
      ].filter(Boolean)
    : [];

  return (
    <Sheet open={!!station} onOpenChange={(open) => !open && onClose()} title={station?.name ?? ''}>
      {station ? (
        <div className="-mx-5 pb-4">
          {entries ? (
            <p className="-mt-1 px-5 pb-4 text-sm text-fg-muted">
              {t('entries', { count: new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 0 }).format(entries) })}
              {ridership.data ? ` (${ridership.data.year})` : null}
            </p>
          ) : null}
          <p className="eyebrow px-5 pb-1">{t('lines')}</p>
          <div className="border-y border-line">
            {station.lines.map((code) => (
              <BoardRow key={code} code={code} hour={hour} />
            ))}
          </div>
          <Departures stationIds={station.metroIds} />
          <p className="eyebrow px-5 pb-1 pt-5">{t('access')}</p>
          {outages.length ? (
            <ul className="mx-5 mb-2 space-y-1">
              {[...new Set(outages.map((o) => o.kind))].map((kind) => {
                const n = outages.filter((o) => o.kind === kind).length;
                return (
                  <li key={kind} className="text-sm font-semibold text-signal">
                    {tl('outage', { kind: tl(`kinds.${kind}`) })}
                    {n > 1 ? ` (${n})` : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="px-5 text-sm text-fg-muted">{amenities.length ? amenities.join(' · ') : t('none')}</p>
          {nearbyParks.length ? (
            <>
              <p className="eyebrow px-5 pb-1 pt-5">{tp('title')}</p>
              <ul className="border-y border-line">
                {nearbyParks.map(({ p, d }) => (
                  <li key={p.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-fg-muted">
                        {Math.round(d / 10) * 10} m · {p.hours}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-sm font-semibold tabular-nums">
                      {tp('free', { empty: nf.format(p.empty), capacity: nf.format(p.capacity) })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
