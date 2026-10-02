import { RAIL_COLORS } from './lines';
import type { MetroLine, MetroNetwork, MetroStation } from './live/types';
import type { Topology } from './topology';

/** Lines shown on the network map and the "right now" board, grouped like station signage. */
export const NETWORK_GROUPS: { id: 'metro' | 'tram' | 'regional' | 'cable'; codes: string[] }[] = [
  { id: 'metro', codes: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'] },
  { id: 'regional', codes: ['MARMARAY', '34'] },
  { id: 'tram', codes: ['T1', 'T3', 'T4', 'T5'] },
  { id: 'cable', codes: ['F1', 'F4', 'TF1', 'TF2'] },
];

export const NETWORK_CODES = NETWORK_GROUPS.flatMap((g) => g.codes);

export type LineStyle = 'metro' | 'railway' | 'brt';

export interface NetworkLine {
  /** Forecast/line-page code (M1A and M1B both map to M1). */
  code: string;
  /** Geometry id, unique per drawn path. */
  id: string;
  color: string | null;
  style: LineStyle;
  /** One or more polylines ([lng, lat]); branches are separate segments. */
  segments: [number, number][][];
}

export interface StationFacilities {
  lifts: number;
  escalators: number;
  wc: boolean;
  masjid: boolean;
  babyRoom: boolean;
}

export interface NetworkStation {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** Line codes calling here (transfer stations merged). */
  lines: string[];
  /** Metro İstanbul station ids (one per line), to match equipment outages. */
  metroIds: number[];
  /** Marmaray station order, when Marmaray calls here. */
  marmarayOrder?: number;
  facilities?: StationFacilities;
}

export interface MarmarayStations {
  stations: { order: number; name: string; lat: number; lng: number }[];
}

export async function fetchMarmaray(): Promise<MarmarayStations> {
  const res = await fetch('/data/marmaray_stations.json');
  if (!res.ok) throw new Error(`marmaray ${res.status}`);
  return res.json();
}

export const forecastCode = (metroCode: string) => (metroCode === 'M1A' || metroCode === 'M1B' ? 'M1' : metroCode);

/** The bundled snapshot in the live API's shape, used when Metro İstanbul is unreachable. */
export function topologyToNetwork(topology: Topology): MetroNetwork {
  const lines: MetroLine[] = Object.entries(topology.lines).map(([code, l]) => ({
    code,
    name: l.description,
    nameEn: l.description_en ?? l.description,
    color: l.color,
    firstTime: l.first_time,
    lastTime: l.last_time,
    facts: { lengthKm: null, stations: null, vehicles: null, tripMinutes: null, dailyRiders: null, dailyTrips: null, headway: [] },
  }));
  const stations: MetroStation[] = Object.entries(topology.lines).flatMap(([code, l]) =>
    l.stations.map((s) => ({
      id: s.id,
      line: code,
      name: s.description || s.name,
      order: s.order,
      lat: s.coordinates?.lat ?? null,
      lng: s.coordinates?.lng ?? null,
      lifts: s.accessibility?.elevator ? 1 : 0,
      escalators: s.accessibility?.escalator ? 1 : 0,
      wc: !!s.accessibility?.wc,
      masjid: !!s.accessibility?.masjid,
      babyRoom: !!s.accessibility?.babyRoom,
    })),
  );
  return { lines, stations, fetchedAt: '' };
}

/** Metres between two points (equirectangular is plenty at city scale). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

type Pt = { lat: number; lng: number };

/**
 * Station order is a list, but some lines branch (M2 Sanayi–Seyrantepe). A station far from the
 * previous one starts a new segment from its nearest earlier station instead of a long zigzag.
 */
function segmentsFor(points: Pt[]): [number, number][][] {
  if (points.length < 2) return [];
  const gaps = points.slice(1).map((p, i) => distanceMeters(points[i], p)).sort((a, b) => a - b);
  const typical = gaps[Math.floor(gaps.length / 2)] || 1000;
  const segments: Pt[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const current = segments[segments.length - 1];
    const last = current[current.length - 1];
    if (distanceMeters(last, p) > Math.max(3 * typical, 3000)) {
      const anchor = points.slice(0, i).reduce((best, q) => (distanceMeters(q, p) < distanceMeters(best, p) ? q : best));
      segments.push([anchor, p]);
    } else {
      current.push(p);
    }
  }
  return segments.filter((s) => s.length > 1).map((s) => s.map((p) => [p.lng, p.lat]));
}

const orderedWithCoords = (stations: MetroStation[], line: string) =>
  stations
    .filter((s) => s.line === line && s.lat != null && s.lng != null)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ lat: s.lat!, lng: s.lng! }));

export function buildNetworkLines(
  metro: MetroNetwork | undefined,
  marmaray: MarmarayStations | undefined,
  /** Metrobüs road geometry ([lng, lat] parts) from İETT's route dataset. */
  metrobus: [number, number][][] | undefined,
): NetworkLine[] {
  const out: NetworkLine[] = [];
  for (const line of metro?.lines ?? []) {
    const segments = segmentsFor(orderedWithCoords(metro!.stations, line.code));
    if (segments.length) {
      out.push({ code: forecastCode(line.code), id: line.code, color: RAIL_COLORS[line.code] ?? line.color, style: 'metro', segments });
    }
  }
  if (marmaray?.stations.length) {
    out.push({
      code: 'MARMARAY',
      id: 'MARMARAY',
      color: null,
      style: 'railway',
      segments: [[...marmaray.stations].sort((a, b) => a.order - b.order).map((s) => [s.lng, s.lat])],
    });
  }
  if (metrobus?.length) {
    out.push({ code: '34', id: '34', color: null, style: 'brt', segments: metrobus });
  }
  // Wide Metrobüs/Marmaray strokes go underneath so metro lines stay visible on top.
  return [...out.filter((l) => l.style !== 'metro'), ...out.filter((l) => l.style === 'metro')];
}

