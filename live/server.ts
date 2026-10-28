// The website's live İBB data (/api/live/* on www.dolumu.app, rewritten here by next.config.js).
// It runs on the Hetzner server next to the API instead of as Vercel functions; the loaders are
// the website's own (frontend/src/lib/live), bundled in by esbuild.
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { compress } from 'hono/compress';
import { cacheStats, cached } from './cache';
import { installEgress, lastProbe, proxyUrl, startProbe } from './egress';
import { getFares, getMetroDepartures, getMetroNetwork, getMetroStatus } from '../frontend/src/lib/live/metro';
import { getBusLine, getBusLines, getBusNotices, getBusVehicles, getFleet } from '../frontend/src/lib/live/iett';
import { getParking } from '../frontend/src/lib/live/city';

installEgress();
startProbe();

const app = new Hono();
app.use('*', compress());

/** JSON with a CDN cache window and a long stale window, like the old Vercel routes. */
async function json<T>(c: Context, key: string, seconds: number, load: () => Promise<T>) {
  try {
    // While the probe finds İBB unreachable, answer at once instead of after the 10 s timeout.
    const data = await cached(key, seconds, load, { wait: lastProbe()?.ok !== false });
    return c.json(data as object, 200, {
      'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 10}`,
    });
  } catch (error) {
    console.error('[live]', c.req.path, (error as Error).message);
    return c.json({ error: 'upstream_unavailable' }, 502, { 'Cache-Control': 'public, s-maxage=15' });
  }
}

// Process health, plus whether the exit to İBB works (ibb.ok) and how much is cached.
const health = (c: Context) =>
  c.json({ ok: true, egress: proxyUrl ? 'proxy' : 'direct', ibb: lastProbe(), cache: cacheStats() }, 200, { 'Cache-Control': 'no-store' });
app.get('/healthz', health);

const live = new Hono();
live.get('/healthz', health);
live.get('/fares', (c) => json(c, 'fares', 86_400, getFares));
// İETT refreshes positions about once a minute.
live.get('/fleet', (c) => json(c, 'fleet', 30, getFleet));
live.get('/parking', (c) => json(c, 'parking', 300, getParking));
live.get('/bus/notices', (c) => json(c, 'bus:notices', 300, getBusNotices));
live.get('/bus/lines', (c) => json(c, 'bus:lines', 21_600, getBusLines));
live.get('/bus/:code/vehicles', (c) => {
  const code = c.req.param('code');
  return json(c, `bus:vehicles:${code}`, 30, () => getBusVehicles(code));
});
live.get('/bus/:code', (c) => {
  const code = c.req.param('code');
  return json(c, `bus:line:${code}`, 86_400, () => getBusLine(code));
});
live.get('/metro/network', (c) => json(c, 'metro:network', 21_600, getMetroNetwork));
live.get('/metro/status', (c) => json(c, 'metro:status', 120, getMetroStatus));
live.get('/metro/departures/:station', (c) => {
  const id = Number(c.req.param('station'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'bad_station' }, 400);
  // A day's timetable; refreshed every half hour so a new service day (weekday/weekend) is picked up.
  return json(c, `metro:departures:${id}`, 1800, () => getMetroDepartures(id));
});
app.route('/live', live);

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => console.log(`live API on :${info.port} (egress ${proxyUrl ? 'proxy' : 'direct'})`));
