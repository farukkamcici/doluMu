import { cached } from '@/lib/live/respond';
import { getParking } from '@/lib/live/city';

export const GET = () => cached(300, getParking);