export const normName = (name: string) =>
  name
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]/g, '');

/** Stations of all rail lines, with same-name stations within 400 m merged into transfers. */
export function buildNetworkStations(metro: MetroNetwork | undefined, marmaray: MarmarayStations | undefined): NetworkStation[] {
  const merged: NetworkStation[] = [];
  const add = (s: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    line: string;
    metroId?: number;
    marmarayOrder?: number;
    facilities?: StationFacilities;
  }) => {
    const match = merged.find((m) => normName(m.name) === normName(s.name) && distanceMeters(m, s) < 400);
    if (match) {
      if (!match.lines.includes(s.line)) match.lines.push(s.line);
      if (s.metroId != null) match.metroIds.push(s.metroId);
      if (s.marmarayOrder != null) match.marmarayOrder = s.marmarayOrder;
      if (s.facilities) {
        match.facilities = match.facilities
          ? {
              lifts: match.facilities.lifts + s.facilities.lifts,
              escalators: match.facilities.escalators + s.facilities.escalators,
              wc: match.facilities.wc || s.facilities.wc,
              masjid: match.facilities.masjid || s.facilities.masjid,
              babyRoom: match.facilities.babyRoom || s.facilities.babyRoom,
            }
          : s.facilities;
      }
      return;
    }
    merged.push({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      lines: [s.line],
      metroIds: s.metroId != null ? [s.metroId] : [],
      marmarayOrder: s.marmarayOrder,
      facilities: s.facilities,
    });
  };

  for (const st of metro?.stations ?? []) {
    if (st.lat == null || st.lng == null) continue;
    add({
      id: `${st.line}-${st.id}`,
      name: st.name,
      lat: st.lat,
      lng: st.lng,
      line: forecastCode(st.line),
      metroId: st.id,
      facilities: { lifts: st.lifts, escalators: st.escalators, wc: st.wc, masjid: st.masjid, babyRoom: st.babyRoom },
    });
  }
  for (const st of marmaray?.stations ?? []) {
    add({ id: `MR-${st.order}`, name: st.name, lat: st.lat, lng: st.lng, line: 'MARMARAY', marmarayOrder: st.order });
  }
  return merged;
}

/** Ordered stations of one line, as merged network stations (so transfers are known). */
export function lineStations(
  code: string,
  metro: MetroNetwork | undefined,
  marmaray: MarmarayStations | undefined,
  stations: NetworkStation[],
): NetworkStation[] {
  const find = (name: string, lat: number, lng: number) =>
    stations.find((s) => s.lines.includes(code) && normName(s.name) === normName(name) && distanceMeters(s, { lat, lng }) < 400);

  if (code === 'MARMARAY') {
    return (marmaray?.stations ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => find(s.name, s.lat, s.lng))
      .filter((s): s is NetworkStation => !!s);
  }
  const metroCode = code === 'M1' ? 'M1A' : code;
  // New stations can lack coordinates in Metro İstanbul's feed: keep them in the list (no map point).
  return (metro?.stations ?? [])
    .filter((s) => s.line === metroCode)
    .sort((a, b) => a.order - b.order)
    .map(
      (s): NetworkStation | undefined =>
        s.lat != null && s.lng != null
          ? find(s.name, s.lat, s.lng)
          : { id: `${s.line}-${s.id}`, name: s.name, lat: NaN, lng: NaN, lines: [code], metroIds: [s.id] },
    )
    .filter((s): s is NetworkStation => !!s);
}

interface Ridership {
  metro: Record<string, number>;
  marmaray: Record<string, number>;
}

/** Weekday entries at a station across all its lines (transfer stations add up). */
export function stationEntries(station: NetworkStation, ridership: Ridership | undefined): number | null {
  if (!ridership) return null;
  const values = [
    ...station.metroIds.map((id) => ridership.metro[id]),
    station.marmarayOrder != null ? ridership.marmaray[station.marmarayOrder] : undefined,
  ].filter((v): v is number => v != null);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

/** Weekday entries per station id for one line's own platforms (not the transfer lines'). */
export function lineEntries(
  code: string,
  stations: NetworkStation[],
  metro: MetroNetwork | undefined,
  ridership: Ridership | undefined,
): Map<string, number> | null {
  if (!ridership) return null;
  const own = new Set(code === 'M1' ? ['M1A', 'M1B'] : [code]);
  const lineOf = new Map((metro?.stations ?? []).map((s) => [s.id, s.line]));
  const out = new Map<string, number>();
  for (const st of stations) {
    const value =
      code === 'MARMARAY'
        ? st.marmarayOrder != null
          ? ridership.marmaray[st.marmarayOrder]
          : undefined
        : st.metroIds.filter((id) => own.has(lineOf.get(id) ?? '')).reduce<number | undefined>((sum, id) => {
            const v = ridership.metro[id];
            return v == null ? sum : (sum ?? 0) + v;
          }, undefined);
    if (value != null) out.set(st.id, value);
  }
  return out.size ? out : null;
}
