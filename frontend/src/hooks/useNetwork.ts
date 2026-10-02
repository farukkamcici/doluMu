'use client';
import { useMemo } from 'react';
import { buildNetworkLines, buildNetworkStations } from '@/lib/network';
import { useMarmarayStations, useRoute, useTopology } from '@/lib/queries';

/** Rail network + Metrobüs geometry and merged stations, from static files and the route API. */
export function useNetwork() {
  const topology = useTopology();
  const marmaray = useMarmarayStations();
  const metrobus = useRoute('34');

  const lines = useMemo(
    () => buildNetworkLines(topology.data, marmaray.data, metrobus.data),
    [topology.data, marmaray.data, metrobus.data],
  );
  const stations = useMemo(() => buildNetworkStations(topology.data, marmaray.data), [topology.data, marmaray.data]);

  return { lines, stations, topology: topology.data, loading: topology.isLoading || marmaray.isLoading };
}
