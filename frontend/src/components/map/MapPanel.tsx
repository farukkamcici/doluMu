'use client';
import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransitMapProps } from './TransitMap';

// MapLibre needs `window`; render on the client only.
const TransitMap = dynamic(() => import('./TransitMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-bg-subtle" />,
});

interface MapPanelProps extends TransitMapProps {
  /** Overlay rendered at the bottom of the map (e.g. the hour scrubber). */
  overlay?: ReactNode;
  className?: string;
  /** Show the expand-to-full-screen toggle (phones). */
  expandable?: boolean;
}

/** Map with an optional full-screen mode, so a page-embedded map is still usable on phones. */
export function MapPanel({ overlay, className, expandable = true, ...map }: MapPanelProps) {
  const t = useTranslations('home');
  const [expanded, setExpanded] = useState(false);

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

  return (
    <div
      className={cn(
        'isolate overflow-hidden bg-bg-subtle',
        expanded ? 'fixed inset-0 z-40' : cn('relative', className),
      )}
    >
      <TransitMap {...map} embedded={!expanded && map.embedded !== false} />
      {expandable ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? t('closeMap') : t('expandMap')}
          className="pt-safe absolute left-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md bg-card text-fg shadow-pop lg:hidden"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      ) : null}
      {overlay ? <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 pb-safe">{overlay}</div> : null}
    </div>
  );
}
