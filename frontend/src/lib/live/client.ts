'use client';
import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  BusLineDetail,
  BusLineInfo,
  BusNotice,
  BusVehicle,
  Fare,
  MetroNetwork,
  MetroStatus,
} from './types';

const MINUTE = 60_000;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

// Live data is an enhancement: every hook fails quietly (one retry) and the UI falls back.
const quiet = { retry: 1, refetchOnWindowFocus: false } as const;

export const useMetroNetwork = () =>
  useQuery({ queryKey: ['live', 'metro-network'], queryFn: () => get<MetroNetwork>('/api/live/metro/network'), staleTime: 6 * 60 * MINUTE, ...quiet });

export const useMetroStatus = () =>
  useQuery({
    queryKey: ['live', 'metro-status'],
    queryFn: () => get<MetroStatus>('/api/live/metro/status'),
    staleTime: 2 * MINUTE,
    refetchInterval: 2 * MINUTE,
    ...quiet,
  });

export const useFares = (enabled = true) =>
  useQuery({ queryKey: ['live', 'fares'], queryFn: () => get<Fare[]>('/api/live/fares'), staleTime: 24 * 60 * MINUTE, enabled, ...quiet });

/** Every line İETT currently runs (current names, fare tariff). */
export const useBusRegistry = () =>
  useQuery({ queryKey: ['live', 'bus-lines'], queryFn: () => get<BusLineInfo[]>('/api/live/bus/lines'), staleTime: 6 * 60 * MINUTE, ...quiet });

export const useBusLine = (code: string | null) =>
  useQuery({
    queryKey: ['live', 'bus-line', code],
    queryFn: () => get<BusLineDetail>(`/api/live/bus/${encodeURIComponent(code!)}`),
    enabled: !!code,
    staleTime: 6 * 60 * MINUTE,
    ...quiet,
  });

export const useBusVehicles = (code: string | null, enabled = true) =>
  useQuery({
    queryKey: ['live', 'bus-vehicles', code],
    queryFn: () => get<BusVehicle[]>(`/api/live/bus/${encodeURIComponent(code!)}/vehicles`),
    enabled: !!code && enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    ...quiet,
  });

/** Vehicles of several lines merged (Metrobüs runs as 34, 34AS, 34BZ… on the same road). */
export function useBusVehiclesMany(codes: string[]) {
  return useQueries({
    queries: codes.map((code) => ({
      queryKey: ['live', 'bus-vehicles', code],
      queryFn: () => get<BusVehicle[]>(`/api/live/bus/${encodeURIComponent(code)}/vehicles`),
      staleTime: 30_000,
      refetchInterval: 30_000,
      ...quiet,
    })),
    combine: (results) => ({
      data: results.some((r) => r.data) ? results.flatMap((r) => r.data ?? []) : undefined,
      dataUpdatedAt: Math.max(0, ...results.map((r) => r.dataUpdatedAt)),
    }),
  });
}

export const useBusNotices = () =>
  useQuery({ queryKey: ['live', 'bus-notices'], queryFn: () => get<BusNotice[]>('/api/live/bus/notices'), staleTime: 5 * MINUTE, ...quiet });

export interface StopIndexEntry {
  code: string;
  name: string;
  lat: number;
  lng: number;
  district: string;
  lines: { code: string; dir: 'G' | 'D' }[];
}

/** Static stop → lines index (scripts/build-bus-stops.mjs). ~280 KB gzipped, loaded on demand. */
export const useBusStops = (enabled = true) =>
  useQuery({
    queryKey: ['bus-stops'],
    queryFn: async () => {
      const raw = await get<{ stops: [string, string, number, number, string, string][] }>('/data/bus_stops.json');
      return raw.stops.map<StopIndexEntry>(([code, name, lat, lng, district, lines]) => ({
        code,
        name,
        lat,
        lng,
        district,
        lines: lines
          .split(' ')
          .filter(Boolean)
          .map((l) => {
            const [line, dir] = l.split(':');
            return { code: line, dir: dir === 'D' ? 'D' : 'G' };
          }),
      }));
    },
    enabled,
    staleTime: Infinity,
  });
