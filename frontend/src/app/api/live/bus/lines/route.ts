import { cached } from '@/lib/live/respond';
import { getBusLines } from '@/lib/live/iett';

export const GET = () => cached(21_600, getBusLines);
