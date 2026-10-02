import { cached } from '@/lib/live/respond';
import { getBusReliability } from '@/lib/live/iett';

// Yesterday's archive doesn't change; refresh a few times a day.
export const maxDuration = 60;
export const GET = () => cached(21_600, getBusReliability);
