import { cached } from '@/lib/live/respond';
import { getBusRidership } from '@/lib/live/iett';

export const GET = () => cached(21_600, getBusRidership);
