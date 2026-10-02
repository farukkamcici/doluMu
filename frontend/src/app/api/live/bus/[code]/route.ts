import { cached } from '@/lib/live/respond';
import { getBusLine } from '@/lib/live/iett';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return cached(86_400, () => getBusLine(decodeURIComponent(code)));
}
