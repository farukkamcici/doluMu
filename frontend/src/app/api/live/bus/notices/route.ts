import { cached } from '@/lib/live/respond';
import { getBusNotices } from '@/lib/live/iett';

export const GET = () => cached(300, getBusNotices);
