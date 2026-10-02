'use client';
import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1024px)';
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/** Matches Tailwind's `lg`. False during SSR (mobile-first markup). */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
