// Builds public/data/rail_ridership.json: average weekday entries per rail station, from İBB's
// "Raylı Sistemler İstasyon Bazlı Yolcu ve Yolculuk Sayıları" (daily taps per station entrance).
// Entrances ("Şişli 2 Kuzey", "Yenikapı Güney") are matched to Metro İstanbul stations (and
// Marmaray stations) on the same line by distance.
// Usage: node scripts/build-rail-ridership.mjs   (downloads the newest year, ~15 MB)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'rail_ridership.json');
const PACKAGE = 'https://data.ibb.gov.tr/api/3/action/package_show?id=rayli-sistemler-istasyon-bazli-yolcu-ve-yolculuk-sayilari';
const METRO = 'https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetStations';
const MAX_MATCH_M = 700;

const get = async (url, timeout = 300_000) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
};

// Newest yearly resource.
const pkg = (await (await get(PACKAGE)).json()).result;
const resource = pkg.resources
  .map((r) => ({ r, year: Number(/(20\d\d)/.exec(r.name)?.[1]) }))
  .filter((x) => x.year)
  .sort((a, b) => b.year - a.year)[0];
console.log(`source: ${resource.r.name}`);
const csv = (await (await get(resource.r.url)).text()).replace(/^﻿/, '');

const metroRaw = await (await get(METRO, 60_000)).json();
const metroStations = (metroRaw.Data ?? metroRaw)
  .map((s) => ({ id: s.Id, line: s.LineName, name: s.Description, lat: Number(s.DetailInfo?.Latitude), lng: Number(s.DetailInfo?.Longitude) }));
const marmaray = JSON.parse(readFileSync(path.join(ROOT, 'public', 'data', 'marmaray_stations.json'), 'utf8')).stations;

/** Locale-mangled coordinates: "289.920.277.777.778" → 28.9920277777778. */
const coord = (raw) => {
  const digits = String(raw).replace(/[^0-9]/g, '');
  return digits.length > 2 ? Number(`${digits.slice(0, 2)}.${digits.slice(2)}`) : NaN;
};

const metres = (a, b) => {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
};

const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
/** "MECİDİYEKÖY BATI", "Şişli 2 Kuzey", "MAHMUTBEY M7 HOL 2" → "mecidiyekoy", "sisli", "mahmutbey". */
const fold = (name) =>
  String(name)
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => TR[c])
    .replace(/\b(kuzey|guney|dogu|bati|hol|giris|cikis|m\d+|\d+)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');

/** Dataset line label → candidate stations. */
function candidates(label) {
  if (/^TCDD TA[SŞ]IMACILIK/i.test(label)) return marmaray.map((s) => ({ key: `MR:${s.order}`, name: fold(s.name), lat: s.lat, lng: s.lng }));
  const code = /^(M\d+|T\d+|TF\d+|F\d+)\b/.exec(label)?.[1];
  if (!code) return [];
  const lines = code === 'M1' ? ['M1A', 'M1B'] : [code];
  return metroStations.filter((s) => lines.includes(s.line)).map((s) => ({ key: String(s.id), name: fold(s.name), lat: s.lat, lng: s.lng }));
}

/** Same name first (coordinates are often missing or mangled), then the nearest station. */
function match(label, entrance, at) {
  const list = candidates(label);
  const name = fold(entrance);
  if (name.length >= 4) {
    const byName = list.filter((c) => c.name.startsWith(name) || name.startsWith(c.name));
    if (byName.length) {
      const near = byName.filter((c) => Number.isFinite(at.lat) && c.lat > 0).sort((a, b) => metres(at, a) - metres(at, b))[0];
      return (near ?? byName.sort((a, b) => Math.abs(a.name.length - name.length) - Math.abs(b.name.length - name.length))[0]).key;
    }
  }
  let best = null;
  for (const c of list) {
    const d = c.lat > 0 ? metres(at, c) : Infinity;
    if (d < MAX_MATCH_M && (!best || d < best.d)) best = { key: c.key, d };
  }
  return best?.key ?? null;
}

const [header, ...rows] = csv.trim().split(/\r?\n/);
const cols = header.split(';');
const col = (name) => cols.indexOf(name);
const [cY, cM, cD, cLine, cName, cLng, cLat, cTaps] = [
  'transaction_year', 'transaction_month', 'transaction_day', 'line', 'station_name', 'longitude', 'latitude', 'passage_cnt',
].map(col);

const entranceKey = new Map(); // "line|entrance" → station key (or null)
const perDay = new Map(); // station key → Map(date → taps)
let unmatched = 0;
for (const row of rows) {
  const f = row.split(';');
  const date = new Date(Date.UTC(+f[cY], +f[cM] - 1, +f[cD]));
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) continue;
  const id = `${f[cLine]}|${f[cName]}`;
  if (!entranceKey.has(id)) {
    const at = { lat: coord(f[cLat]), lng: coord(f[cLng]) };
    const key = match(f[cLine], f[cName], at);
    entranceKey.set(id, key);
    if (!key && candidates(f[cLine]).length) {
      unmatched++;
      if (process.env.DEBUG) console.log('unmatched', id, at);
    }
  }
  const key = entranceKey.get(id);
  if (!key) continue;
  const days = perDay.get(key) ?? new Map();
  const day = date.toISOString().slice(0, 10);
  days.set(day, (days.get(day) ?? 0) + Number(f[cTaps] || 0));
  perDay.set(key, days);
}

const metro = {};
const marmarayOut = {};
for (const [key, days] of perDay) {
  const values = [...days.values()].filter((v) => v > 0).sort((a, b) => a - b);
  if (values.length < 20) continue;
  const median = values[Math.floor(values.length / 2)];
  if (key.startsWith('MR:')) marmarayOut[key.slice(3)] = median;
  else metro[key] = median;
}

const count = Object.keys(metro).length + Object.keys(marmarayOut).length;
console.log(`${count} stations (${Object.keys(marmarayOut).length} Marmaray), ${unmatched} entrances unmatched`);
// Sanity floor so a broken upstream never replaces good data with an empty file.
if (count < 200) throw new Error(`only ${count} stations matched; keeping the previous file`);

writeFileSync(
  OUT,
  JSON.stringify({
    source: `İBB Açık Veri — ${resource.r.name} (İBB Açık Veri Lisansı)`,
    year: resource.year,
    metric: 'median weekday entries (card taps)',
    metro,
    marmaray: marmarayOut,
  }),
);
console.log(`wrote ${OUT}`);
