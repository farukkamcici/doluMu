'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Accessibility, ChevronDown } from 'lucide-react';
import { useOutagesByStation } from '@/components/live/outages';
import { LineBadge } from '@/components/transit/LineBadge';
import type { NetworkStation } from '@/lib/network';
import { cn } from '@/lib/utils';

interface StationStripProps {
  code: string;
  color: string;
  /** Stations of this line in order. */
  stations: NetworkStation[];
  onSelect: (station: NetworkStation) => void;
}

const COLLAPSED = 8;

/** Strip map like the one above train doors: the line's colour as a spine, transfers marked. */
export function StationStrip({ code, color, stations, onSelect }: StationStripProps) {
  const t = useTranslations('line');
  const tl = useTranslations('live');
  const outagesByStation = useOutagesByStation();
  const [expanded, setExpanded] = useState(false);
  const long = stations.length > COLLAPSED + 2;
  const shown = long && !expanded ? stations.slice(0, COLLAPSED) : stations;

  return (
    <div className="px-4 py-5 sm:px-5">
      <h2 className="eyebrow mb-3">
        {t('stations')} · {t('stationsCount', { count: stations.length })}
      </h2>
      <ol className="relative">
        {shown.map((station, i) => {
          const transfers = station.lines.filter((l) => l !== code);
          const last = i === shown.length - 1 && !(long && !expanded);
          const terminus = i === 0 || i === stations.length - 1;
          return (
            <li key={station.id} className="relative">
              <span
                aria-hidden
                className={cn('absolute left-[7px] w-1.5', i === 0 ? 'top-1/2' : 'top-0', last ? 'h-1/2' : 'bottom-0')}
                style={{ backgroundColor: color }}
              />
              <button
                type="button"
                onClick={() => onSelect(station)}
                className="relative flex min-h-[44px] w-full items-center gap-3 py-1.5 pl-7 pr-1 text-left hover:bg-card-hover"
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 rounded-full border-[3px] bg-card',
                    transfers.length || terminus ? 'h-5 w-5' : 'left-[3px] h-3.5 w-3.5',
                  )}
                  style={{ borderColor: transfers.length ? 'rgb(var(--fg))' : color }}
                />
                <span className={cn('min-w-0 flex-1 truncate text-[15px]', (transfers.length || terminus) && 'font-semibold')}>
                  {station.name}
                </span>
                {(() => {
                  const outages = station.metroIds.flatMap((id) => outagesByStation.get(id) ?? []);
                  const liftDown = outages.some((o) => o.kind === 'lift');
                  if (liftDown) {
                    return (
                      <span className="shrink-0 rounded bg-signal px-1.5 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wide text-white">
                        {tl('outage', { kind: tl('kinds.lift') })}
                      </span>
                    );
                  }
                  if (outages.length) {
                    return (
                      <span className="shrink-0 font-display text-[11px] font-semibold uppercase tracking-wide text-signal">
                        {tl('outage', { kind: tl(`kinds.${outages[0].kind}`) })}
                      </span>
                    );
                  }
                  return station.facilities?.lifts ? (
                    <Accessibility className="h-4 w-4 shrink-0 text-fg-muted" aria-label={tl('kinds.lift')} />
                  ) : null;
                })()}
                {transfers.length ? (
                  <span className="flex shrink-0 gap-1" aria-label={t('transfer')}>
                    {transfers.map((l) => (
                      <LineBadge key={l} code={l} size="sm" />
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 pl-7 text-sm font-semibold underline underline-offset-4"
        >
          {expanded ? '−' : `+${stations.length - COLLAPSED}`}
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      ) : null}
    </div>
  );
}
