// The shared loaders pass Next's data-cache hint to fetch; outside Next it is ignored (cache.ts caches instead).
declare global {
  interface RequestInit {
    next?: { revalidate?: number | false };
  }
}
export {};
