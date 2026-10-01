'use client';
import { useTranslations } from 'next-intl';
import {
  Car,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useNowcast, useTraffic } from '@/lib/queries';
import { Skeleton } from '@/components/primitives/Skeleton';

type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

const WEATHER_ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

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

/** Weather and city-wide traffic: context that affects how crowded transit gets. */
export function ContextStrip() {
  const t = useTranslations('home');
  const tw = useTranslations('weatherCodes');
  const weather = useNowcast();
  const traffic = useTraffic();
  const current = weather.data?.hour_0;
  const kind = current ? weatherKind(current.weather_code) : null;
  const WeatherIcon = kind ? WEATHER_ICONS[kind] : Cloud;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-card">
        <WeatherIcon className="h-6 w-6 shrink-0 text-fg-muted" />
        <div className="min-w-0">
          <p className="text-xs text-fg-muted">{t('weather')}</p>
          {current && kind ? (
            <p className="truncate text-sm font-semibold tabular-nums">
              {Math.round(current.temperature_2m)}° · {current.precipitation > 0 ? t('rain', { mm: current.precipitation }) : tw(kind)}
            </p>
          ) : weather.isError ? (
            <p className="text-sm text-fg-subtle">—</p>
          ) : (
            <Skeleton className="mt-1 h-4 w-20" />
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-card">
        <Car className="h-6 w-6 shrink-0 text-fg-muted" />
        <div className="min-w-0">
          <p className="text-xs text-fg-muted">{t('traffic')}</p>
          {traffic.data ? (
            <p className="truncate text-sm font-semibold tabular-nums">{t('trafficValue', { percent: traffic.data.percent })}</p>
          ) : traffic.isError ? (
            <p className="text-sm text-fg-subtle">—</p>
          ) : (
            <Skeleton className="mt-1 h-4 w-20" />
          )}
        </div>
      </div>
    </div>
  );
}
