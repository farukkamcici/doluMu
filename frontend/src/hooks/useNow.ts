'use client';
import { useEffect, useState } from 'react';
import { istanbulNow, type IstanbulNow } from '@/lib/time';

/** Istanbul wall-clock time, refreshed every 30 seconds. */
export function useNow(): IstanbulNow {
  const [now, setNow] = useState(() => istanbulNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(istanbulNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
