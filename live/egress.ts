import { Agent, ProxyAgent, fetch as undiciFetch, setGlobalDispatcher } from 'undici';

/**
 * İBB drops connections from non-Turkish IPs (since 2026-10-22), and this server runs abroad. When
 * IBB_PROXY_URL is set (an HTTP forward proxy on a Turkish line, e.g. http://user:pass@host:3128),
 * every request to *.ibb.gov.tr goes out through it; other hosts are fetched directly.
 */
const IBB_HOST = /(^|\.)ibb\.gov\.tr$/;

export const proxyUrl = process.env.IBB_PROXY_URL || null;

export function installEgress() {
  if (!proxyUrl) return;
  const proxy = new ProxyAgent(proxyUrl);
  const routed = new Agent().compose((dispatch) => (opts, handler) =>
    IBB_HOST.test(new URL(String(opts.origin)).hostname) ? proxy.dispatch(opts, handler) : dispatch(opts, handler),
  );
  setGlobalDispatcher(routed);
  // undici's own fetch uses the dispatcher above; Node's bundled copy may not share it.
  globalThis.fetch = undiciFetch as unknown as typeof fetch;
}

export interface Probe {
  ok: boolean;
  at: string;
  ms: number;
  error?: string;
}

let last: Probe | null = null;

/** A cheap İBB call every few minutes, so /healthz shows whether the exit to İBB works. */
export function startProbe(intervalMs = 120_000) {
  const run = async () => {
    const started = Date.now();
    try {
      const res = await fetch('https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetServiceStatuses', {
        signal: AbortSignal.timeout(10_000),
      });
      await res.arrayBuffer();
      last = { ok: res.ok, at: new Date().toISOString(), ms: Date.now() - started, ...(res.ok ? {} : { error: `${res.status}` }) };
    } catch (error) {
      last = { ok: false, at: new Date().toISOString(), ms: Date.now() - started, error: (error as Error).message };
    }
  };
  void run();
  setInterval(run, intervalMs).unref();
}

export const lastProbe = () => last;
