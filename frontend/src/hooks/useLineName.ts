'use client';
import { useLocale } from 'next-intl';
import type { LineSummary } from '@/lib/api';
import { isMetroTopologyLine, routeLabel } from '@/lib/lines';
import { useLine, useTopology } from '@/lib/queries';
import { useBusRegistry, useMetroNetwork } from '@/lib/live/client';
import { topologyLine } from '@/lib/topology';

// The mode is shown next to the name, so "… Metro Hattı" / "… Tram Line" is redundant.
const SUFFIX = /\s+(metro|tramvay|füniküler|teleferik)\s+hattı$|\s+(metro|tram|funicular)\s+line$|\s+aerial cable car line$/i;
const stripLineSuffix = (name: string) => name.replace(SUFFIX, '').trim();

/**
 * Display name for a line. Rail: Metro İstanbul's official name. Bus: İETT's current name (the
 * forecast database's names date from 2022–24 and some routes have changed since). Otherwise the
 * API route name.
 */
export function useLineName(code: string, meta: Pick<LineSummary, 'line'> | null | undefined): string {
  const locale = useLocale();
  const rail = isMetroTopologyLine(code) || code === 'M1';
  // Cheap lookups only: this runs in every board and search row.
  const metro = useMetroNetwork();
  const topology = useTopology(rail && metro.isError);
  const registry = useBusRegistry();
  if (rail) {
    const live = metro.data?.lines.find((l) => l.code === (code === 'M1' ? 'M1A' : code));
    const snap = topologyLine(topology.data, code);
    const official = live
      ? locale === 'en' ? live.nameEn || live.name : live.name
      : locale === 'en' ? snap?.description_en || snap?.description : snap?.description;
    if (official) return stripLineSuffix(official);
  } else {
    const live = registry.data?.find((l) => l.code === code);
    if (live) return routeLabel({ line: live.name });
  }
  return routeLabel(meta);
}

/** Same as useLineName, fetching line metadata only when no live source can name the line. */
export function useLineDisplayName(code: string): string {
  const needsMeta = !(isMetroTopologyLine(code) || code === 'M1');
  const meta = useLine(needsMeta ? code : null);
  return useLineName(code, meta.data);
}
