import type { HourlyForecast } from './api';

/**
 * Crowd level relative to the line's own busiest hour of the day (Google "Popular times" style).
 * The API's occupancy_pct depends on weak capacity estimates and saturates at 100% for many
 * lines, so it cannot answer "when is it quieter?". See DESIGN.md.
 */
export type CrowdLevel = 'quiet' | 'normal' | 'busy' | 'peak';
export type HourState = CrowdLevel | 'closed' | 'nodata';

export const LEVELS: CrowdLevel[] = ['quiet', 'normal', 'busy', 'peak'];

const THRESHOLDS: [number, CrowdLevel][] = [
  [0.85, 'peak'],
  [0.65, 'busy'],
  [0.4, 'normal'],
];

export function levelFor(ratio: number): CrowdLevel {
  for (const [min, level] of THRESHOLDS) if (ratio >= min) return level;
  return 'quiet';
}

export interface HourPoint {
  hour: number;
  state: HourState;
  /** 0–1, share of the day's busiest hour. Null when out of service or without data. */
  ratio: number | null;
  passengers: number | null;
  occupancyPct: number | null;
  capacity: number | null;
  tripsPerHour: number | null;
  vehicleCapacity: number | null;
}

export interface DayProfile {
  hours: HourPoint[];
  /** False when the model has nothing for this line (all hours zero or missing). */
  hasData: boolean;
  peakPassengers: number;
  serviceHours: number[];
}

export function buildDayProfile(forecast: HourlyForecast[] | undefined): DayProfile {
  const byHour = new Map((forecast ?? []).map((f) => [f.hour, f]));
  // A zero forecast inside "service hours" means nobody rides then: treat it as no service.
  const inService = (f?: HourlyForecast) =>
    !!f && f.in_service && f.crowd_level !== 'Out of Service' && (f.predicted_value ?? 0) >= 0.5;

  const peakPassengers = Math.max(0, ...[...byHour.values()].filter(inService).map((f) => f.predicted_value!));
  // The model returns zeros all day for lines it has no history for.
  const hasData = peakPassengers > 0;

  const hours: HourPoint[] = Array.from({ length: 24 }, (_, hour) => {
    const f = byHour.get(hour);
    const base = {
      hour,
      occupancyPct: f?.occupancy_pct ?? null,
      capacity: f?.max_capacity ?? null,
      tripsPerHour: f?.trips_per_hour ?? null,
      vehicleCapacity: f?.vehicle_capacity ?? null,
    };
    if (!inService(f)) {
      return { ...base, state: f ? 'closed' : 'nodata', ratio: null, passengers: null };
    }
    if (!hasData) return { ...base, state: 'nodata', ratio: null, passengers: null };
    const passengers = Math.max(0, f!.predicted_value ?? 0);
    const ratio = passengers / peakPassengers;
    return { ...base, state: levelFor(ratio), ratio, passengers };
  });

  return {
    hours,
    hasData,
    peakPassengers,
    serviceHours: hours.filter((h) => h.state !== 'closed' && h.state !== 'nodata').map((h) => h.hour),
  };
}

export interface QuieterSuggestion {
  hour: number;
  /** How much quieter than now, 0–1. */
  drop: number;
  level: CrowdLevel;
}

/** Quietest in-service hour within the next `window` hours, if meaningfully quieter than now. */
export function findQuieterHour(
  profile: DayProfile,
  fromHour: number,
  window = 3,
  minDrop = 0.15,
): QuieterSuggestion | null {
  const current = profile.hours[fromHour];
  if (!current?.passengers) return null;

  let best: HourPoint | null = null;
  for (let h = fromHour + 1; h <= Math.min(23, fromHour + window); h++) {
    const candidate = profile.hours[h];
    if (candidate.passengers == null) continue;
    if (!best || candidate.passengers < best.passengers!) best = candidate;
  }
  if (!best || best.passengers == null) return null;

  const drop = 1 - best.passengers / current.passengers;
  if (drop < minDrop) return null;
  return { hour: best.hour, drop, level: best.state as CrowdLevel };
}

/** Busiest and quietest stretches, used for the day summary line. */
export function daySummary(profile: DayProfile) {
  const served = profile.hours.filter((h) => h.passengers != null);
  if (!served.length) return null;
  const peak = served.reduce((a, b) => (b.passengers! > a.passengers! ? b : a));
  const daytime = served.filter((h) => h.hour >= 6 && h.hour <= 22);
  const pool = daytime.length ? daytime : served;
  const quiet = pool.reduce((a, b) => (b.passengers! < a.passengers! ? b : a));
  return { peakHour: peak.hour, quietHour: quiet.hour };
}

export interface HourWindow {
  start: number;
  /** Exclusive. */
  end: number;
}

/** Consecutive runs of hours in `states`, within daytime by default (night hours are rarely useful). */
export function hourWindows(profile: DayProfile, states: HourState[], from = 6, to = 24): HourWindow[] {
  const runs: HourWindow[] = [];
  let start: number | null = null;
  for (let h = from; h <= to; h++) {
    const inRun = h < to && states.includes(profile.hours[h]?.state);
    if (inRun && start === null) start = h;
    if (!inRun && start !== null) {
      runs.push({ start, end: h });
      start = null;
    }
  }
  return runs;
}
