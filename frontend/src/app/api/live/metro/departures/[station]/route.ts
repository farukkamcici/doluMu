import { NextResponse } from 'next/server';
import { cached } from '@/lib/live/respond';
import { getMetroDepartures } from '@/lib/live/metro';

export async function GET(_req: Request, { params }: { params: Promise<{ station: string }> }) {
  const id = Number((await params).station);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad_station' }, { status: 400 });
  // A day's timetable; refreshed hourly so a new service day (weekday/weekend) is picked up.
  return cached(1800, () => getMetroDepartures(id));
}
