'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Settings } from 'lucide-react';
import { Link, useRouter } from '@/i18n/routing';
import { buttonVariants } from '@/components/primitives/Button';
import { MapPanel } from '@/components/map/MapPanel';
import { SearchDialog } from '@/components/search/SearchDialog';
import { StationSheet } from '@/components/station/StationSheet';
import { buildDayProfile, type DayProfile } from '@/lib/crowd';
import { NETWORK_CODES, NETWORK_GROUPS, type NetworkStation } from '@/lib/network';
import { useForecasts } from '@/lib/queries';
import { formatHour } from '@/lib/time';
import { usePrefs } from '@/store/prefs';
import { useNow } from '@/hooks/useNow';
import { useMounted } from '@/hooks/useMounted';
import { useNetwork } from '@/hooks/useNetwork';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { BoardRow } from './NetworkBoard';
import { ContextLine } from './ContextLine';
import { HourScrubber } from './HourScrubber';
import { NearbyStations } from './NearbyStations';

/** Map stroke width (px at zoom 12) from passengers, on one scale for the whole network. */
const flowWidth = (passengers: number | null, max: number) =>
  passengers == null || max <= 0 ? 1.2 : 1.8 + 9 * Math.sqrt(passengers / max);

export function HomeScreen() {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const router = useRouter();
  const now = useNow();
  const mounted = useMounted();
  const desktop = useIsDesktop();
  const favorites = usePrefs((s) => s.favorites);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pickedHour, setPickedHour] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [station, setStation] = useState<NetworkStation | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const { state: geo, locate } = useGeolocation();
  const network = useNetwork();
  const hour = pickedHour ?? now.hour;

  const forecasts = useForecasts(NETWORK_CODES, now.date);
  const stamp = forecasts.map((f) => f.dataUpdatedAt).join(',');
  const profiles = useMemo(() => {
    const out: Record<string, DayProfile | undefined> = {};
    NETWORK_CODES.forEach((code, i) => {
      const data = forecasts[i]?.data;
      out[code] = data ? buildDayProfile(data) : undefined;
    });
    return out;
    // `forecasts` is a new array every render; its data changes are tracked by `stamp`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  const widths = useMemo(() => {
    const max = Math.max(0, ...Object.values(profiles).map((p) => p?.peakPassengers ?? 0));
    return Object.fromEntries(
      Object.entries(profiles).map(([code, p]) => [code, flowWidth(p?.hours[hour]?.passengers ?? null, max)]),
    );
  }, [profiles, hour]);

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
  const scrubbed = pickedHour !== null && pickedHour !== now.hour;

  const map = (
    <MapPanel
      className="h-[56vh] min-h-[340px] lg:h-dvh"
      expandable={!desktop}
      lines={network.lines}
      stations={network.stations}
      widths={widths}
      me={me}
      flyTo={flyTo ?? geoTarget}
      onLineClick={(code) => router.push(`/line/${encodeURIComponent(code)}`)}
      onStationClick={selectStation}
      embedded={!desktop}
      overlay={<HourScrubber hour={hour} onChange={setPickedHour} playing={playing} onPlayingChange={setPlaying} />}
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
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-12 w-full items-center gap-3 rounded-lg border-[1.5px] border-fg bg-card px-3.5 text-left"
          >
            <Search className="h-5 w-5 shrink-0" />
            <span className="flex-1 truncate text-fg-muted">{t('searchPlaceholder')}</span>
            <kbd className="hidden rounded border border-line px-1.5 font-display text-xs text-fg-subtle sm:inline">/</kbd>
          </button>
        </div>

        {!desktop ? map : null}

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

        <section className="pt-6" aria-labelledby="board">
          <div className="flex items-baseline justify-between px-4 pb-1 sm:px-5">
            <h2 id="board" className="font-display text-[26px] font-bold tracking-tight">
              {scrubbed ? t('boardAt', { hour: formatHour(hour) }) : t('board')}
            </h2>
            {scrubbed ? (
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setPickedHour(null);
                }}
                className="text-sm font-medium underline underline-offset-4"
              >
                {t('backToNow')}
              </button>
            ) : null}
          </div>
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

        <section className="pt-8" aria-labelledby="nearby">
          <h2 id="nearby" className="eyebrow px-4 pb-2 sm:px-5">
            {t('nearby')}
          </h2>
          <div className="border-y border-line bg-card">
            <NearbyStations stations={network.stations} geo={geo} onLocate={locate} onSelect={selectStation} />
          </div>
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
