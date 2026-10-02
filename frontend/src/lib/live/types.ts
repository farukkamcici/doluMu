// Shapes returned by our /api/live/* routes (shared by route handlers and client hooks).

export interface MetroLineFacts {
  lengthKm: number | null;
  stations: number | null;
  vehicles: number | null;
  tripMinutes: number | null;
  dailyRiders: number | null;
  dailyTrips: number | null;
  /** Free text from Metro İstanbul, e.g. "4 Dakika (Pik Saatte)". */
  headway: string[];
}

export interface MetroLine {
  code: string;
  name: string;
  nameEn: string;
  color: string;
  firstTime: string;
  lastTime: string;
  facts: MetroLineFacts;
}

export interface MetroStation {
  id: number;
  line: string;
  name: string;
  order: number;
  lat: number | null;
  lng: number | null;
  lifts: number;
  escalators: number;
  wc: boolean;
  masjid: boolean;
  babyRoom: boolean;
}

export interface MetroNetwork {
  lines: MetroLine[];
  stations: MetroStation[];
  fetchedAt: string;
}

export type EquipmentKind = 'lift' | 'escalator' | 'walkway';

export interface EquipmentOutage {
  kind: EquipmentKind;
  line: string;
  stationId: number;
  station: string;
  since: string | null;
  /** "Arıza" (fault) or "Çalıştırılmıyor" (switched off) etc. */
  type: string;
}

export interface MetroStatus {
  /** Lines with a live service notice (disruption, partial closure…). */
  disruptions: { line: string; message: string; updatedAt: string | null }[];
  announcements: { id: number; title: string; body: string; date: string | null }[];
  equipment: {
    totals: { kind: EquipmentKind; working: number; broken: number }[];
    outages: EquipmentOutage[];
  } | null;
  fetchedAt: string;
}

export interface Fare {
  card: string;
  items: { name: string; price: string }[];
}

export interface BusLineInfo {
  code: string;
  name: string;
  /** e.g. "2 BİLETLİ" for long lines charged two fares. */
  tariff: string | null;
  lengthKm: number | null;
}

export interface BusStop {
  code: string;
  name: string;
  lat: number;
  lng: number;
  district: string | null;
}

export interface BusDirection {
  /** Destination as İETT names it, e.g. "4.LEVENT METRO". */
  name: string;
  stops: BusStop[];
}

export interface BusLineDetail {
  info: BusLineInfo | null;
  directions: Partial<Record<'G' | 'D', BusDirection>>;
}

export interface BusVehicle {
  id: string;
  /** İETT route variant code, e.g. "19_G_D1610" (see public/data/bus_routes). */
  route: string | null;
  lat: number;
  lng: number;
  direction: 'G' | 'D' | null;
  destination: string;
  nearStop: string | null;
  at: string;
}

export interface BusNotice {
  line: string;
  message: string;
  time: string | null;
}

export interface LineReliability {
  /** Duties (trips) İETT recorded for the line on `date`. */
  trips: number;
  completed: number;
  cancelled: number;
  /** Median minutes between planned and actual departure from the first stop. */
  medianDelayMin: number | null;
  /** Share of departures within 3 minutes of plan. */
  onTimeShare: number | null;
}

export interface BusReliability {
  date: string;
  lines: Record<string, LineReliability>;
}

export interface BusRidership {
  date: string;
  /** Top lines by journeys that day (İETT publishes the top 50). */
  lines: Record<string, number>;
}

export interface ParkingLot {
  id: number;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  empty: number;
  type: string;
  hours: string;
}
