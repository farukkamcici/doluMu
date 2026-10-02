'use client';
import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { BusFront, Maximize2, Minimize2 } from 'lucide-react';
import { SLOW_KMH, useFleet } from '@/lib/live/client';
import { cn } from '@/lib/utils';
import type { TransitMapProps } from './TransitMap';

// MapLibre needs `window`; render on the client only.
const TransitMap = dynamic(() => import('./TransitMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-bg-subtle" />,
});

interface MapPanelProps extends TransitMapProps {
  className?: string;
  /** Show the expand-to-full-screen toggle (phones). */
  expandable?: boolean;
  /** Offer the city-wide live bus layer. */
  fleetToggle?: boolean;
}

const control = 'inline-flex h-10 items-center justify-center rounded-md shadow-pop';

/** Map with an optional full-screen mode, so a page-embedded map is still usable on phones. */
export function MapPanel({ className, expandable = true, fleetToggle = false, ...map }: MapPanelProps) {
  const t = useTranslations('home');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [showFleet, setShowFleet] = useState(false);
  const fleet = useFleet(fleetToggle && showFleet);
  const moving = showFleet ? fleet.data?.moving : undefined;
  const slow = moving?.filter((v) => v[2] < SLOW_KMH).length ?? 0;

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const nf = new Intl.NumberFormat(locale);

  return (
    <div
      className={cn(
        'isolate overflow-hidden bg-bg-subtle',
        expanded ? 'fixed inset-0 z-40' : cn('relative', className),
      )}
    >
      <TransitMap {...map} fleet={moving ?? null} embedded={!expanded && map.embedded !== false} />
      <div className="pt-safe absolute left-3 top-3 z-10 flex gap-2">
        {expandable ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? t('closeMap') : t('expandMap')}
            className={cn(control, 'w-10 bg-card text-fg lg:hidden')}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        ) : null}
        {fleetToggle ? (
          <button
            type="button"
            onClick={() => setShowFleet((v) => !v)}
            aria-pressed={showFleet}
            className={cn(control, 'gap-1.5 px-3 text-sm font-semibold', showFleet ? 'bg-fg text-bg' : 'bg-card text-fg')}
          >
            <BusFront className="h-4 w-4" />
            {t('fleet.toggle')}
          </button>
        ) : null}
      </div>
      {showFleet ? (
        <p className="pointer-events-none absolute left-3 top-[3.75rem] z-10 rounded-md bg-card/95 px-2.5 py-1.5 text-xs shadow-pop">
          {moving ? (
            <>
              <span className="font-semibold">{t('fleet.moving', { count: nf.format(moving.length) })}</span>
              <span className="ml-2 inline-flex items-center gap-1 text-fg-muted">
                <span className="h-2 w-2 rounded-full bg-signal" />
                {t('fleet.slow', { kmh: SLOW_KMH, count: nf.format(slow) })}
              </span>
            </>
          ) : fleet.isError ? (
            t('fleet.error')
          ) : (
            t('fleet.loading')
          )}
        </p>
      ) : null}
    </div>
  );
}
