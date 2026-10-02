import 'server-only';
import { UpstreamError } from './upstream';
import type { ParkingLot } from './types';

interface RawPark {
  parkID: number;
  parkName: string;
  lat: string;
  lng: string;
  capacity: number;
  emptyCapacity: number;
  /** 1 for open-air lots (not open/closed status). */
  isOpen: number;
  parkType: string;
  workHours: string;
}

/** İSPARK car parks with live free spaces (park & ride near stations). */
export async function getParking(): Promise<ParkingLot[]> {
  const res = await fetch('https://api.ibb.gov.tr/ispark/Park', { next: { revalidate: 300 }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new UpstreamError(`ispark ${res.status}`);
  const raw = (await res.json()) as RawPark[];
  return raw
    .map((p) => ({
      id: p.parkID,
      name: p.parkName,
      lat: Number(p.lat),
      lng: Number(p.lng),
      capacity: p.capacity,
      empty: p.emptyCapacity,
      type: p.parkType,
      hours: p.workHours,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
