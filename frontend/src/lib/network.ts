import type { RouteShape } from './api';
import { RAIL_COLORS } from './lines';
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
  coords: [number, number][]; // [lng, lat]
}

export interface NetworkStation {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** Line codes calling here (transfer stations merged). */
  lines: string[];
  accessibility?: Record<string, boolean>;
}

export interface MarmarayStations {
  stations: { order: number; name: string; lat: number; lng: number }[];
}

export async function fetchMarmaray(): Promise<MarmarayStations> {
  const res = await fetch('/data/marmaray_stations.json');
  if (!res.ok) throw new Error(`marmaray ${res.status}`);
  return res.json();
}

const forecastCode = (topologyCode: string) => (topologyCode === 'M1A' || topologyCode === 'M1B' ? 'M1' : topologyCode);

export function buildNetworkLines(
  topology: Topology | undefined,
  marmaray: MarmarayStations | undefined,
  metrobus: RouteShape | undefined,
): NetworkLine[] {
  const out: NetworkLine[] = [];
  for (const [code, line] of Object.entries(topology?.lines ?? {})) {
    const coords = [...line.stations]
      .sort((a, b) => a.order - b.order)
      .filter((s) => s.coordinates?.lat && s.coordinates?.lng)
      .map((s) => [s.coordinates.lng, s.coordinates.lat] as [number, number]);
    if (coords.length > 1) {
      out.push({ code: forecastCode(code), id: code, color: RAIL_COLORS[code] ?? line.color, style: 'metro', coords });
    }
  }
  if (marmaray?.stations.length) {
    out.push({
      code: 'MARMARAY',
      id: 'MARMARAY',
      color: null,
      style: 'railway',
      coords: [...marmaray.stations].sort((a, b) => a.order - b.order).map((s) => [s.lng, s.lat]),
    });
  }
  const brt = metrobus?.G?.length ? metrobus.G : metrobus?.D;
  if (brt?.length) {
    out.push({ code: '34', id: '34', color: null, style: 'brt', coords: brt.map(([lat, lng]) => [lng, lat]) });
  }
  // Wide Metrobüs/Marmaray strokes go underneath so metro lines stay visible on top.
  return [...out.filter((l) => l.style !== 'metro'), ...out.filter((l) => l.style === 'metro')];
}

const norm = (name: string) =>
  name
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]/g, '');

/** Metres between two points (equirectangular is plenty at city scale). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** Stations of all rail lines, with same-name stations within 400 m merged into transfers. */
export function buildNetworkStations(
  topology: Topology | undefined,
  marmaray: MarmarayStations | undefined,
): NetworkStation[] {
  const merged: NetworkStation[] = [];
  const add = (s: Omit<NetworkStation, 'lines'> & { line: string }) => {
    const match = merged.find((m) => norm(m.name) === norm(s.name) && distanceMeters(m, s) < 400);
    if (match) {
      if (!match.lines.includes(s.line)) match.lines.push(s.line);
      match.accessibility ??= s.accessibility;
      return;
    }
    merged.push({ id: s.id, name: s.name, lng: s.lng, lat: s.lat, lines: [s.line], accessibility: s.accessibility });
  };

  for (const [code, line] of Object.entries(topology?.lines ?? {})) {
    for (const st of line.stations) {
      if (!st.coordinates?.lat) continue;
      add({
        id: `${code}-${st.id}`,
        name: st.description || st.name,
        lat: st.coordinates.lat,
        lng: st.coordinates.lng,
        line: forecastCode(code),
        accessibility: st.accessibility,
      });
    }
  }
  for (const st of marmaray?.stations ?? []) {
    add({ id: `MR-${st.order}`, name: st.name, lat: st.lat, lng: st.lng, line: 'MARMARAY' });
  }
  return merged;
}

/** Ordered stations of one line, as the merged network stations (so transfers are known). */
export function lineStations(
  code: string,
  topology: Topology | undefined,
  marmaray: MarmarayStations | undefined,
  stations: NetworkStation[],
): NetworkStation[] {
  const find = (name: string, lat: number, lng: number) =>
    stations.find((s) => s.lines.includes(code) && norm(s.name) === norm(name) && distanceMeters(s, { lat, lng }) < 400);

  if (code === 'MARMARAY') {
    return (marmaray?.stations ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => find(s.name, s.lat, s.lng))
      .filter((s): s is NetworkStation => !!s);
  }
  const topo = topology?.lines[code] ?? (code === 'M1' ? topology?.lines.M1A : undefined);
  return (topo?.stations ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.coordinates?.lat)
    .map((s) => find(s.description || s.name, s.coordinates.lat, s.coordinates.lng))
    .filter((s): s is NetworkStation => !!s);
}
