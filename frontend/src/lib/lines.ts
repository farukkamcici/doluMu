import type { LineSummary, TransportTypeId } from './api';

export type Mode = 'bus' | 'metrobus' | 'rail' | 'ferry';

const METROBUS = /^34[A-Z]{0,2}$/;

export function modeOf(code: string, typeId?: TransportTypeId | number | null): Mode {
  if (typeId === 3) return 'ferry';
  if (typeId === 2) return 'rail';
  if (METROBUS.test(code)) return 'metrobus';
  if (typeId === 1) return 'bus';
  // Unknown type: infer from the code shape.
  return /^(M\d|T\d|F\d|TF\d|MARMARAY)/.test(code) ? 'rail' : 'bus';
}

/** Rail lines with an official colour in metro_topology.json. */
export function isMetroTopologyLine(code: string) {
  return /^(M\d+[AB]?|T\d+|F\d+|TF\d+)$/.test(code);
}

/** Official line colours, copied from public/data/metro_topology.json (Metro İstanbul). */
export const RAIL_COLORS: Record<string, string> = {
  F1: '#7C7358',
  F4: '#7C7358',
  M1: '#EE3124',
  M1A: '#EE3124',
  M1B: '#EE3124',
  M2: '#009944',
  M3: '#00A8E1',
  M4: '#E91E76',
  M5: '#683064',
  M6: '#CAA977',
  M7: '#F89ABA',
  M8: '#447ABE',
  M9: '#F0E514',
  T1: '#004F7D',
  T3: '#A86528',
  T4: '#F47E46',
  T5: '#7C72B3',
  TF1: '#68BCB0',
  TF2: '#68BCB0',
};

/** Badge text colour for a background hex (WCAG relative luminance). */
export function readableOn(hex: string): '#000000' | '#FFFFFF' {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return lum > 0.4 ? '#000000' : '#FFFFFF';
}

const TR_LOWER: Record<string, string> = { I: 'ı', İ: 'i' };
const FOLD: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

/** Query form the search API matches reliably: Turkish-aware lowercase folded to ASCII. */
export function normalizeQuery(raw: string): string {
  const lowered = raw
    .trim()
    .replace(/[Iİ]/g, (c) => TR_LOWER[c])
    .toLocaleLowerCase('tr-TR');
  const folded = lowered.replace(/[ığüşöçâîû]/g, (c) => FOLD[c]);
  // The API knows M1 (forecast stream), search splits it into M1A/M1B itself.
  return folded.replace(/^m1[ab]$/, 'm1');
}

/** Same folding for client-side matching/highlighting. */
export const foldForMatch = (s: string) => normalizeQuery(s);

/**
 * Route names from the API are upper-case ASCII ("TUZLA-TOPKAPI"). Turkish title-casing
 * would invent wrong letters (Yenikapi), so keep the casing and only tidy separators.
 */
function routeEndpoints(line: Pick<LineSummary, 'line'> | null | undefined): string[] {
  if (!line?.line) return [];
  return line.line
    .split(/\s*[-–]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function routeLabel(line: Pick<LineSummary, 'line'> | null | undefined): string {
  const parts = routeEndpoints(line);
  return parts.length ? parts.join(' – ') : '';
}

/** Lines suggested on the home screen before the user has favourites. */
export const POPULAR_LINES = ['M2', 'MARMARAY', '34', 'M4', '500T', 'T1', '15F', 'M5'];
