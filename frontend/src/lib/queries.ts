'use client';
import { useQueries, useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError, type Direction } from './api';
import { fetchTopology } from './topology';
import { fetchMarmaray } from './network';
import { normalizeQuery } from './lines';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Don't retry "not found" style errors; retry transient ones once.
const retry = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1;

export function useLineSearch(query: string) {
  const q = normalizeQuery(query);
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => api.searchLines(q),
    enabled: q.length >= 1,
    staleTime: HOUR,
    placeholderData: keepPreviousData,
    retry,
  });
}

export function useLine(code: string | null) {
  return useQuery({
    queryKey: ['line', code],
    queryFn: () => api.getLine(code!),
    enabled: !!code,
    staleTime: 24 * HOUR,
    retry,
  });
}

export function useForecast(code: string | null, date: string, direction?: Direction | null) {
  return useQuery({
    queryKey: ['forecast', code, date, direction ?? null],
    queryFn: () => api.getForecast(code!, date, direction),
    enabled: !!code,
    staleTime: 30 * MINUTE,
    placeholderData: keepPreviousData,
    retry,
  });
}

export function useLineStatus(code: string | null, direction?: Direction | null) {
  return useQuery({
    queryKey: ['status', code, direction ?? null],
    queryFn: () => api.getStatus(code!, direction),
    enabled: !!code,
    staleTime: 5 * MINUTE,
    refetchInterval: 5 * MINUTE,
    retry,
  });
}

export function useSchedule(code: string | null, enabled = true) {
  return useQuery({
    queryKey: ['schedule', code],
    queryFn: () => api.getSchedule(code!),
    enabled: !!code && enabled,
    staleTime: HOUR,
    retry,
  });
}

/** Last two weeks of a bus line's punctuality and running times (backend, from İETT's archive). */
export function useBusHistory(code: string | null, enabled = true) {
  return useQuery({
    queryKey: ['bus-history', code],
    queryFn: () => api.getBusHistory(code!),
    enabled: !!code && enabled,
    staleTime: HOUR,
    retry,
  });
}

export function useCapacity(code: string | null, enabled = true) {
  return useQuery({
    queryKey: ['capacity', code],
    queryFn: () => api.getCapacity(code!),
    enabled: !!code && enabled,
    staleTime: 24 * HOUR,
    retry,
  });
}

export function useTraffic() {
  return useQuery({
    queryKey: ['traffic'],
    queryFn: api.getTraffic,
    staleTime: 5 * MINUTE,
    refetchInterval: 5 * MINUTE,
    retry,
  });
}

export function useNowcast() {
  return useQuery({
    queryKey: ['nowcast'],
    queryFn: api.getNowcast,
    staleTime: 15 * MINUTE,
    retry,
  });
}

export function useTopology(enabled = true) {
  return useQuery({
    queryKey: ['topology'],
    queryFn: fetchTopology,
    enabled,
    staleTime: Infinity,
  });
}

export function useMarmarayStations(enabled = true) {
  return useQuery({
    queryKey: ['marmaray-stations'],
    queryFn: fetchMarmaray,
    enabled,
    staleTime: Infinity,
  });
}

/** Today's forecasts for many lines at once (network board and map). */
export function useForecasts(codes: string[], date: string) {
  return useQueries({
    queries: codes.map((code) => ({
      queryKey: ['forecast', code, date, null],
      queryFn: () => api.getForecast(code, date),
      staleTime: 30 * MINUTE,
      retry,
    })),
  });
}
