import 'server-only';
import { htmlToText, metroGet, metroPost, UpstreamError } from './upstream';
import type { EquipmentKind, EquipmentOutage, MetroDepartures, MetroLine, MetroLineFacts, MetroNetwork, MetroStatus } from './types';

interface RawLine {
  Name: string;
  LongDescription: string;
  ENDescription: string;
  Content: string;
  Color: { Color_R: string; Color_G: string; Color_B: string };
  FirstTime: string;
  LastTime: string;
  IsActive: boolean;
}

interface RawStation {
  Id: number;
  LineId: number;
  LineName: string;
  Description: string;
  Order: number;
  DetailInfo: {
    Escolator: number;
    Lift: number;
    BabyRoom: boolean;
    WC: boolean;
    Masjid: boolean;
    Latitude: string;
    Longitude: string;
  } | null;
}

const hex = (c: RawLine['Color']) =>
  `#${[c.Color_R, c.Color_G, c.Color_B].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const num = (s: string | undefined) => {
  if (!s) return null;
  const m = /[\d.,]+/.exec(s);
  if (!m) return null;
  // Turkish formatting: "500.000" thousands, "33,5" decimals.
  const v = Number(m[0].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** Pulls the "İşletme Bilgileri" key/value block out of a line's CMS content. */
export function parseFacts(content: string): MetroLineFacts {
  const text = htmlToText(content);
  const start = text.indexOf('İşletme Bilgileri');
  const facts: MetroLineFacts = {
    lengthKm: null,
    stations: null,
    vehicles: null,
    tripMinutes: null,
    dailyRiders: null,
    dailyTrips: null,
    headway: [],
  };
  if (start < 0) return facts;
  for (const raw of text.slice(start).split('\n').slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep < 0) break; // next heading
    const key = line.slice(0, sep).trim().toLocaleLowerCase('tr-TR');
    const value = line.slice(sep + 1).trim();
    if (key.startsWith('hat uzunluğu')) facts.lengthKm = num(value);
    else if (key.startsWith('istasyon sayısı')) facts.stations = num(value);
    else if (key.startsWith('araç sayısı')) facts.vehicles = num(value);
    else if (key.startsWith('sefer süresi')) facts.tripMinutes = num(value);
    else if (key.startsWith('günlük yolcu')) facts.dailyRiders = num(value);
    else if (key.startsWith('günlük sefer')) facts.dailyTrips = num(value);
    else if (key.startsWith('sefer sıklığı') && value) facts.headway.push(value);
  }
  return facts;
}

export async function getMetroNetwork(): Promise<MetroNetwork> {
  const [lines, stations] = await Promise.all([
    metroGet<RawLine[]>('GetLines', 86_400),
    metroGet<RawStation[]>('GetStations', 86_400),
  ]);
  return {
    lines: lines
      .filter((l) => l.IsActive !== false)
      .map<MetroLine>((l) => ({
        code: l.Name,
        name: l.LongDescription,
        nameEn: l.ENDescription,
        color: hex(l.Color),
        firstTime: l.FirstTime,
        lastTime: l.LastTime,
        facts: parseFacts(l.Content),
      })),
    stations: stations.map((s) => {
      const lat = Number(s.DetailInfo?.Latitude);
      const lng = Number(s.DetailInfo?.Longitude);
      return {
        id: s.Id,
        line: s.LineName,
        name: s.Description,
        order: s.Order,
        lat: Number.isFinite(lat) && lat > 0 ? lat : null,
        lng: Number.isFinite(lng) && lng > 0 ? lng : null,
        lifts: s.DetailInfo?.Lift ?? 0,
        escalators: s.DetailInfo?.Escolator ?? 0,
        wc: !!s.DetailInfo?.WC,
        masjid: !!s.DetailInfo?.Masjid,
        babyRoom: !!s.DetailInfo?.BabyRoom,
      };
    }),
    fetchedAt: new Date().toISOString(),
  };
}

const GROUPS: Record<string, EquipmentKind> = {
  Asansör: 'lift',
  'Yürüyen Merdiven': 'escalator',
  'Yürüyen Bant': 'walkway',
};

interface RawEquipment {
  Group: string;
  LineName: string;
  StationId: number;
  StationName: string;
  Type: string;
  Date: string | null;
}

/** Disruptions, announcements and lift/escalator outages. Each part degrades independently. */
export async function getMetroStatus(): Promise<MetroStatus> {
  const [statuses, announcements, totals, ...details] = await Promise.allSettled([
    metroGet<{ LineName: string; Description: string; IsActive: boolean; UpdateDate: string }[]>('GetServiceStatuses', 120),
    metroGet<{ Id: number; Title: string; Content: string; StartDate: string }[]>('GetAnnouncements/tr', 600),
    metroGet<{ EquipmentServiceStatus: { GroupName: string; Active: number; Inactive: number }[] }[]>('GetFaultyEquipments', 300),
    ...Object.keys(GROUPS).map((group) =>
      metroPost<{ Equipments: RawEquipment[] }[]>('GetFaultyEquipmentDetails', { EquipmentGroupName: group }, 300),
    ),
  ]);

  if (statuses.status === 'rejected' && announcements.status === 'rejected' && totals.status === 'rejected') {
    throw statuses.reason;
  }

  const outages: EquipmentOutage[] = details.flatMap((d) =>
    d.status === 'fulfilled'
      ? (d.value[0]?.Equipments ?? [])
          .filter((e) => GROUPS[e.Group])
          .map((e) => ({
            kind: GROUPS[e.Group],
            line: e.LineName,
            stationId: e.StationId,
            station: e.StationName,
            since: e.Date,
            type: e.Type,
          }))
      : [],
  );

  return {
    disruptions:
      statuses.status === 'fulfilled'
        ? statuses.value
            .filter((s) => s.IsActive && s.Description)
            .map((s) => ({ line: s.LineName, message: htmlToText(s.Description), updatedAt: s.UpdateDate }))
        : [],
    announcements:
      announcements.status === 'fulfilled'
        ? announcements.value.map((a) => ({
            id: a.Id,
            title: htmlToText(a.Title),
            body: htmlToText(a.Content),
            date: a.StartDate,
          }))
        : [],
    equipment:
      totals.status === 'fulfilled'
        ? {
            totals: (totals.value[0]?.EquipmentServiceStatus ?? [])
              .filter((t) => GROUPS[t.GroupName])
              .map((t) => ({ kind: GROUPS[t.GroupName], working: t.Active, broken: t.Inactive })),
            outages,
          }
        : null,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getFares() {
  const raw = await metroGet<{ Type: string; TicketPrices: { Name: string; Price: string }[] }[]>('GetTicketPrice/TR', 86_400);
  return raw.map((f) => ({ card: f.Type, items: f.TicketPrices.map((p) => ({ name: p.Name, price: p.Price })) }));
}

interface RawDirection {
  DirectionId: number;
  DirectionName: string; // "Yenikapı->Hacıosman"
}

interface RawTimetable {
  LastStation: string | null;
  TimeInfos: { Times: string[] } | null;
}

/**
 * Today's departures from one station, per direction (Metro İstanbul GetTimeTable). Times are
 * the full service day in order; trips after midnight come last ("00:06").
 */
export async function getMetroDepartures(stationId: number): Promise<MetroDepartures> {
  const stations = await metroGet<RawStation[]>('GetStations', 86_400);
  const station = stations.find((s) => s.Id === stationId);
  if (!station) throw new UpstreamError(`metro station ${stationId} not found`);
  const directions = await metroPost<RawDirection[]>(
    'GetDirectionsByLineIdAndStationId',
    { LineId: station.LineId, StationId: stationId },
    86_400,
  );
  const timetables = await Promise.all(
    directions.map((d) =>
      metroPost<RawTimetable[] | null>('GetTimeTable', { BoardingStationId: stationId, DirectionId: d.DirectionId }, 3_600)
        .then((t) => ({ d, t: t?.[0] ?? null }))
        .catch(() => ({ d, t: null })),
    ),
  );
  return {
    stationId,
    line: station.LineName,
    directions: timetables
      .map(({ d, t }) => ({
        id: d.DirectionId,
        towards: t?.LastStation?.trim() || d.DirectionName.split('->').pop()!.trim(),
        times: t?.TimeInfos?.Times ?? [],
      }))
      // At a terminus the direction ending here has no departures.
      .filter((d) => d.times.length),
  };
}
