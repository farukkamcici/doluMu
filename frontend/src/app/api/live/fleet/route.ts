import { cached } from '@/lib/live/respond';
import { getFleet } from '@/lib/live/iett';

export async function GET() {
  // İETT refreshes positions about once a minute.
  return cached(30, getFleet);
}
