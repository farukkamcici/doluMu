'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppBar } from '@/components/app/AppBar';
import { Segmented } from '@/components/primitives/Segmented';
import { Skeleton } from '@/components/primitives/Skeleton';
import { buttonVariants } from '@/components/primitives/Button';
import { LineBadge } from '@/components/transit/LineBadge';
import { MapPanel } from '@/components/map/MapPanel';
import { SearchButton } from '@/components/search/SearchButton';
import { StationSheet } from '@/components/station/StationSheet';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, type Direction } from '@/lib/api';
import { buildDayProfile } from '@/lib/crowd';
import { RAIL_COLORS, modeOf } from '@/lib/lines';
import { lineStations, type NetworkLine, type NetworkStation } from '@/lib/network';
import { useForecast, useLine, useLineStatus, useMarmarayStations, useRoute, useSchedule } from '@/lib/queries';
import { addDays } from '@/lib/time';
import { topologyLine } from '@/lib/topology';
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

  const line = useLine(code);
  const mode = modeOf(code, line.data?.transport_type_id);
  const busLike = mode === 'bus' || mode === 'metrobus';
  const ok = line.isSuccess;

  const schedule = useSchedule(code, busLike && ok);
  const directions = useMemo(() => DIRECTIONS.filter((d) => (schedule.data?.[d]?.length ?? 0) > 0), [schedule.data]);
  const direction: Direction | null = busLike ? (dir && directions.includes(dir) ? dir : directions[0] ?? null) : null;

  const date = day === 'today' ? now.date : addDays(now.date, 1);
  const forecast = useForecast(ok ? code : null, date, direction);
  const todayForecast = useForecast(ok ? code : null, now.date, direction);
  const status = useLineStatus(ok ? code : null, direction);
  const route = useRoute(code, busLike && ok);
  const network = useNetwork();
  const marmaray = useMarmarayStations(code === 'MARMARAY');
  const topoLine = topologyLine(network.topology, code);

  const profile = useMemo(() => (forecast.data ? buildDayProfile(forecast.data) : null), [forecast.data]);
  const todayProfile = useMemo(() => (todayForecast.data ? buildDayProfile(todayForecast.data) : null), [todayForecast.data]);

  // Map: the rail network for context, this line on top (bus routes drawn from the route API).
  const mapLines = useMemo<NetworkLine[]>(() => {
    if (!busLike) return network.lines;
    const shape = (direction && route.data?.[direction]) || route.data?.G || route.data?.D || [];
    const own: NetworkLine = { code, id: code, color: null, style: 'brt', coords: shape.map(([lat, lng]) => [lng, lat]) };
    return [...network.lines.filter((l) => l.code !== code), own];
  }, [busLike, network.lines, route.data, direction, code]);
  const ownStations = useMemo(
    () => (busLike ? [] : lineStations(code, network.topology, marmaray.data, network.stations)),
    [busLike, code, network.topology, marmaray.data, network.stations],
  );
  const widths = useMemo(() => ({ [code]: 5 }), [code]);

  useEffect(() => {
    if (ok) pushRecent(code);
  }, [ok, code, pushRecent]);

  const selectedHour = pickedHour ?? now.hour;
  const notFound = line.error instanceof ApiError && line.error.status === 404;
  const name = useLineName(code, line.data);
  const color = RAIL_COLORS[code] ?? null;

  const selectStation = (s: NetworkStation) => {
    setStation(s);
    setFlyTo({ lat: s.lat, lng: s.lng, zoom: 14.5 });
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
      flyTo={flyTo}
      onLineClick={(c) => c !== code && router.push(`/line/${encodeURIComponent(c)}`)}
      onStationClick={selectStation}
    />
  );

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
          <LineBadge code={code} typeId={line.data?.transport_type_id} size="lg" />
          <div className="min-w-0 flex-1">
            {line.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-20" />
              </div>
            ) : (
              <>
                <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">{name || code}</h1>
                <p className="text-sm text-fg-muted">{tm(mode)}</p>
              </>
            )}
          </div>
        </header>

        {!desktop ? map : null}

        <div className="border-t border-line">
          {line.isError ? <p className="px-4 py-4 text-sm text-fg-muted sm:px-5">{t('loadError')}</p> : null}

          {directions.length > 1 ? (
            <div className="border-b border-line bg-card px-4 py-3 sm:px-5">
              <Segmented
                label={t('direction')}
                value={direction ?? 'G'}
                onChange={(d) => setDir(d)}
                options={directions.map((d) => {
                  const end = schedule.data?.meta?.[d]?.end;
                  const label = end ? t('towards', { stop: end }) : d === 'G' ? t('outbound') : t('inbound');
                  return { value: d, label, title: label };
                })}
              />
            </div>
          ) : null}

          <AlertsBanner status={status.data} code={code} />

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

          <Block>
            <ScheduleCard
              code={code}
              mode={mode}
              schedule={schedule.data}
              scheduleLoading={line.isLoading || schedule.isLoading}
              direction={direction}
              topoLine={topoLine}
              nowMinutes={now.minutes}
            />
          </Block>

          {ownStations.length > 1 ? (
            <Block>
              <StationStrip code={code} color={color ?? 'rgb(var(--fg))'} stations={ownStations} onSelect={selectStation} />
            </Block>
          ) : null}

          <Block>
            <DetailsCard code={code} point={profile?.hours[selectedHour] ?? null} />
          </Block>

          <p className="px-4 pb-12 pt-6 text-xs leading-relaxed text-fg-subtle sm:px-5">{tc('notLive')}</p>
        </div>
      </div>

      {desktop ? <div className="lg:sticky lg:top-0 lg:h-dvh">{map}</div> : null}

      <StationSheet station={station} onClose={() => setStation(null)} hour={now.hour} />
    </div>
  );
}
