'use client';
import { useLocale } from 'next-intl';
import type { LineSummary } from '@/lib/api';
import { isMetroTopologyLine, routeLabel } from '@/lib/lines';
import { useLine, useTopology } from '@/lib/queries';
import { topologyLine } from '@/lib/topology';

/**
 * Display name for a line: the official Metro İstanbul name for rail lines (the API's
 * names can be outdated, e.g. M4 "KADIKOY - KARTAL"), otherwise the API route name.
 */
export function useLineName(code: string, meta: Pick<LineSummary, 'line'> | null | undefined): string {
  const locale = useLocale();
  const topology = useTopology(isMetroTopologyLine(code) || code === 'M1');
  const topo = topologyLine(topology.data, code);
  const official = locale === 'en' ? topo?.description_en || topo?.description : topo?.description;
  return (official && stripLineSuffix(official)) || routeLabel(meta);
}

// The mode is shown next to the name, so "… Metro Hattı" / "… Tram Line" is redundant.
const SUFFIX = /\s+(metro|tramvay|füniküler|teleferik)\s+hattı$|\s+(metro|tram|funicular)\s+line$|\s+aerial cable car line$/i;
const stripLineSuffix = (name: string) => name.replace(SUFFIX, '').trim();

/** Same as useLineName, fetching line metadata only when the topology can't name the line. */
export function useLineDisplayName(code: string): string {
  const needsMeta = !(isMetroTopologyLine(code) || code === 'M1');
  const meta = useLine(needsMeta ? code : null);
  return useLineName(code, meta.data);
}
