import { parseClock } from './time';

export interface Departure {
  label: string;
  /** Minutes since service-day start; values past midnight continue above 1440. */
  minutes: number;
}

/** Timetables list post-midnight trips last ("00:15" after "23:50"); keep them in order. */
export function toDepartures(times: string[] | undefined): Departure[] {
  const out: Departure[] = [];
  let offset = 0;
  let previous = -1;
  for (const label of times ?? []) {
    const base = parseClock(label);
    if (base == null) continue;
    if (base + offset < previous) offset += 1440;
    previous = base + offset;
    out.push({ label, minutes: previous });
  }
  return out;
}

/** Minutes until the next planned departure from the first stop (null when none is left today). */
export function minutesToNextDeparture(times: string[] | undefined, nowMinutes: number): number | null {
  const next = toDepartures(times).find((d) => d.minutes >= nowMinutes);
  return next ? next.minutes - nowMinutes : null;
}
