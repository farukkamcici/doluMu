// Rebuilds public/data/metro_topology.json from Metro İstanbul's live API: lines, stations (order,
// coordinates, facilities) and each station's direction ids. The backend enumerates timetable
// pairs (station × direction) from this file, so stale direction ids break timetables (M5 and M7
// did after line changes). Usage: node scripts/build-metro-topology.mjs   (~250 requests, <1 min)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = 'https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'metro_topology.json');

async function call(op, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}/${op}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      const json = await res.json();
      if (!json.Success) throw new Error(json.Error?.Message ?? `${op} failed`);
      return json.Data;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const hex = (c) => `#${[c.Color_R, c.Color_G, c.Color_B].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
const coord = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const [lines, stations] = await Promise.all([call('GetLines'), call('GetStations')]);
const previous = JSON.parse(readFileSync(OUT, 'utf8'));

const out = { metadata: {}, lines: {} };
let missingDirections = 0;
for (const line of lines.filter((l) => l.IsActive !== false).sort((a, b) => a.Order - b.Order)) {
  const own = stations.filter((s) => s.LineId === line.Id && s.IsActive !== false).sort((a, b) => a.Order - b.Order);
  const built = [];
  for (const s of own) {
    let directions = [];
    try {
      const raw = (await call('GetDirectionsByLineIdAndStationId', { LineId: line.Id, StationId: s.Id })) ?? [];
      directions = raw.map((d) => ({ id: d.DirectionId, name: d.DirectionName }));
    } catch {
      // Keep what we knew rather than dropping the station's timetables.
      directions = previous.lines?.[line.Name]?.stations?.find((p) => p.id === s.Id)?.directions ?? [];
      missingDirections++;
    }
    const lat = coord(s.DetailInfo?.Latitude);
    const lng = coord(s.DetailInfo?.Longitude);
    built.push({
      id: s.Id,
      name: s.Name,
      description: s.Description,
      order: s.Order,
      coordinates: lat && lng ? { lat, lng } : null,
      accessibility: {
        elevator: (s.DetailInfo?.Lift ?? 0) > 0,
        escalator: (s.DetailInfo?.Escolator ?? 0) > 0,
        wc: !!s.DetailInfo?.WC,
        babyRoom: !!s.DetailInfo?.BabyRoom,
        masjid: !!s.DetailInfo?.Masjid,
      },
      directions,
    });
  }
  out.lines[line.Name] = {
    id: line.Id,
    name: line.Name,
    description: line.LongDescription,
    description_en: line.ENDescription || line.LongDescription,
    color: hex(line.Color),
    first_time: line.FirstTime,
    last_time: line.LastTime,
    is_active: true,
    stations: built,
  };
}

const total = Object.values(out.lines).reduce((n, l) => n + l.stations.length, 0);
out.metadata = {
  generated_at: new Date().toISOString(),
  source: 'Metro İstanbul MetroMobile V2 (GetLines, GetStations, GetDirectionsByLineIdAndStationId)',
  total_lines: Object.keys(out.lines).length,
  total_stations: total,
};
console.log(`${out.metadata.total_lines} lines, ${total} stations, ${missingDirections} stations kept previous directions`);
// Sanity floor so an outage never replaces good data (CI refreshes this monthly).
if (out.metadata.total_lines < 15 || total < 200) throw new Error('topology looks incomplete; keeping the previous file');
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${OUT}`);
