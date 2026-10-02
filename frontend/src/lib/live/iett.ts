import 'server-only';
import { iettJson, iettSoap, parseDataSet } from './upstream';
import type { BusDirection, BusLineDetail, BusLineInfo, BusNotice, BusVehicle } from './types';

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
