'use client';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/primitives/Sheet';
import { BoardRow } from '@/components/home/NetworkBoard';
import type { NetworkStation } from '@/lib/network';

const AMENITIES = ['elevator', 'escalator', 'wc', 'babyRoom', 'masjid'] as const;

interface StationSheetProps {
  station: NetworkStation | null;
  onClose: () => void;
  hour: number;
}

/** A station: the lines calling there with their current level, and facilities. */
export function StationSheet({ station, onClose, hour }: StationSheetProps) {
  const t = useTranslations('station');
  const amenities = AMENITIES.filter((a) => station?.accessibility?.[a]);

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
          <p className="px-5 text-sm text-fg-muted">
            {amenities.length ? amenities.map((a) => t(a)).join(' · ') : t('none')}
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}
