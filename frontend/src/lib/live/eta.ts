import { distanceMeters } from '@/lib/network';
import { distanceToPath, mainVariant, type BusRoutes, type ClassifiedVehicle, type RouteVariant } from './routes';
import type { BusStop } from './types';

type TripMinutes = Record<string, Record<string, number>>;

const VARIANT_RE = /_([GD])_D(\d+)$/;

/**
 * Minutes a full run of this direction takes when starting at `hour`: İETT's recorded running
 * times (same weekday last week, from the backend), else the planned running time.
 */
export function fullRunMinutes(tripMinutes: TripMinutes | undefined, routes: BusRoutes | undefined, dir: 'G' | 'D' | null, hour: number) {
  if (!dir) return null;
  const keys = Object.keys(tripMinutes ?? {}).filter((k) => VARIANT_RE.exec(k)?.[1] === dir);
  const key =
    keys.find((k) => k.endsWith(`_${dir}_D0`)) ??
    keys.sort((a, b) => Object.keys(tripMinutes![b]).length - Object.keys(tripMinutes![a]).length)[0];
  const byHour = key ? tripMinutes![key] : undefined;
  if (byHour) {
    for (const delta of [0, -1, 1, -2, 2]) {
      const value = byHour[String((hour + delta + 24) % 24)];
      if (value) return value;
    }
    const all = Object.values(byHour).sort((a, b) => a - b);
    if (all.length) return all[Math.floor(all.length / 2)];
  }
  const planned = mainVariant(routes, dir)?.durationS;
  return planned ? planned / 60 : null;
}

export interface Arrival {
  /** Estimated minutes until the bus reaches the stop (null when no running time is known). */
  minutes: number | null;
  stops: number;
  vehicle: string;
}

const SERVES_M = 150;

/**
 * The next in-service bus for every stop of a direction. A bus is placed at its nearest stop and
 * the time scales the full-run minutes by distance along the stops; short trips only count for
 * stops their variant actually serves. A bus waiting at the first stop leaves at the next planned
 * departure (`startWait` minutes from now).
 */
export function nextArrivals(
  stops: BusStop[],
  vehicles: ClassifiedVehicle[],
  runMinutes: number | null,
  startWait: number | null = null,
): Map<string, Arrival> {
  const out = new Map<string, Arrival>();
  if (stops.length < 2) return out;
  const along = [0];
  for (let i = 1; i < stops.length; i++) along.push(along[i - 1] + distanceMeters(stops[i - 1], stops[i]));
  const total = along[along.length - 1] || 1;
  const index = new Map(stops.map((s, i) => [s.code, i]));

  const served = new Map<string, Set<number>>();
  const serves = (v: RouteVariant, j: number) => {
    let set = served.get(v.id);
    if (!set) {
      set = new Set(stops.flatMap((s, k) => (distanceToPath(s.lat, s.lng, v.coords) <= SERVES_M ? [k] : [])));
      served.set(v.id, set);
    }
    return set.has(j);
  };

  const buses = vehicles
    .filter((v) => v.inService && v.nearStop && index.has(v.nearStop))
    .map((v) => ({ v, at: index.get(v.nearStop!)! }))
    .sort((a, b) => b.at - a.at);

  for (let j = 0; j < stops.length; j++) {
    const bus = buses.find(({ v, at }) => at <= j && (!v.variant || v.variant.depar === '0' || serves(v.variant, j)));
    if (!bus) continue;
    out.set(stops[j].code, {
      minutes:
        runMinutes == null
          ? null
          : Math.round((runMinutes * (along[j] - along[bus.at])) / total + (bus.at === 0 ? (startWait ?? 0) : 0)),
      stops: j - bus.at,
      vehicle: bus.v.id,
    });
  }
  return out;
}
