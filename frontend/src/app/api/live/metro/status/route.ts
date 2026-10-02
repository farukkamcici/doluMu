import { cached } from '@/lib/live/respond';
import { getMetroStatus } from '@/lib/live/metro';

export const GET = () => cached(120, getMetroStatus);
