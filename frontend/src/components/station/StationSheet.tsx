'use client';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/primitives/Sheet';
import { BoardRow } from '@/components/home/NetworkBoard';
import type { NetworkStation } from '@/lib/network';
import { useOutagesByStation } from '@/components/live/outages';


interface StationSheetProps {
  station: NetworkStation | null;
  onClose: () => void;
  hour: number;
}

/** A station: the lines calling there with their current level, and facilities. */
export function StationSheet({ station, onClose, hour }: StationSheetProps) {
  const t = useTranslations('station');
  const tl = useTranslations('live');
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
          <p className="eyebrow px-5 pb-1">{t('lines')}</p>
          <div className="border-y border-line">
            {station.lines.map((code) => (
              <BoardRow key={code} code={code} hour={hour} />
            ))}
          </div>
          <p className="eyebrow px-5 pb-1 pt-5">{t('access')}</p>
          {outages.length ? (
            <ul className="mx-5 mb-2 space-y-1">
              {outages.map((o, i) => (
                <li key={i} className="text-sm font-semibold text-signal">
                  {tl('outage', { kind: tl(`kinds.${o.kind}`) })}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="px-5 text-sm text-fg-muted">{amenities.length ? amenities.join(' · ') : t('none')}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
