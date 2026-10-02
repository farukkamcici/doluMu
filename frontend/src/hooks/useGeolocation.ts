'use client';
import { useCallback, useState } from 'react';

export type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; lat: number; lng: number }
  | { status: 'denied' }
  | { status: 'error' };

/** One-shot location request, only when the user asks for it. */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle' });
  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) return setState({ status: 'error' });
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ status: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setState({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'error' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  return { state, locate };
}
