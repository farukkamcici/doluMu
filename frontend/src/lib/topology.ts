export interface TopologyStation {
  id: number;
  name: string;
  description: string;
  order: number;
  coordinates: { lat: number; lng: number };
  accessibility?: Record<string, boolean>;
  directions?: { id: number; name: string }[];
}

export interface TopologyLine {
  id: number;
  name: string;
  description: string;
  description_en?: string;
  color: string;
  first_time: string;
  last_time: string;
  is_active: boolean;
  stations: TopologyStation[];
}

export interface Topology {
  lines: Record<string, TopologyLine>;
}

export async function fetchTopology(): Promise<Topology> {
  const res = await fetch('/data/metro_topology.json');
  if (!res.ok) throw new Error(`topology ${res.status}`);
  return res.json();
}

/** The forecast API knows "M1"; the topology splits it into M1A/M1B. */
export function topologyLine(topology: Topology | undefined, code: string): TopologyLine | null {
  if (!topology) return null;
  return topology.lines[code] ?? (code === 'M1' ? topology.lines.M1A ?? null : null);
}
