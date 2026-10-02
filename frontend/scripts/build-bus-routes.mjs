// Builds public/data/bus_routes/<LINE>.json from İETT's route geometry dataset (İBB Açık Veri,
// "İETT Hat Güzergahları"): every active route variant ("depar") of a line with its real road
// geometry, length and running time. Geometry is simplified (~6 m) and rounded to keep files small.
// Usage: node scripts/build-bus-routes.mjs [path-to-geojson]   (downloads it when no path is given)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE =
  'https://data.ibb.gov.tr/dataset/b48d2095-851c-413c-8d36-87d2310a22b5/resource/4ccb4d29-c2b6-414a-b324-d2c9962b18e2/download/iett-hat-guzergahlar-verisi.geojson';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'bus_routes');

const raw = process.argv[2]
  ? readFileSync(process.argv[2], 'utf8')
  : await (await fetch(SOURCE, { signal: AbortSignal.timeout(600_000) })).text();
const { features } = JSON.parse(raw);

/** Douglas–Peucker on [lng, lat] (degrees; tolerance ~6 m at Istanbul's latitude). */
function simplify(points, tol = 0.00006) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-18;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > max) [max, idx] = [d, i];
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// File names must survive URL decoding on any host: ASCII only (Ç → _c7). Mirrored in src/lib/live/routes.ts.
const fileName = (code) => code.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.codePointAt(0).toString(16)}`);

const num = (s) => Number(String(s ?? '').replace(',', '.')) || null;
const lines = new Map();
for (const f of features) {
  const p = f.properties;
  if (String(p.DURUM) !== '1' || !f.geometry) continue;
  const code = String(p.HAT_KODU).trim();
  const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  const coords = parts.map((part) => simplify(part).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]));
  const id = String(p.GUZERGAH_KODU).trim();
  const entry = lines.get(code) ?? { code, name: String(p.HAT_ADI).trim(), variants: [] };
  entry.variants.push({
    id,
    dir: id.split('_')[1] === 'D' ? 'D' : 'G',
    depar: String(p.DEPAR_NO),
    name: String(p.GUZERGAH_ADI).replace(/\s+/g, ' ').trim(),
    lengthM: Math.round(num(p.UZUNLUK) ?? 0),
    durationS: Math.round(num(p.SURE) ?? 0),
    ring: String(p.RING_MI) === '1',
    coords,
  });
  lines.set(code, entry);
}

// Sanity floor so a broken download never replaces good data (CI refreshes this monthly).
if (lines.size < 600) throw new Error(`only ${lines.size} lines parsed; keeping the previous files`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const entry of lines.values()) {
  // Main variants (depar 0) first, so clients can pick the canonical route per direction.
  entry.variants.sort((a, b) => (a.depar === '0' ? -1 : 0) - (b.depar === '0' ? -1 : 0) || a.id.localeCompare(b.id));
  const json = JSON.stringify(entry);
  bytes += json.length;
  writeFileSync(path.join(OUT, `${fileName(entry.code)}.json`), json);
}
console.log(`${lines.size} lines, ${(bytes / 1e6).toFixed(1)} MB → ${OUT}`);
