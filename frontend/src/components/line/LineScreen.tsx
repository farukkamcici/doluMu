'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { AppBar } from '@/components/app/AppBar';
import { Segmented } from '@/components/primitives/Segmented';
import { Skeleton } from '@/components/primitives/Skeleton';
import { buttonVariants } from '@/components/primitives/Button';
import { LineBadge } from '@/components/transit/LineBadge';
import { MapPanel } from '@/components/map/MapPanel';
import { SearchButton } from '@/components/search/SearchButton';
import { StationSheet } from '@/components/station/StationSheet';
import { LineDisruption } from '@/components/live/LineDisruption';
import { useLineDisruptions } from '@/components/live/outages';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, type Direction } from '@/lib/api';
import { buildDayProfile } from '@/lib/crowd';
import { RAIL_COLORS, isMetroTopologyLine, modeOf } from '@/lib/lines';
import { lineEntries, lineStations, type NetworkLine, type NetworkStation } from '@/lib/network';
import { useBusHistory, useForecast, useLine, useLineStatus, useSchedule } from '@/lib/queries';
import { classifyVehicles, routeThroughStops, useBusRoutes } from '@/lib/live/routes';
import { useBusLine, useBusRegistry, useBusVehiclesMany, useRailRidership } from '@/lib/live/client';
import { fullRunMinutes, nextArrivals } from '@/lib/live/eta';
import { minutesToNextDeparture } from '@/lib/departures';
import { addDays } from '@/lib/time';
import { usePrefs } from '@/store/prefs';
import { useNow } from '@/hooks/useNow';
import { useLineName } from '@/hooks/useLineName';
import { useNetwork } from '@/hooks/useNetwork';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { NowCard } from './NowCard';
import { ForecastCard, type Day } from './ForecastCard';
import { ScheduleCard } from './ScheduleCard';
import { DetailsCard } from './DetailsCard';
import { AlertsBanner } from './AlertsBanner';
import { StationStrip } from './StationStrip';
import { BusStops } from './BusStops';
import { LineFacts } from './LineFacts';
import { Reliability } from './Reliability';
import { FavoriteButton, ShareButton } from './LineActions';

const DIRECTIONS: Direction[] = ['G', 'D'];

/** Keeps direction/day in the URL so a line view can be shared and survives reloads. */
function useUrlState() {
  const params = useSearchParams();
  const [dir, setDir] = useState<Direction | null>(() => {
    const value = params.get('dir');
    return value === 'G' || value === 'D' ? value : null;
  });
  const [day, setDay] = useState<Day>(() => (params.get('day') === 'tomorrow' ? 'tomorrow' : 'today'));

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (dir) next.set('dir', dir);
    else next.delete('dir');
    if (day === 'tomorrow') next.set('day', day);
    else next.delete('day');
    const query = next.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [dir, day]);

  return { dir, setDir, day, setDay };
}

/** Full-bleed section separated by hairlines (no floating cards). */
function Block({ children }: { children: ReactNode }) {
  return <section className="border-b border-line bg-card">{children}</section>;
}

