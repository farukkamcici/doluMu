'use client';
import { toDepartures, type Departure } from '@/lib/departures';
import { forecastCode } from '@/lib/network';
import { useNow } from '@/hooks/useNow';
import { useMetroDepartures } from './client';

/** Metro service days run past midnight; before 03:00 we're still in yesterday's timetable. */
const SERVICE_DAY_START = 180;

export interface TrainRow {
  key: string;
  /** Forecast/line-page code (M1A and M1B → M1). */
  line: string;
  towards: string;
  next: Departure[];
  /** Minutes until `next[0]`. */
  inMin: number | null;
}

/** Upcoming trains per line and direction for Metro İstanbul station ids. */
export function useNextTrains(stationIds: number[], count = 3) {
  const now = useNow();
  const { data, loading } = useMetroDepartures(stationIds);
  const at = now.minutes < SERVICE_DAY_START ? now.minutes + 1440 : now.minutes;
  const rows: TrainRow[] = data.flatMap((station) =>
    station.directions.map((d) => {
      const next = toDepartures(d.times)
        .filter((x) => x.minutes >= at)
        .slice(0, count);
      return {
        key: `${station.stationId}-${d.id}`,
        line: forecastCode(station.line),
        towards: d.towards,
        next,
        inMin: next.length ? next[0].minutes - at : null,
      };
    }),
  );
  return { rows, loading };
}
