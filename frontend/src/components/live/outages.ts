'use client';
import { useMemo } from 'react';
import { useMetroStatus } from '@/lib/live/client';
import type { EquipmentOutage } from '@/lib/live/types';

/** Live lift/escalator outages keyed by Metro İstanbul station id. */
export function useOutagesByStation() {
  const status = useMetroStatus();
  return useMemo(() => {
    const map = new Map<number, EquipmentOutage[]>();
    for (const o of status.data?.equipment?.outages ?? []) {
      map.set(o.stationId, [...(map.get(o.stationId) ?? []), o]);
    }
    return map;
  }, [status.data]);
}

/** Live disruption notices for a forecast line code (M1 covers M1A and M1B). */
export function useLineDisruptions(code: string) {
  const status = useMetroStatus();
  return useMemo(() => {
    const codes = code === 'M1' ? ['M1', 'M1A', 'M1B'] : [code];
    return (status.data?.disruptions ?? []).filter((d) => codes.includes(d.line));
  }, [status.data, code]);
}

export const disruptedCodes = (lines: string[]) =>
  [...new Set(lines.map((l) => (l === 'M1A' || l === 'M1B' ? 'M1' : l)))];
