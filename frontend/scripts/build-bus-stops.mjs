// Builds public/data/bus_stops.json: every İETT stop with the lines (and directions) calling there.
// İETT has no "lines at stop" service and its GTFS stop_times is truncated, so we ask the live
// per-line stop list (DurakDetay_GYY_wYonAdi) for every line once and invert it.
// Usage: node scripts/build-bus-stops.mjs   (≈800 requests, ~2 minutes)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const IETT = 'https://api.ibb.gov.tr/iett';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'bus_stops.json');

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function soap(service, op, params) {
  const args = Object.entries(params).map(([k, v]) => `<${k}>${v}</${k}>`).join('');
  const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} xmlns="http://tempuri.org/">${args}</${op}></soap:Body></soap:Envelope>`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${IETT}/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"http://tempuri.org/${op}"` },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const xml = await res.text();
      const m = new RegExp(`<${op}Result[^>]*>([\\s\\S]*?)</${op}Result>`).exec(xml);
      return m ? decode(m[1]) : '';
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
}

const lines = JSON.parse(await soap('UlasimAnaVeri/HatDurakGuzergah.asmx', 'GetHat_json', { HatKodu: '' }));
console.log(`${lines.length} lines`);

const stops = new Map();
let done = 0;
let failed = 0;
const queue = lines.map((l) => l.SHATKODU);

async function worker() {
  while (queue.length) {
    const code = queue.shift();
    try {
      const xml = await soap('ibb/ibb.asmx', 'DurakDetay_GYY_wYonAdi', { hat_kodu: code });
      for (const [, row] of xml.matchAll(/<Table[^>]*>([\s\S]*?)<\/Table>/g)) {
        const f = Object.fromEntries([...row.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)].map(([, k, v]) => [k, v.trim()]));
        const lat = Number(f.YKOORDINATI);
        const lng = Number(f.XKOORDINATI);
        if (!f.DURAKKODU || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const stop = stops.get(f.DURAKKODU) ?? {
          name: f.DURAKADI,
          lat: Math.round(lat * 1e5) / 1e5,
          lng: Math.round(lng * 1e5) / 1e5,
          district: f.ILCEADI || '',
          lines: new Set(),
        };
        stop.lines.add(`${code}:${f.YON}`);
        stops.set(f.DURAKKODU, stop);
      }
    } catch {
      failed++;
    }
    if (++done % 100 === 0) console.log(`${done}/${lines.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const out = {
  source: 'İETT DurakDetay_GYY_wYonAdi (api.ibb.gov.tr), İBB Açık Veri',
  updatedAt: new Date().toISOString().slice(0, 10),
  // [code, name, lat, lng, district, "LINE:DIR LINE:DIR …"]
  stops: [...stops.entries()]
    .map(([code, s]) => [code, s.name, s.lat, s.lng, s.district, [...s.lines].sort().join(' ')])
    .sort((a, b) => a[0].localeCompare(b[0])),
};
// Sanity floor so an İETT outage never replaces good data (CI refreshes this monthly).
if (out.stops.length < 10_000 || failed > lines.length * 0.1) {
  throw new Error(`${out.stops.length} stops, ${failed} lines failed; keeping the previous file`);
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`${out.stops.length} stops, ${failed} lines failed → ${OUT}`);
