'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SearchX } from 'lucide-react';
import { AppBar } from '@/components/app/AppBar';
import { Segmented } from '@/components/primitives/Segmented';
import { Notice } from '@/components/primitives/Notice';
import { Skeleton } from '@/components/primitives/Skeleton';
import { buttonVariants } from '@/components/primitives/Button';
import { LineBadge } from '@/components/transit/LineBadge';
import { Link } from '@/i18n/routing';
import { ApiError, type Direction } from '@/lib/api';
import { buildDayProfile } from '@/lib/crowd';
import { lineColor, modeOf } from '@/lib/lines';
import { useForecast, useLine, useLineStatus, useRoute, useSchedule, useTopology } from '@/lib/queries';
import { addDays } from '@/lib/time';
import { topologyLine } from '@/lib/topology';
import { usePrefs } from '@/store/prefs';
import { useNow } from '@/hooks/useNow';
import { useLineName } from '@/hooks/useLineName';
import { NowCard } from './NowCard';
import { ForecastCard, type Day } from './ForecastCard';
import { ScheduleCard } from './ScheduleCard';
import { RouteCard } from './RouteCard';
import { DetailsCard } from './DetailsCard';
import { AlertsBanner } from './AlertsBanner';
import { FavoriteButton, ShareButton } from './LineActions';
import { SearchButton } from '@/components/search/SearchButton';

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

export function LineScreen({ code }: { code: string }) {
  const t = useTranslations('line');
  const tm = useTranslations('modes');
  const tc = useTranslations('common');
  const now = useNow();
  const pushRecent = usePrefs((s) => s.pushRecent);
  const { dir, setDir, day, setDay } = useUrlState();
  const [pickedHour, setPickedHour] = useState<number | null>(null);

  const line = useLine(code);
  const mode = modeOf(code, line.data?.transport_type_id);
  const busLike = mode === 'bus' || mode === 'metrobus';

  const schedule = useSchedule(code, busLike && line.isSuccess);
  const directions = useMemo(
    () => DIRECTIONS.filter((d) => (schedule.data?.[d]?.length ?? 0) > 0),
    [schedule.data],
  );
  const direction: Direction | null = busLike ? (dir && directions.includes(dir) ? dir : directions[0] ?? null) : null;

  const date = day === 'today' ? now.date : addDays(now.date, 1);
  const forecast = useForecast(line.isSuccess ? code : null, date, direction);
  const todayForecast = useForecast(line.isSuccess ? code : null, now.date, direction);
  const status = useLineStatus(line.isSuccess ? code : null, direction);
  const route = useRoute(code, busLike && line.isSuccess);
  const topology = useTopology(mode === 'rail');
  const topoLine = topologyLine(topology.data, code);

  const profile = useMemo(() => (forecast.data ? buildDayProfile(forecast.data) : null), [forecast.data]);
  const todayProfile = useMemo(
    () => (todayForecast.data ? buildDayProfile(todayForecast.data) : null),
    [todayForecast.data],
  );

  useEffect(() => {
    if (line.isSuccess) pushRecent(code);
  }, [line.isSuccess, code, pushRecent]);

  const selectedHour = pickedHour ?? now.hour;
  const notFound = line.error instanceof ApiError && line.error.status === 404;
  const name = useLineName(code, line.data);
  const color = lineColor(code, line.data?.transport_type_id);

  const pickHour = (hour: number, switchToToday = false) => {
    setPickedHour(hour);
    if (switchToToday) setDay('today');
  };

  if (notFound) {
    return (
      <>
        <AppBar />
        <main className="mx-auto max-w-xl px-4 py-10">
          <Notice
            icon={<SearchX className="h-5 w-5" />}
            title={t('notFoundTitle')}
            action={
              <Link href="/" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                {tc('home')}
              </Link>
            }
          >
            {t('notFoundBody', { code })}
          </Notice>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar
        actions={
          <>
            <SearchButton />
            <ShareButton title={`${code} · DoluMu`} />
            <FavoriteButton code={code} />
          </>
        }
      />

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <header className="flex items-start gap-3 pb-5 pt-1">
          <LineBadge code={code} typeId={line.data?.transport_type_id} size="lg" />
          <div className="min-w-0 flex-1 pt-0.5">
            {line.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-20" />
              </div>
            ) : (
              <>
                <h1 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{name || code}</h1>
                <p className="mt-0.5 text-sm text-fg-muted">{tm(mode)}</p>
              </>
            )}
          </div>
        </header>

        {line.isError && !notFound ? <Notice className="mb-4">{t('loadError')}</Notice> : null}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-6">
          <div className="space-y-4">
            {directions.length > 1 ? (
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
            ) : null}

            <AlertsBanner status={status.data} code={code} />

            <NowCard
              profile={todayProfile}
              loading={line.isLoading || todayForecast.isLoading}
              now={now}
              nextServiceTime={status.data?.status === 'OUT_OF_SERVICE' ? status.data.next_service_time : null}
              onPickHour={(hour) => pickHour(hour, true)}
              onShowTomorrow={() => {
                setDay('tomorrow');
                setPickedHour(null);
              }}
            />

            <ForecastCard
              day={day}
              onDayChange={setDay}
              profile={profile}
              loading={line.isLoading || forecast.isLoading}
              error={forecast.error}
              onRetry={() => forecast.refetch()}
              selectedHour={selectedHour}
              onSelectHour={(hour) => pickHour(hour)}
              currentHour={day === 'today' ? now.hour : null}
            />

            <ScheduleCard
              code={code}
              mode={mode}
              schedule={schedule.data}
              scheduleLoading={line.isLoading || schedule.isLoading}
              direction={direction}
              topoLine={topoLine}
              nowMinutes={now.minutes}
            />
          </div>

          <div className="space-y-4 lg:sticky lg:top-20">
            <RouteCard
              route={route.data}
              routeLoading={line.isLoading || route.isLoading || topology.isLoading}
              direction={direction}
              topoLine={topoLine}
              color={color}
            />
            <DetailsCard code={code} point={profile?.hours[selectedHour] ?? null} />
            <p className="px-1 text-xs leading-relaxed text-fg-subtle">{tc('notLive')}</p>
          </div>
        </div>
      </main>
    </>
  );
}
