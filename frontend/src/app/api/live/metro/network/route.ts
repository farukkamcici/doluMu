import { cached } from '@/lib/live/respond';
import { getMetroNetwork } from '@/lib/live/metro';

export const GET = () => cached(21_600, getMetroNetwork);
