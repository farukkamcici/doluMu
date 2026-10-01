export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://ibb-transport.onthewifi.com/api';

export type TransportTypeId = 1 | 2 | 3;
export type Direction = 'G' | 'D';

export interface LineSummary {
  line_name: string;
  transport_type_id: TransportTypeId;
  road_type: string;
  line: string;
}

export interface SearchResult extends LineSummary {
  relevance_score: number;
}

export interface HourlyForecast {
  hour: number;
  predicted_value: number | null;
  occupancy_pct: number | null;
  crowd_level: string;
  max_capacity: number;
  in_service: boolean;
  trips_per_hour: number | null;
  vehicle_capacity: number | null;
}

export interface LineStatus {
  status: 'ACTIVE' | 'WARNING' | 'OUT_OF_SERVICE';
  alerts: { text: string; time: string; type: string }[];
  next_service_time: string | null;
}

export interface BusSchedule {
  G?: string[];
  D?: string[];
  meta?: Partial<Record<Direction, { start: string; end: string }>>;
  has_service_today?: boolean;
  data_status?: string;
}

export type RouteShape = Partial<Record<Direction, [number, number][]>>;

export interface CapacityMeta {
  line_code: string;
  expected_capacity_weighted_int: number | null;
  capacity_min: number | null;
  capacity_max: number | null;
  confidence: string | null;
  notes: string | null;
}

export interface TrafficIndex {
  percent: number;
  source: string;
  updatedAt: string;
}

export interface NowcastHour {
  temperature_2m: number;
  weather_code: number;
  precipitation: number;
  time: string;
}

export interface ReportPayload {
  report_type: 'bug' | 'data' | 'feature';
  description: string;
  line_code?: string;
  contact_email?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined | null>;

async function request<T>(path: string, query?: Query, init?: RequestInit): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

const seg = encodeURIComponent;

export const api = {
  searchLines: (query: string) => request<SearchResult[]>('/lines/search', { query }),
  getLine: (code: string) => request<LineSummary>(`/lines/${seg(code)}`),
  getForecast: (code: string, date: string, direction?: Direction | null) =>
    request<HourlyForecast[]>(`/forecast/${seg(code)}`, { target_date: date, direction }),
  getStatus: (code: string, direction?: Direction | null) =>
    request<LineStatus>(`/lines/${seg(code)}/status`, { direction }),
  getSchedule: (code: string) => request<BusSchedule>(`/lines/${seg(code)}/schedule`),
  getRoute: (code: string) => request<RouteShape>(`/lines/${seg(code)}/route`),
  getCapacity: (code: string) => request<CapacityMeta>(`/capacity/${seg(code)}`),
  getTraffic: () => request<TrafficIndex>('/traffic/istanbul'),
  getNowcast: () => request<Record<string, NowcastHour>>('/nowcast'),
  submitReport: (payload: ReportPayload) =>
    request<unknown>('/reports', undefined, { method: 'POST', body: JSON.stringify(payload) }),
};
