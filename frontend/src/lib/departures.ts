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
    // Only a big step back is midnight ("23:56" → "00:26"). Timetables also contain small
    // inversions ("07:14 07:04" where branches interleave); those are sorted, not a new day.
    if (base + offset < previous - 720) offset += 1440;
    const minutes = base + offset;
    previous = Math.max(previous, minutes);
    out.push({ label, minutes });
  }
  return out.sort((a, b) => a.minutes - b.minutes);
}

/** Minutes until the next planned departure from the first stop (null when none is left today). */
export function minutesToNextDeparture(times: string[] | undefined, nowMinutes: number): number | null {
  const next = toDepartures(times).find((d) => d.minutes >= nowMinutes);
  return next ? next.minutes - nowMinutes : null;
}
