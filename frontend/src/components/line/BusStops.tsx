'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BusFront, ChevronDown } from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { BusDirection } from '@/lib/live/types';
import { variantEnd, type ClassifiedVehicle } from '@/lib/live/routes';
import type { Arrival } from '@/lib/live/eta';
import { cn } from '@/lib/utils';

interface BusStopsProps {
  direction: BusDirection;
  vehicles: ClassifiedVehicle[] | undefined;
  vehiclesAt: number;
  /** Next bus per stop code. */
  arrivals: Map<string, Arrival>;
}

const COLLAPSED = 12;

/** The line's stops in order: live buses at their nearest stop, and when the next one gets to each stop. */
export function BusStops({ direction, vehicles, vehiclesAt, arrivals }: BusStopsProps) {
  const t = useTranslations('bus');
  const [expanded, setExpanded] = useState(false);

  const busesAt = useMemo(() => {
    const map = new Map<string, ClassifiedVehicle[]>();
    for (const v of vehicles ?? []) {
      if (!v.nearStop || !v.inService) continue;
      map.set(v.nearStop, [...(map.get(v.nearStop) ?? []), v]);
    }
    return map;
  }, [vehicles]);

  const count = [...busesAt.values()].reduce((sum, v) => sum + v.length, 0);
  const offRoute = (vehicles ?? []).filter((v) => !v.inService).length;
  const stops = direction.stops;
  const long = stops.length > COLLAPSED + 3;
  const shown = long && !expanded ? stops.slice(0, COLLAPSED) : stops;
  const time = vehiclesAt
    ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(vehiclesAt)
    : null;

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">{t('liveTitle')}</h2>
        <span className="text-xs text-fg-muted">{t('stopsCount', { count: stops.length })}</span>
      </div>
      {vehicles ? (
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
          </span>
          {t('liveCount', { count })}
          {time ? <span className="font-normal text-fg-muted">· {t('updated', { time })}</span> : null}
        </p>
      ) : (
        <div className="mb-3 h-5" />
      )}
      {vehicles && (offRoute || arrivals.size) ? (
        <p className="-mt-2 mb-3 text-xs text-fg-muted">
          {arrivals.size ? t('etaNote') : null}
          {offRoute ? ` ${t('offRoute', { count: offRoute })}` : null}
        </p>
      ) : null}

      <ol className="relative">
        {shown.map((stop, i) => {
          const buses = busesAt.get(stop.code) ?? [];
          const last = i === shown.length - 1 && !(long && !expanded);
          const terminus = i === 0 || i === stops.length - 1;
          return (
            <li key={`${stop.code}-${i}`} className="relative">
              <span
                aria-hidden
                className={cn('absolute left-[7px] w-1.5 bg-fg', i === 0 ? 'top-1/2' : 'top-0', last ? 'h-1/2' : 'bottom-0')}
              />
              <Link
                href={`/stop/${stop.code}`}
                className="relative flex min-h-[44px] items-center gap-3 py-1.5 pl-7 pr-1 hover:bg-card-hover"
              >
                {buses.length ? (
                  <span
                    aria-hidden
                    className="absolute left-[-3px] top-1/2 flex h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-full bg-signal text-white"
                  >
                    <BusFront className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 rounded-full border-[3px] border-fg bg-card',
                      terminus ? 'left-0 h-5 w-5' : 'left-[3px] h-3.5 w-3.5',
                    )}
                  />
                )}
                <span className={cn('min-w-0 flex-1 truncate text-[15px]', terminus && 'font-semibold')}>{stop.name}</span>
                {buses.length ? (
                  <span className="shrink-0 text-right font-display text-xs font-semibold leading-tight text-signal">
                    {buses.map((b) => (
                      <span key={b.id} className="block">
                        {b.id}
                        {b.variant && b.variant.depar !== '0' ? (
                          <span className="font-normal text-fg-muted"> → {variantEnd(b.variant)}</span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                ) : (
                  (() => {
                    const next = arrivals.get(stop.code);
                    if (!next || next.minutes == null) return null;
                    return (
                      <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-fg-muted">
                        {next.minutes < 1 ? t('arriving') : t('eta', { min: next.minutes })}
                      </span>
                    );
                  })()
                )}
              </Link>
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
          {expanded ? t('showLess') : t('showAll')}
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      ) : null}
    </div>
  );
}
