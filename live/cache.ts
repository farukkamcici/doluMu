/**
 * In-memory cache for the live loaders, so İBB is called at most once per key and window however
 * many people ask. An expired value is still served at once while it refreshes in the background
 * (up to `staleFactor` windows old); after a failed refresh the next try waits RETRY_MS, so a dead
 * upstream is not hammered and nobody waits on its timeout while a stale copy exists. With
 * `wait: false` (İBB known to be unreachable) a key with nothing to serve fails at once and the
 * refresh runs in the background, so the data comes back by itself when İBB does.
 */
interface Entry {
  value?: unknown;
  at: number;
  failedAt?: number;
  error?: Error;
  pending?: Promise<unknown>;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 3000;
const RETRY_MS = 30_000;

function refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
  const entry = store.get(key) ?? { at: 0 };
  const pending = load().then(
    (value) => {
      if (!store.has(key) && store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
      store.set(key, { value, at: Date.now() });
      return value;
    },
    (error: Error) => {
      store.set(key, { value: entry.value, at: entry.at, failedAt: Date.now(), error });
      throw error;
    },
  );
  store.set(key, { ...entry, pending });
  return pending;
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  { staleFactor = 10, wait = true }: { staleFactor?: number; wait?: boolean } = {},
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);
  const age = entry ? now - entry.at : Infinity;
  const ttl = ttlSeconds * 1000;
  const coolingDown = entry?.failedAt !== undefined && now - entry.failedAt < RETRY_MS;

  if (entry?.value !== undefined && age < ttl) return entry.value as T;
  if (entry?.value !== undefined && age < Math.max(ttl * staleFactor, 300_000)) {
    if (!entry.pending && !coolingDown) refresh(key, load).catch((e: Error) => console.error('[live] refresh', key, e.message));
    return entry.value as T;
  }
  if (!wait) {
    if (!entry?.pending && !coolingDown) refresh(key, load).catch((e: Error) => console.error('[live] refresh', key, e.message));
    throw entry?.error ?? new Error('upstream unreachable');
  }
  if (entry?.pending) return entry.pending as Promise<T>;
  if (coolingDown && entry?.error) throw entry.error;
  return refresh(key, load);
}

export function cacheStats() {
  let fresh = 0;
  let failing = 0;
  for (const e of store.values()) {
    if (e.value !== undefined) fresh += 1;
    if (e.failedAt !== undefined) failing += 1;
  }
  return { keys: store.size, withValue: fresh, lastRefreshFailed: failing };
}
