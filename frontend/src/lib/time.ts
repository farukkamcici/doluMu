// All forecast hours are Istanbul wall-clock hours, regardless of the viewer's timezone.
export const ISTANBUL_TZ = 'Europe/Istanbul';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ISTANBUL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface IstanbulNow {
  /** yyyy-MM-dd */
  date: string;
  hour: number;
  minute: number;
  /** Minutes since Istanbul midnight. */
  minutes: number;
}

export function istanbulNow(at: Date = new Date()): IstanbulNow {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(at).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

/** Adds days to a yyyy-MM-dd string (calendar arithmetic, timezone-free). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** "HH:MM" → minutes since midnight, or null if malformed. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatDuration(minutes: number, labels: { min: string; hour: string }): string {
  if (minutes < 60) return `${minutes} ${labels.min}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ${labels.hour}` : `${h} ${labels.hour} ${m} ${labels.min}`;
}
