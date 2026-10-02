'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LocateFixed, Loader2, Search, Settings } from 'lucide-react';
import { Link, useRouter } from '@/i18n/routing';
import { buttonVariants } from '@/components/primitives/Button';
import { MapPanel } from '@/components/map/MapPanel';
import { SearchDialog } from '@/components/search/SearchDialog';
import { StationSheet } from '@/components/station/StationSheet';
import { NETWORK_CODES, NETWORK_GROUPS, type NetworkStation } from '@/lib/network';
import { useForecasts } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { usePrefs } from '@/store/prefs';
import { useNow } from '@/hooks/useNow';
import { useMounted } from '@/hooks/useMounted';
import { useNetwork } from '@/hooks/useNetwork';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { BoardRow } from './NetworkBoard';
import { ContextLine } from './ContextLine';
import { NearbyStations, NearbyStops } from './NearbyStations';
import { ServiceStatus } from '@/components/live/ServiceStatus';
import { disruptedCodes } from '@/components/live/outages';
import { useMetroStatus } from '@/lib/live/client';

export function HomeScreen() {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const router = useRouter();
  const now = useNow();
  const mounted = useMounted();
  const desktop = useIsDesktop();
  const favorites = usePrefs((s) => s.favorites);
  const [searchOpen, setSearchOpen] = useState(false);
  const [station, setStation] = useState<NetworkStation | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const { state: geo, locate } = useGeolocation();
  const network = useNetwork();
  const hour = now.hour;
  const metroStatus = useMetroStatus();
  const alerts = useMemo(() => disruptedCodes((metroStatus.data?.disruptions ?? []).map((d) => d.line)), [metroStatus.data]);

  // Warm the forecast cache for every board row in one go.
  useForecasts(NETWORK_CODES, now.date);

  // "/" opens search, like most search-first web apps.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectStation = useCallback((s: NetworkStation) => {
    setStation(s);
    setFlyTo({ lat: s.lat, lng: s.lng, zoom: 14 });
  }, []);

  const geoTarget = useMemo(() => (geo.status === 'ok' ? { lat: geo.lat, lng: geo.lng, zoom: 13.5 } : null), [geo]);
  const me = useMemo(() => (geo.status === 'ok' ? { lat: geo.lat, lng: geo.lng } : null), [geo]);
  const favs = mounted ? favorites : [];

  const map = (
    <MapPanel
      className="h-[56vh] min-h-[340px] lg:h-dvh"
      expandable={!desktop}
      fleetToggle
      lines={network.lines}
      stations={network.stations}
      me={me}
      alerts={alerts}
      flyTo={flyTo ?? geoTarget}
      onLineClick={(code) => router.push(`/line/${encodeURIComponent(code)}`)}
      onStationClick={selectStation}
      embedded={!desktop}
    />
  );

  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <div className="lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-line">
        <header className="pt-safe px-4 sm:px-5">
          <div className="flex h-14 items-center justify-between">
            <Link href="/" className="font-display text-[26px] font-bold tracking-tight">
              DoluMu<span className="text-signal">.</span>
            </Link>
            <Link href="/settings" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={tc('settings')}>
              <Settings className="h-5 w-5" />
            </Link>
          </div>
          <ContextLine />
        </header>

        <div className="px-4 pb-4 pt-3 sm:px-5">
          <div className="flex h-12 w-full items-center rounded-lg border-[1.5px] border-fg bg-card pl-3.5 pr-1.5">
            <button type="button" onClick={() => setSearchOpen(true)} className="flex h-full min-w-0 flex-1 items-center gap-3 text-left">
              <Search className="h-5 w-5 shrink-0" />
              <span className="flex-1 truncate text-fg-muted">{t('searchPlaceholder')}</span>
              <kbd className="hidden rounded border border-line px-1.5 font-display text-xs text-fg-subtle sm:inline">/</kbd>
            </button>
            <button
              type="button"
              onClick={locate}
              disabled={geo.status === 'locating'}
              aria-label={t('nearbyAction')}
              title={t('nearbyAction')}
              className={cn(
                'ml-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
                geo.status === 'ok' ? 'bg-fg text-bg' : 'bg-bg-subtle text-fg hover:bg-fg/10',
              )}
            >
              {geo.status === 'locating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </button>
          </div>
          {geo.status === 'denied' || geo.status === 'error' ? (
            <p className="mt-2 text-sm text-fg-muted">{geo.status === 'denied' ? t('nearbyDenied') : t('nearbyError')}</p>
          ) : null}
        </div>

        {!desktop ? map : null}

        {geo.status === 'ok' ? (
        <section className="pt-6" aria-labelledby="nearby">
          <h2 id="nearby" className="eyebrow px-4 pb-2 sm:px-5">
            {t('nearby')}
          </h2>
          <div className="border-y border-line bg-card">
            <NearbyStations stations={network.stations} geo={geo} onSelect={selectStation} />
          </div>
          <h2 className="eyebrow px-4 pb-2 pt-5 sm:px-5">{t('nearbyStops')}</h2>
          <div className="border-y border-line bg-card">
            <NearbyStops geo={geo} />
          </div>
        </section>
        ) : null}

        {favs.length ? (
          <section className="pt-6" aria-labelledby="favorites">
            <h2 id="favorites" className="eyebrow px-4 pb-2 sm:px-5">
              {t('favorites')}
            </h2>
            <div className="border-y border-line bg-card">
              {favs.map((code) => (
                <BoardRow key={code} code={code} hour={hour} />
              ))}
            </div>
          </section>
        ) : null}

        <ServiceStatus />

        <section className="pt-6" aria-labelledby="board">
          <h2 id="board" className="px-4 pb-1 font-display text-[26px] font-bold tracking-tight sm:px-5">
            {t('board')}
          </h2>
          {NETWORK_GROUPS.map((group) => (
            <div key={group.id} className="pt-3">
              <h3 className="eyebrow px-4 pb-1.5 sm:px-5">{t(`groups.${group.id}`)}</h3>
              <div className="border-y border-line bg-card">
                {group.codes.map((code) => (
                  <BoardRow key={code} code={code} hour={hour} />
                ))}
              </div>
            </div>
          ))}
          <p className="px-4 pt-3 text-sm text-fg-muted sm:px-5">{t('busHint')}</p>
        </section>


        <footer className="px-4 pb-12 pt-8 text-xs leading-relaxed text-fg-subtle sm:px-5">
          {tc('notLive')}{' '}
          <Link href="/settings#about" className="font-medium text-fg-muted underline underline-offset-2">
            {tc('howItWorks')}
          </Link>
        </footer>
      </div>

      {desktop ? <div className="lg:sticky lg:top-0 lg:h-dvh">{map}</div> : null}

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <StationSheet station={station} onClose={() => setStation(null)} hour={hour} />
    </div>
  );
}
