'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useNowcast, useTraffic } from '@/lib/queries';
import { ISTANBUL_TZ } from '@/lib/time';

type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** WMO weather interpretation codes (Open-Meteo). */
function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

/** One quiet line of context: Istanbul date and time, weather, city traffic. */
export function ContextLine() {
  const t = useTranslations('home');
  const tw = useTranslations('weatherCodes');
  const locale = useLocale();
  const weather = useNowcast().data?.hour_0;
  const traffic = useTraffic().data;
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: ISTANBUL_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const parts = [date];
  if (weather) parts.push(`${Math.round(weather.temperature_2m)}° ${tw(weatherKind(weather.weather_code)).toLocaleLowerCase(locale)}`);
  if (traffic) parts.push(`${t('traffic').toLocaleLowerCase(locale)} ${t('trafficValue', { percent: traffic.percent })}`);

  return <p className="truncate text-sm text-fg-muted" suppressHydrationWarning>{parts.join(' · ')}</p>;
}
