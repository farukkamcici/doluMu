'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Counts in-app page views so "back" can tell a deep link (go home) from in-app navigation.
let views = 0;

export function useTrackNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    views += 1;
  }, [pathname]);
}

export const canGoBack = () => views > 1;
