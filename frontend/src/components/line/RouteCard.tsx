'use client';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Map as MapIcon } from 'lucide-react';
import { Card } from '@/components/primitives/Card';
import { Skeleton } from '@/components/primitives/Skeleton';
import { Notice } from '@/components/primitives/Notice';
import type { Direction, RouteShape } from '@/lib/api';
import type { TopologyLine } from '@/lib/topology';
import type { MapStop } from './RouteMapInner';
import type { LatLngTuple } from 'leaflet';

// Leaflet touches `window`, so the map only renders on the client.
const RouteMapInner = dynamic(() => import('./RouteMapInner'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

interface RouteCardProps {
  route: RouteShape | undefined;
  routeLoading: boolean;
  direction: Direction | null;
  topoLine: TopologyLine | null;
  color: string;
}

export function RouteCard({ route, routeLoading, direction, topoLine, color }: RouteCardProps) {
  const t = useTranslations('line.route');

  const { path, stops } = useMemo(() => {
    if (topoLine) {
      const ordered = [...topoLine.stations].sort((a, b) => a.order - b.order);
      const stations: MapStop[] = ordered
        .filter((s) => s.coordinates?.lat && s.coordinates?.lng)
        .map((s) => ({ name: s.description || s.name, position: [s.coordinates.lat, s.coordinates.lng] }));
      return { path: stations.map((s) => s.position), stops: stations };
    }
    const shape = (direction && route?.[direction]) || route?.G || route?.D || [];
    return { path: shape as LatLngTuple[], stops: [] as MapStop[] };
  }, [topoLine, route, direction]);

  const hasMap = path.length > 1;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <MapIcon className="h-4 w-4 text-fg-muted" />
          {t('title')}
        </h2>
        {topoLine ? <span className="text-sm text-fg-muted">{t('stations', { count: stops.length })}</span> : null}
      </div>
      {routeLoading && !topoLine ? (
        <Skeleton className="h-64 w-full rounded-none lg:h-80" />
      ) : hasMap ? (
        <div className="isolate h-64 w-full border-t border-line lg:h-80">
          <RouteMapInner path={path} stops={stops} color={color} labels={{ start: t('start'), end: t('end') }} />
        </div>
      ) : (
        <div className="px-5 pb-5">
          <Notice>{t('unavailable')}</Notice>
        </div>
      )}
    </Card>
  );
}
