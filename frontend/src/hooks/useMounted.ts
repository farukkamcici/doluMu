'use client';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** True only on the client after hydration (for theme- or storage-dependent UI). */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