export function LineScreen({ code }: { code: string }) {
  const t = useTranslations('line');
  const tb = useTranslations('bus');
  const tm = useTranslations('modes');
  const tc = useTranslations('common');
  const router = useRouter();
  const now = useNow();
  const desktop = useIsDesktop();
  const pushRecent = usePrefs((s) => s.pushRecent);
  const { dir, setDir, day, setDay } = useUrlState();
  const [pickedHour, setPickedHour] = useState<number | null>(null);
  const [station, setStation] = useState<NetworkStation | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // The forecast DB knows lines from 2022–24 ridership; İETT's live registry knows today's lines.
  const line = useLine(code);
  const registry = useBusRegistry();
  const liveInfo = registry.data?.find((l) => l.code === code) ?? null;
  const inDb = line.isSuccess;
  const rail = isMetroTopologyLine(code) || code === 'M1' || code === 'MARMARAY';
  // Rail codes win: İETT also runs replacement buses under metro codes (e.g. "M7 NURTEPE - MECIDIYEKÖY").
  const mode = rail ? 'rail' : modeOf(code, line.data?.transport_type_id ?? (liveInfo ? 1 : null));
  const busLike = mode === 'bus' || mode === 'metrobus';
  const dbMissing = line.error instanceof ApiError && line.error.status === 404;
  const notFound = dbMissing && !rail && !liveInfo && (registry.isSuccess || registry.isError);
  const retired = busLike && inDb && registry.isSuccess && !liveInfo;

  const busLive = useBusLine(busLike ? code : null);
  // Metrobüs: all 34-family variants share the road and the stations.
  const vehicleCodes = useMemo(() => {
    if (!busLike) return [];
    if (mode !== 'metrobus') return [code];
    const family = (registry.data ?? []).map((l) => l.code).filter((c) => /^34[A-ZÇĞİÖŞÜ]{0,3}$/.test(c));
    return family.length ? family : [code];
  }, [busLike, mode, code, registry.data]);
  const vehicles = useBusVehiclesMany(vehicleCodes);
  const schedule = useSchedule(code, busLike && (inDb || !!liveInfo));
  const directions = useMemo(() => {
    if (!busLike) return [];
    const live = DIRECTIONS.filter((d) => (busLive.data?.directions[d]?.stops.length ?? 0) > 0);
    return live.length ? live : DIRECTIONS.filter((d) => (schedule.data?.[d]?.length ?? 0) > 0);
  }, [busLike, busLive.data, schedule.data]);
  const direction: Direction | null = busLike ? (dir && directions.includes(dir) ? dir : directions[0] ?? null) : null;

  const date = day === 'today' ? now.date : addDays(now.date, 1);
  const forecast = useForecast(inDb ? code : null, date, direction);
  const todayForecast = useForecast(inDb ? code : null, now.date, direction);
  const status = useLineStatus(inDb ? code : null, direction);
  const routes = useBusRoutes(busLike ? code : null);
  const history = useBusHistory(busLike ? code : null);
  const ridership = useRailRidership(!busLike);
  const network = useNetwork();
  const metroLine = network.metro?.lines.find((l) => l.code === (code === 'M1' ? 'M1A' : code)) ?? null;
  const disruptions = useLineDisruptions(code);

  const profile = useMemo(() => (forecast.data ? buildDayProfile(forecast.data) : null), [forecast.data]);
  const todayProfile = useMemo(() => (todayForecast.data ? buildDayProfile(todayForecast.data) : null), [todayForecast.data]);

  const liveDirection = direction ? busLive.data?.directions[direction] : undefined;

  // Map: the rail network for context, this line on top. Buses: İETT's real road geometry of the
  // main variant for the chosen direction (falls back to joining the stops), stops, live vehicles.
  const ownRoute = useMemo(
    () => (busLike ? routeThroughStops(routes.data, direction, liveDirection?.stops ?? []) : null),
    [busLike, routes.data, direction, liveDirection],
  );
  const mapLines = useMemo<NetworkLine[]>(() => {
    if (!busLike) return network.lines;
    const segments: [number, number][][] = ownRoute?.coords.length
      ? [ownRoute.coords]
      : [(liveDirection?.stops ?? []).map((s) => [s.lng, s.lat] as [number, number])];
    const own: NetworkLine = { code, id: code, color: null, style: 'brt', segments: segments.filter((p) => p.length > 1) };
    return [...network.lines.filter((l) => l.code !== code), own];
  }, [busLike, network.lines, ownRoute, code, liveDirection]);

  const ownStations = useMemo<NetworkStation[]>(() => {
    if (busLike) {
      return (liveDirection?.stops ?? []).map((s) => ({
        id: `stop-${s.code}`,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        lines: [code],
        metroIds: [],
      }));
    }
    return lineStations(code, network.metro, network.marmaray, network.stations);
  }, [busLike, liveDirection, code, network.metro, network.marmaray, network.stations]);

  // Vehicles assigned to the line include ones driving to/from the depot: classify by distance to
  // their route variant, and place them by stop membership (robust across Metrobüs variants).
  const directionVehicles = useMemo(() => {
    const stopsHere = new Set((liveDirection?.stops ?? []).map((s) => s.code));
    const allStops = Object.values(busLive.data?.directions ?? {}).flatMap((d) => d?.stops ?? []);
    return classifyVehicles(vehicles.data, routes.data, allStops).filter(
      (v) => (v.nearStop && stopsHere.has(v.nearStop) && v.inService) || (!v.inService && v.variant?.dir === direction),
    );
  }, [vehicles.data, routes.data, liveDirection, direction, busLive.data]);
  const liveVehicles = directionVehicles;

  // Running time of a full trip at this hour (same weekday last week), scaled per stop for arrivals.
  const runMinutes = useMemo(
    () => (busLike ? fullRunMinutes(history.data?.tripMinutes, routes.data, direction, now.hour) : null),
    [busLike, history.data, routes.data, direction, now.hour],
  );
  const startWait = direction ? minutesToNextDeparture(schedule.data?.[direction], now.minutes) : null;
  const arrivals = useMemo(
    () => nextArrivals(liveDirection?.stops ?? [], directionVehicles, runMinutes, startWait),
    [liveDirection, directionVehicles, runMinutes, startWait],
  );
  const recorded = busLike && fullRunMinutes(history.data?.tripMinutes, undefined, direction, now.hour);
  const entries = useMemo(
    () => (busLike ? null : lineEntries(code, ownStations, network.metro, ridership.data)),
    [busLike, code, ownStations, network.metro, ridership.data],
  );
  const widths = useMemo(() => ({ [code]: 5 }), [code]);

  useEffect(() => {
    if (inDb || liveInfo) pushRecent(code);
  }, [inDb, liveInfo, code, pushRecent]);

  const selectedHour = pickedHour ?? now.hour;
  const name = useLineName(code, line.data);
  const color = RAIL_COLORS[code] ?? null;

  const selectStation = (s: NetworkStation) => {
    if (s.id.startsWith('stop-')) {
      router.push(`/stop/${s.id.slice(5)}`);
      return;
    }
    setStation(s);
    if (Number.isFinite(s.lat)) setFlyTo({ lat: s.lat, lng: s.lng, zoom: 14.5 });
  };

  if (notFound) {
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
      className="h-[38vh] min-h-[260px] lg:h-dvh"
      expandable={!desktop}
      embedded={!desktop}
      lines={mapLines}
      stations={ownStations}
      widths={widths}
      focus={code}
      alerts={disruptions.length ? [code] : []}
      vehicles={liveVehicles}
      flyTo={flyTo}
      onLineClick={(c) => c !== code && router.push(`/line/${encodeURIComponent(c)}`)}
      onStationClick={selectStation}
    />
  );

  const loadingHeader = line.isLoading && !liveInfo;

  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-line">
        <AppBar
          actions={
            <>
              <SearchButton />
              <ShareButton title={`${code} · DoluMu`} />
              <FavoriteButton code={code} />
            </>
          }
        />

        <header className="flex items-center gap-3 px-4 pb-4 pt-1 sm:px-5">
          <LineBadge code={code} typeId={rail ? 2 : (line.data?.transport_type_id ?? (liveInfo ? 1 : null))} size="lg" />
          <div className="min-w-0 flex-1">
            {loadingHeader ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-20" />
              </div>
            ) : (
              <>
                <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">{name || liveInfo?.name || code}</h1>
                <p className="text-sm text-fg-muted">{tm(mode)}</p>
              </>
            )}
          </div>
        </header>

        {!desktop ? map : null}

        <div className="border-t border-line">
          {line.isError && !dbMissing ? <p className="px-4 py-4 text-sm text-fg-muted sm:px-5">{t('loadError')}</p> : null}

          {retired ? (
            <p className="flex gap-2 border-b border-line bg-warn-soft px-4 py-3 text-sm sm:px-5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
              {tb('notRunning')}
            </p>
          ) : null}

          {directions.length > 1 ? (
            <div className="border-b border-line bg-card px-4 py-3 sm:px-5">
              <Segmented
                label={t('direction')}
                value={direction ?? 'G'}
                onChange={(d) => setDir(d)}
                options={directions.map((d) => {
                  const end = busLive.data?.directions[d]?.name ?? schedule.data?.meta?.[d]?.end;
                  const label = end ? t('towards', { stop: end }) : d === 'G' ? t('outbound') : t('inbound');
                  return { value: d, label, title: label };
                })}
              />
            </div>
          ) : null}

          <LineDisruption code={code} />
          <AlertsBanner status={status.data} code={code} />

          {inDb || line.isLoading ? (
            <>
              <Block>
                <NowCard
                  profile={todayProfile}
                  loading={line.isLoading || todayForecast.isLoading}
                  now={now}
                  nextServiceTime={status.data?.status === 'OUT_OF_SERVICE' ? status.data.next_service_time : null}
                  onPickHour={(hour) => {
                    setPickedHour(hour);
                    setDay('today');
                  }}
                  onShowTomorrow={() => {
                    setDay('tomorrow');
                    setPickedHour(null);
                  }}
                />
              </Block>
              <Block>
                <ForecastCard
                  day={day}
                  onDayChange={setDay}
                  profile={profile}
                  loading={line.isLoading || forecast.isLoading}
                  error={forecast.error}
                  onRetry={() => forecast.refetch()}
                  selectedHour={selectedHour}
                  onSelectHour={setPickedHour}
                  currentHour={day === 'today' ? now.hour : null}
                  color={color}
                />
              </Block>
            </>
          ) : (
            <Block>
              <div className="px-4 py-5 sm:px-5">
                <p className="font-display text-2xl font-bold">{tb('newLineTitle')}</p>
                <p className="mt-1 text-sm text-fg-muted">{tb('newLineBody')}</p>
              </div>
            </Block>
          )}

          {busLike && liveDirection && direction ? (
            <Block>
              <BusStops
                direction={liveDirection}
                vehicles={vehicles.data ? directionVehicles : undefined}
                vehiclesAt={vehicles.dataUpdatedAt}
                arrivals={arrivals}
              />
            </Block>
          ) : null}

          {busLike || mode === 'ferry' ? (
            <Block>
              <ScheduleCard
                code={code}
                mode={mode}
                schedule={schedule.data}
                scheduleLoading={(line.isLoading && !liveInfo) || schedule.isLoading}
                direction={direction}
                nowMinutes={now.minutes}
              />
            </Block>
          ) : null}

          {!busLike && ownStations.length > 1 ? (
            <Block>
              <StationStrip
                code={code}
                color={color ?? 'rgb(var(--fg))'}
                stations={ownStations}
                entries={entries}
                entriesYear={ridership.data?.year ?? null}
                onSelect={selectStation}
              />
            </Block>
          ) : null}

          <Block>
            <LineFacts
              metroLine={metroLine}
              busInfo={liveInfo}
              busTrip={
                recorded
                  ? { minutes: recorded, live: true }
                  : // The planned running time only holds while the variant still matches today's stops.
                    ownRoute?.variant?.durationS && ownRoute.coverage >= 0.95
                    ? { minutes: ownRoute.variant.durationS / 60, live: false }
                    : null
              }
            />
          </Block>

          {busLike && history.data?.days.length ? (
            <Block>
              <Reliability history={history.data} />
            </Block>
          ) : null}

          {inDb ? (
            <Block>
              <DetailsCard code={code} point={profile?.hours[selectedHour] ?? null} />
            </Block>
          ) : null}

          <div className="pb-12" />
        </div>
      </div>

      {desktop ? <div className="lg:sticky lg:top-0 lg:h-dvh">{map}</div> : null}

      <StationSheet station={station} onClose={() => setStation(null)} hour={now.hour} />
    </div>
  );
}
