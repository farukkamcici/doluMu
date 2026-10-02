import 'server-only';
import { iettJson, iettSoap, parseDataSet } from './upstream';
import type { BusDirection, BusLineDetail, BusLineInfo, BusNotice, BusReliability, BusRidership, BusVehicle, LineReliability } from './types';

interface RawLine {
  SHATKODU: string;
  SHATADI: string;
  TARIFE: string | null;
  HAT_UZUNLUGU: number | null;
}

export async function getBusLines(): Promise<BusLineInfo[]> {
  const raw = await iettJson<RawLine[]>('UlasimAnaVeri/HatDurakGuzergah.asmx', 'GetHat_json', { HatKodu: '' }, 21_600);
  return raw.map((l) => ({
    code: l.SHATKODU,
    name: l.SHATADI?.trim() ?? l.SHATKODU,
    tariff: l.TARIFE?.trim() || null,
    lengthKm: l.HAT_UZUNLUGU ?? null,
  }));
}

export async function getBusLine(code: string): Promise<BusLineDetail> {
  const [lines, stopsXml] = await Promise.allSettled([
    getBusLines(),
    iettSoap('ibb/ibb.asmx', 'DurakDetay_GYY_wYonAdi', { hat_kodu: code }, 86_400),
  ]);
  if (lines.status === 'rejected' && stopsXml.status === 'rejected') throw lines.reason;

  const directions: BusLineDetail['directions'] = {};
  if (stopsXml.status === 'fulfilled') {
    const rows = parseDataSet(stopsXml.value).sort((a, b) => Number(a.SIRANO) - Number(b.SIRANO));
    for (const row of rows) {
      const dir = row.YON === 'G' || row.YON === 'D' ? row.YON : null;
      const lat = Number(row.YKOORDINATI);
      const lng = Number(row.XKOORDINATI);
      if (!dir || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const target: BusDirection = (directions[dir] ??= { name: row.YON_ADI, stops: [] });
      target.stops.push({ code: row.DURAKKODU, name: row.DURAKADI, lat, lng, district: row.ILCEADI || null });
    }
  }

  return {
    info: lines.status === 'fulfilled' ? (lines.value.find((l) => l.code === code) ?? null) : null,
    directions,
  };
}

interface RawVehicle {
  kapino: string;
  boylam: string;
  enlem: string;
  guzergahkodu: string;
  yon: string;
  son_konum_zamani: string;
  yakinDurakKodu: string | null;
}

export async function getBusVehicles(code: string): Promise<BusVehicle[]> {
  const raw = await iettJson<RawVehicle[]>('FiloDurum/SeferGerceklesme.asmx', 'GetHatOtoKonum_json', { HatKodu: code }, 30);
  return raw
    .map((v) => {
      // Route codes look like "500T_G_D0": the middle part is the direction.
      const dir = v.guzergahkodu?.split('_')[1];
      return {
        id: v.kapino,
        route: v.guzergahkodu || null,
        lat: Number(v.enlem),
        lng: Number(v.boylam),
        direction: dir === 'G' || dir === 'D' ? dir : null,
        destination: v.yon,
        nearStop: v.yakinDurakKodu || null,
        at: v.son_konum_zamani,
      } satisfies BusVehicle;
    })
    .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
}

export async function getBusNotices(): Promise<BusNotice[]> {
  const raw = await iettJson<{ HATKODU: string; MESAJ: string; GUNCELLEME_SAATI: string }[]>(
    'UlasimDinamikVeri/Duyurular.asmx',
    'GetDuyurular_json',
    {},
    300,
  );
  return raw.map((n) => ({
    line: n.HATKODU,
    message: n.MESAJ?.trim() ?? '',
    time: n.GUNCELLEME_SAATI?.replace(/^Kayit Saati:\s*/i, '') ?? null,
  }));
}

const ms = (s: string | null | undefined) => {
  const m = s ? /\d+/.exec(s) : null;
  return m ? Number(m[0]) : null;
};

const istanbulDate = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

interface RawDuty {
  SHATKODU: string;
  SGOREVDURUM: string;
  DTBASLAMAZAMANI: string | null;
  DTPLANLANANBASLANGICZAMANI: string | null;
}

/**
 * Yesterday's executed trips per line from İETT's duty archive (~55k duties, ~20 MB): how many
 * ran, how many were cancelled, and how punctual departures from the first stop were.
 * Status codes: T = completed, I = cancelled (others: partial/ongoing).
 */
export async function getBusReliability(): Promise<BusReliability> {
  const date = istanbulDate(1);
  // Too large for Next's 2 MB data cache: always fetch, the route response is CDN-cached instead.
  const duties = await iettJson<RawDuty[]>('ibb/ibb360.asmx', 'GetIettArsivGorev_json', { Tarih: date.replaceAll('-', '') }, 0);
  const acc = new Map<string, { trips: number; completed: number; cancelled: number; delays: number[] }>();
  for (const d of duties) {
    const line = d.SHATKODU?.trim();
    if (!line) continue;
    const a = acc.get(line) ?? { trips: 0, completed: 0, cancelled: 0, delays: [] };
    a.trips++;
    if (d.SGOREVDURUM === 'T') a.completed++;
    if (d.SGOREVDURUM === 'I') a.cancelled++;
    const actual = ms(d.DTBASLAMAZAMANI);
    const planned = ms(d.DTPLANLANANBASLANGICZAMANI);
    if (actual && planned) {
      const delay = (actual - planned) / 60_000;
      if (Math.abs(delay) < 180) a.delays.push(delay);
    }
    acc.set(line, a);
  }
  const lines: Record<string, LineReliability> = {};
  for (const [line, a] of acc) {
    const sorted = a.delays.sort((x, y) => x - y);
    lines[line] = {
      trips: a.trips,
      completed: a.completed,
      cancelled: a.cancelled,
      medianDelayMin: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10 : null,
      onTimeShare: sorted.length ? sorted.filter((x) => Math.abs(x) <= 3).length / sorted.length : null,
    };
  }
  return { date, lines };
}

/** Yesterday's journeys for İETT's 50 busiest lines (GetIettYolculukHat). */
export async function getBusRidership(): Promise<BusRidership> {
  const date = istanbulDate(1);
  const rows = await iettJson<{ Hat: string | null; Yolculuk: number }[]>('ibb/ibb360.asmx', 'GetIettYolculukHat_json', { Tarih: date }, 21_600);
  const lines: Record<string, number> = {};
  for (const r of rows) if (r.Hat) lines[r.Hat.trim()] = r.Yolculuk;
  return { date, lines };
}
