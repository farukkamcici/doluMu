'use client';
import { useMemo } from 'react';
import { buildNetworkLines, buildNetworkStations, topologyToNetwork } from '@/lib/network';
import { useMarmarayStations, useRoute, useTopology } from '@/lib/queries';
import { useMetroNetwork } from '@/lib/live/client';

/**
 * Rail network + Metrobüs geometry and merged stations. Metro İstanbul's live station list is
 * the source (it has new stations and facility counts); the bundled snapshot is the fallback.
 */
export function useNetwork() {
  const live = useMetroNetwork();
  const topology = useTopology(live.isError);
  const marmaray = useMarmarayStations();
  const metrobus = useRoute('34');

  const metro = useMemo(
    () => live.data ?? (topology.data ? topologyToNetwork(topology.data) : undefined),
    [live.data, topology.data],
  );
  const lines = useMemo(() => buildNetworkLines(metro, marmaray.data, metrobus.data), [metro, marmaray.data, metrobus.data]);
  const stations = useMemo(() => buildNetworkStations(metro, marmaray.data), [metro, marmaray.data]);

  return {
    lines,
    stations,
    metro,
    marmaray: marmaray.data,
    loading: (live.isLoading || topology.isLoading) && !metro,
  };
}
