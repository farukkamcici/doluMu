import 'server-only';

/**
 * Server-side access to İBB open-data services (Metro İstanbul REST, İETT SOAP). None of them
 * send CORS headers, so the browser talks to our /api/live routes and these helpers do the
 * upstream calls. Responses are cached by Next's data cache (`revalidate`), so a flaky upstream
 * costs at most one slow request per cache window.
 */

const METRO = 'https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2';
const IETT = 'https://api.ibb.gov.tr/iett';
const TIMEOUT_MS = 25_000;

export class UpstreamError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit & { next?: { revalidate: number } }) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new UpstreamError(`${res.status} ${url}`);
    return res;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(`${(error as Error).message} ${url}`);
  }
}

interface MetroEnvelope<T> {
  Success: boolean;
  Error: { Message?: string } | null;
  Data: T;
}

export async function metroGet<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetchWithTimeout(`${METRO}/${path}`, { next: { revalidate } });
  const body = (await res.json()) as MetroEnvelope<T>;
  if (!body.Success) throw new UpstreamError(body.Error?.Message ?? `metro ${path}`);
  return body.Data;
}

export async function metroPost<T>(path: string, payload: unknown, revalidate: number): Promise<T> {
  const res = await fetchWithTimeout(`${METRO}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    next: { revalidate },
  });
  const body = (await res.json()) as MetroEnvelope<T>;
  if (!body.Success) throw new UpstreamError(body.Error?.Message ?? `metro ${path}`);
  return body.Data;
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Calls an İETT SOAP operation and returns the raw `<…Result>` inner text. */
export async function iettSoap(service: string, operation: string, params: Record<string, string>, revalidate: number) {
  const args = Object.entries(params)
    .map(([k, v]) => `<${k}>${xmlEscape(v)}</${k}>`)
    .join('');
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${operation} xmlns="http://tempuri.org/">${args}</${operation}></soap:Body></soap:Envelope>`;
  const res = await fetchWithTimeout(`${IETT}/${service}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"http://tempuri.org/${operation}"` },
    body: envelope,
    ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' as const }),
  });
  const xml = await res.text();
  if (xml.includes('<soap:Fault>')) throw new UpstreamError(`iett fault ${operation}`);
  const match = new RegExp(`<${operation}Result[^>]*>([\\s\\S]*?)</${operation}Result>`).exec(xml);
  return match ? decodeXml(match[1]) : '';
}

export async function iettJson<T>(service: string, operation: string, params: Record<string, string>, revalidate: number) {
  const text = await iettSoap(service, operation, params, revalidate);
  return (text ? JSON.parse(text) : []) as T;
}

export function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Rows of an ADO.NET DataSet (`<Table><COL>…</COL></Table>`) as plain objects. */
export function parseDataSet(xml: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const [, body] of xml.matchAll(/<Table[^>]*>([\s\S]*?)<\/Table>/g)) {
    const row: Record<string, string> = {};
    for (const [, key, value] of body.matchAll(/<([A-Za-z_][\w]*)>([\s\S]*?)<\/\1>/g)) row[key] = decodeXml(value).trim();
    rows.push(row);
  }
  return rows;
}

/** Strip HTML from CMS content and normalise whitespace. */
export function htmlToText(html: string | null | undefined) {
  if (!html) return '';
  return decodeXml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, (e) => HTML_ENTITIES[e] ?? ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const HTML_ENTITIES: Record<string, string> = {
  '&ouml;': 'ö', '&Ouml;': 'Ö', '&uuml;': 'ü', '&Uuml;': 'Ü', '&ccedil;': 'ç', '&Ccedil;': 'Ç',
  '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&mdash;': '—',
  '&bull;': '•', '&hellip;': '…', '&acirc;': 'â', '&icirc;': 'î', '&ucirc;': 'û',
};
