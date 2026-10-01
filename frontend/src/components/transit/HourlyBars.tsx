'use client';
import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatHour } from '@/lib/time';
import type { DayProfile, HourPoint } from '@/lib/crowd';
import { LEVEL_BG } from './LevelPill';

const AXIS_TICKS = [0, 6, 12, 18];

function barHeight(point: HourPoint) {
  if (point.ratio == null) return 6;
  // Keep quiet hours visible; the scale is relative, so 100% = the day's peak.
  return 12 + point.ratio * 88;
}

interface HourlyBarsProps {
  profile: DayProfile;
  selectedHour?: number | null;
  currentHour?: number | null;
  onSelect?: (hour: number) => void;
  variant?: 'full' | 'mini';
  className?: string;
}

/** "Popular times" style hour-by-hour chart. Interactive in `full`, decorative in `mini`. */
export function HourlyBars({
  profile,
  selectedHour = null,
  currentHour = null,
  onSelect,
  variant = 'full',
  className,
}: HourlyBarsProps) {
  const t = useTranslations();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const mini = variant === 'mini';
  const interactive = !mini && !!onSelect;

  const move = (event: KeyboardEvent, hour: number) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1, Home: -hour, End: 23 - hour }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = Math.min(23, Math.max(0, hour + delta));
    onSelect?.(next);
    refs.current[next]?.focus();
  };

  return (
    <div className={className}>
      <div
        role={interactive ? 'radiogroup' : 'img'}
        aria-label={t('line.chart.title')}
        className={cn('relative flex items-end', mini ? 'h-7 gap-[2px]' : 'h-32 gap-[3px] pt-5')}
      >
        {profile.hours.map((point) => {
          const isSelected = point.hour === selectedHour;
          const isNow = point.hour === currentHour;
          const label = t('line.chart.a11y', {
            hour: formatHour(point.hour),
            level: t(`levels.${point.state}`),
          });
          const bar = (
            <span
              className={cn(
                'block w-full rounded-[3px] transition-[height,opacity] duration-300',
                mini ? 'rounded-[2px]' : 'rounded-t-[5px] rounded-b-[2px]',
                LEVEL_BG[point.state],
                isSelected && 'ring-2 ring-fg ring-offset-2 ring-offset-card',
                isNow && mini && 'ring-1 ring-fg/60 ring-offset-1 ring-offset-card',
              )}
              style={{ height: `${barHeight(point)}%` }}
            />
          );

          if (!interactive) {
            return (
              <span key={point.hour} className="flex h-full flex-1 items-end" aria-hidden>
                {bar}
              </span>
            );
          }

          return (
            <button
              key={point.hour}
              ref={(el) => {
                refs.current[point.hour] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={label}
              tabIndex={isSelected || (selectedHour == null && point.hour === 0) ? 0 : -1}
              onClick={() => onSelect?.(point.hour)}
              onKeyDown={(e) => move(e, point.hour)}
              className="group relative flex h-full flex-1 items-end rounded-md focus-visible:ring-offset-0"
            >
              {isNow ? (
                <span
                  className={cn(
                    'pointer-events-none absolute -top-5 whitespace-nowrap rounded-full bg-fg px-1.5 py-px text-[10px] font-semibold leading-4 text-bg',
                    point.hour <= 1 ? 'left-0' : point.hour >= 22 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                  )}
                >
                  {t('common.now')}
                </span>
              ) : null}
              {bar}
            </button>
          );
        })}
      </div>

      {!mini ? (
        <div className="relative mt-3 h-4 text-[11px] tabular-nums text-fg-subtle" aria-hidden>
          {AXIS_TICKS.map((hour) => (
            <span
              key={hour}
              className={cn('absolute', hour > 0 && '-translate-x-1/2')}
              style={{ left: hour > 0 ? `${((hour + 0.5) / 24) * 100}%` : 0 }}
            >
              {formatHour(hour)}
            </span>
          ))}
          <span className="absolute right-0">{formatHour(23)}</span>
        </div>
      ) : null}
    </div>
  );
}
