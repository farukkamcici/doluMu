'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { BusFront, ChevronRight } from 'lucide-react';
import { AppBar } from '@/components/app/AppBar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { buttonVariants } from '@/components/primitives/Button';
import { LineBadge } from '@/components/transit/LineBadge';
import { LevelPill } from '@/components/transit/LevelPill';
import { MapPanel } from '@/components/map/MapPanel';
import { SearchButton } from '@/components/search/SearchButton';
import { Link } from '@/i18n/routing';
import { buildDayProfile } from '@/lib/crowd';
import { useForecast } from '@/lib/queries';
import { useBusLine, useBusStops, useBusVehicles, type StopIndexEntry } from '@/lib/live/client';
import type { NetworkStation } from '@/lib/network';
import { useNow } from '@/hooks/useNow';
import { useNetwork } from '@/hooks/useNetwork';
import { useLineDisplayName } from '@/hooks/useLineName';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/** One line calling at the stop: destination, nearest live bus (in stops) and crowd level now. */
function StopLineRow({ code, dir, stopCode, otherDirHere }: { code: string; dir: 'G' | 'D'; stopCode: string; otherDirHere: boolean }) {
  const t = useTranslations();
  const now = useNow();
  const name = useLineDisplayName(code);
  const line = useBusLine(code);
  const vehicles = useBusVehicles(code);
  const forecast = useForecast(code, now.date);
  const point = useMemo(() => (forecast.data ? buildDayProfile(forecast.data).hours[now.hour] : null), [forecast.data, now.hour]);

  const direction = line.data?.directions[dir];
  const stopsAway = useMemo(() => {
    if (!direction || !vehicles.data) return undefined;
    const order = new Map(direction.stops.map((s, i) => [s.code, i]));
    const target = order.get(stopCode);
    if (target == null) return null;
    let best: number | null = null;
    for (const v of vehicles.data) {
      if (!v.nearStop) continue;
      const idx = order.get(v.nearStop);
      if (idx == null || idx > target) continue;
      const away = target - idx;
      if (best == null || away < best) best = away;
    }
    return best;
  }, [direction, vehicles.data, stopCode]);

  // Buses heading *to* this stop as their terminus aren't useful to someone waiting here.
  const terminus = direction ? direction.stops[direction.stops.length - 1]?.code === stopCode : false;
  if (terminus && otherDirHere) return null;

  return (
    <Link
      href={`/line/${encodeURIComponent(code)}?dir=${dir}`}
      className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-card-hover sm:px-5"
    >
      <LineBadge code={code} typeId={1} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-tight">
          {direction ? t('stop.towards', { stop: direction.name }) : name}
        </span>
        <span className="mt-0.5 block truncate text-xs text-fg-muted">{name}</span>
      </span>
      <span className="flex w-28 shrink-0 flex-col items-end gap-1">
        {terminus ? (
          <span className="text-xs text-fg-subtle">{t('stop.terminus')}</span>
        ) : stopsAway === undefined ? (
          <Skeleton className="h-4 w-20" />
        ) : stopsAway === null ? (
          <span className="text-xs text-fg-subtle">{t('bus.noneComing')}</span>
        ) : (
          <span className="flex items-center gap-1 font-display text-sm font-semibold text-signal">
            <BusFront className="h-3.5 w-3.5" />
            {t('bus.stopsAway', { n: stopsAway })}
          </span>
        )}
        {point && point.state !== 'nodata' ? <LevelPill state={point.state} className="text-xs" /> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
    </Link>
  );
}

export function StopScreen({ code }: { code: string }) {
  const t = useTranslations('stop');
  const tc = useTranslations('common');
  const desktop = useIsDesktop();
  const stops = useBusStops();
  const network = useNetwork();
  const stop: StopIndexEntry | undefined = stops.data?.find((s) => s.code === code);

  const asStation = useMemo<NetworkStation[]>(
    () => (stop ? [{ id: `stop-${stop.code}`, name: stop.name, lat: stop.lat, lng: stop.lng, lines: [], metroIds: [] }] : []),
    [stop],
  );
  const flyTo = useMemo(() => (stop ? { lat: stop.lat, lng: stop.lng, zoom: 15.5 } : null), [stop]);

  if (stops.isSuccess && !stop) {
    return (
      <>
        <AppBar />
        <main className="mx-auto max-w-xl px-4 py-10">
          <p className="font-display text-3xl font-bold">{t('notFoundTitle')}</p>
          <p className="mt-2 text-fg-muted">{t('notFoundBody', { code })}</p>
          <Link href="/" className={buttonVariants({ variant: 'primary', size: 'md', className: 'mt-6' })}>
            {tc('home')}
          </Link>
        </main>
      </>
    );
  }

  const map = (
    <MapPanel
      className="h-[34vh] min-h-[240px] lg:h-dvh"
      expandable={!desktop}
      embedded={!desktop}
      lines={network.lines}
      stations={asStation}
      focus="__stop__"
      flyTo={flyTo}
    />
  );

  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-line">
        <AppBar actions={<SearchButton />} />
        <header className="px-4 pb-4 pt-1 sm:px-5">
          <p className="eyebrow">
            {t('title')} · {code}
          </p>
          {stop ? (
            <>
              <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight">{stop.name}</h1>
              <p className="text-sm text-fg-muted">
                {stop.district} · {t('linesCount', { count: stop.lines.length })}
              </p>
            </>
          ) : (
            <Skeleton className="mt-2 h-7 w-56" />
          )}
        </header>

        {!desktop ? map : null}

        <section className="border-y border-line bg-card">
          <h2 className="eyebrow px-4 pb-1 pt-4 sm:px-5">{t('lines')}</h2>
          {stop
            ? stop.lines.map((l) => (
                <StopLineRow
                  key={`${l.code}-${l.dir}`}
                  code={l.code}
                  dir={l.dir}
                  stopCode={stop.code}
                  otherDirHere={stop.lines.some((o) => o.code === l.code && o.dir !== l.dir)}
                />
              ))
            : [0, 1, 2].map((i) => <Skeleton key={i} className="mx-4 my-3 h-10" />)}
        </section>
        <p className="px-4 pb-12 pt-4 text-xs leading-relaxed text-fg-subtle sm:px-5">{t('liveNote')}</p>
      </div>
      {desktop ? <div className="lg:sticky lg:top-0 lg:h-dvh">{map}</div> : null}
    </div>
  );
}
