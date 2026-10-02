import { cached } from '@/lib/live/respond';
import { getBusVehicles } from '@/lib/live/iett';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // İETT refreshes positions roughly once a minute; 30 s keeps us fresh without extra load.
  return cached(30, () => getBusVehicles(decodeURIComponent(code)));
}
