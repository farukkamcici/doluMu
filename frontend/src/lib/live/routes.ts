'use client';
import { useQuery } from '@tanstack/react-query';
import type { BusVehicle } from './types';

/** One İETT route variant ("depar"): the main route is depar "0"; others are short or alternative trips. */
export interface RouteVariant {
  id: string; // e.g. "19_G_D1610"
  dir: 'G' | 'D';
  depar: string;
  name: string; // "AHMET EMEKLİGİL AİLE SAĞLIĞI MERKEZİ - BOSTANCI PERONLAR"
  lengthM: number;
  durationS: number;
  ring: boolean;
  coords: [number, number][][]; // [lng, lat] parts
}

export interface BusRoutes {
  code: string;
  name: string;
  variants: RouteVariant[];
}

// Mirrors scripts/build-bus-routes.mjs: ASCII-only file names.
const fileName = (code: string) => code.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}`);

/** Real road geometry of a bus line's variants (static, from İETT's route dataset). */
export const useBusRoutes = (code: string | null) =>
  useQuery({
    queryKey: ['bus-routes', code],
    queryFn: async () => {
      const res = await fetch(`/data/bus_routes/${fileName(code!)}.json`);
      if (!res.ok) throw new Error(`routes ${res.status}`);
      return (await res.json()) as BusRoutes;
    },
    enabled: !!code,
    staleTime: Infinity,
    retry: false,
  });

export const mainVariant = (routes: BusRoutes | undefined, dir: 'G' | 'D' | null) =>
  routes?.variants.find((v) => v.dir === dir && v.depar === '0') ?? routes?.variants.find((v) => v.dir === dir) ?? null;

/** Where a variant ends, e.g. "BOSTANCI PERONLAR" for a short trip. */
export const variantEnd = (v: RouteVariant) => v.name.split(' - ').pop()?.trim() || v.name;

const RAD = Math.PI / 180;

/** Metres from a point to a polyline (equirectangular projection around the point). */
function distanceToPath(lat: number, lng: number, parts: [number, number][][]) {
  const kx = Math.cos(lat * RAD) * 111_320;
  const ky = 110_574;
  let best = Infinity;
  for (const part of parts) {
    for (let i = 1; i < part.length; i++) {
      const ax = (part[i - 1][0] - lng) * kx;
      const ay = (part[i - 1][1] - lat) * ky;
      const bx = (part[i][0] - lng) * kx;
      const by = (part[i][1] - lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

interface Projection {
  along: number; // metres from the start of the path
  dist: number; // metres from the path
  point: [number, number];
}

const metres = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * Math.cos(a[1] * RAD) * 111_320, (a[1] - b[1]) * 110_574);

function project(lat: number, lng: number, path: [number, number][], cumulative: number[]): Projection {
  const kx = Math.cos(lat * RAD) * 111_320;
  const ky = 110_574;
  let best: Projection = { along: 0, dist: Infinity, point: path[0] };
  for (let i = 1; i < path.length; i++) {
    const ax = (path[i - 1][0] - lng) * kx;
    const ay = (path[i - 1][1] - lat) * ky;
    const dx = (path[i][0] - lng) * kx - ax;
    const dy = (path[i][1] - lat) * ky - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.dist) {
      const segLen = cumulative[i] - cumulative[i - 1];
      best = {
        along: cumulative[i - 1] + t * segLen,
        dist: d,
        point: [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t],
      };
    }
  }
  return best;
}

const COVERED_M = 120;

/**
 * Road geometry following the live stops. İETT's static route dataset can lag behind (line 19
 * moved from Kadıköy to Uzunçayır), so between each pair of stops we follow the best-matching
 * variant's road where it serves both stops in order, and draw a straight hop where it doesn't.
 */
export function routeThroughStops(
  routes: BusRoutes | undefined,
  dir: 'G' | 'D' | null,
  stops: { lat: number; lng: number }[],
): { coords: [number, number][]; variant: RouteVariant | null; coverage: number } | null {
  if (stops.length < 2) return null;
  const chain = stops.map((s) => [s.lng, s.lat] as [number, number]);
  const candidates = (routes?.variants ?? []).filter((v) => v.dir === dir);
  let best: { v: RouteVariant; covered: number } | null = null;
  for (const v of candidates) {
    const covered = stops.filter((s) => distanceToPath(s.lat, s.lng, v.coords) <= COVERED_M).length;
    if (!best || covered > best.covered || (covered === best.covered && v.depar === '0')) best = { v, covered };
  }
  if (!best || best.covered < stops.length * 0.3) return { coords: chain, variant: null, coverage: 0 };

  const path = best.v.coords.flat();
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + metres(path[i - 1], path[i]));
  const proj = stops.map((s) => project(s.lat, s.lng, path, cumulative));

  const out: [number, number][] = [chain[0]];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = proj[i];
    const b = proj[i + 1];
    const hop = metres(chain[i], chain[i + 1]);
    const followRoad = a.dist <= COVERED_M && b.dist <= COVERED_M && b.along > a.along && b.along - a.along < hop * 4 + 400;
    if (followRoad) {
      out.push(a.point);
      for (let k = 0; k < path.length; k++) if (cumulative[k] > a.along && cumulative[k] < b.along) out.push(path[k]);
      out.push(b.point);
    }
    out.push(chain[i + 1]);
  }
  return { coords: out, variant: best.v, coverage: best.covered / stops.length };
}

export interface ClassifiedVehicle extends BusVehicle {
  /** On its route (in service) vs. assigned to the line but elsewhere (to/from depot or start). */
  inService: boolean;
  variant: RouteVariant | null;
}

/** Assigned vehicles further than this from their route are treated as not in service. */
const OFF_ROUTE_M = 300;

/** Near the line's live stops counts as on route too, since the static geometry can be stale. */
const NEAR_STOP_M = 350;

export function classifyVehicles(
  vehicles: BusVehicle[] | undefined,
  routes: BusRoutes | undefined,
  liveStops: { lat: number; lng: number }[] = [],
): ClassifiedVehicle[] {
  if (!vehicles) return [];
  const byId = new Map((routes?.variants ?? []).map((v) => [v.id, v]));
  const nearStop = (lat: number, lng: number) =>
    liveStops.some((s) => Math.abs(s.lat - lat) < 0.004 && Math.hypot((s.lat - lat) * 110_574, (s.lng - lng) * 84_000) <= NEAR_STOP_M);
  return vehicles.map((v) => {
    const variant = (v.route && byId.get(v.route)) || (v.direction ? mainVariant(routes, v.direction) : null);
    const onVariant = variant ? distanceToPath(v.lat, v.lng, variant.coords) <= OFF_ROUTE_M : false;
    const inService = onVariant || nearStop(v.lat, v.lng) || (!variant && !liveStops.length);
    return { ...v, variant, inService };
  });
}
