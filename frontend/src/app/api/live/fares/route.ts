import { cached } from '@/lib/live/respond';
import { getFares } from '@/lib/live/metro';

export const GET = () => cached(86_400, getFares);
