'use client';
import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatHour } from '@/lib/time';
import type { DayProfile, HourPoint } from '@/lib/crowd';

const AXIS_TICKS = [0, 6, 12, 18];

function barHeight(point: HourPoint) {
  if (point.ratio == null) return 0;
  // Relative scale: 100% = the day's busiest hour. Keep the quietest served hour visible.
  return 10 + point.ratio * 90;
}

interface HourlyBarsProps {
  profile: DayProfile;
  /** Bar colour: the line's own colour (CSS colour). Defaults to ink. */
  color?: string | null;
  selectedHour?: number | null;
  currentHour?: number | null;
  onSelect?: (hour: number) => void;
  variant?: 'full' | 'mini';
  className?: string;
}

/** Hour-by-hour profile in the line's colour. Interactive in `full`, decorative in `mini`. */
export function HourlyBars({
  profile,
  color,
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
  const fill = color ?? 'rgb(var(--fg))';
  // Dim the other bars only when the selected hour has a bar to emphasise.
  const emphasise = interactive && selectedHour != null && profile.hours[selectedHour]?.ratio != null;

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
        className={cn('relative flex items-end', mini ? 'h-6 gap-px' : 'h-36 gap-[3px] pt-6')}
      >
        {profile.hours.map((point) => {
          const isSelected = interactive && point.hour === selectedHour;
          const isNow = point.hour === currentHour;
          const served = point.ratio != null;
          const bar = served ? (
            <span
              className={cn(
                'block w-full transition-[height] duration-300',
                mini ? 'rounded-[1px]' : 'rounded-[2px]',
                emphasise && !isSelected && 'opacity-45',
              )}
              style={{ height: `${barHeight(point)}%`, backgroundColor: fill }}
            />
          ) : (
            <span className={cn('mx-auto block rounded-full bg-fg/15', mini ? 'h-[2px] w-full' : 'h-1 w-1')} />
          );

          if (!interactive) {
            return (
              <span key={point.hour} className="relative flex h-full flex-1 items-end" aria-hidden>
                {bar}
                {isNow && mini ? <span className="absolute -bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-signal" /> : null}
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
              aria-label={t('line.chart.a11y', { hour: formatHour(point.hour), level: t(`levels.${point.state}`) })}
              tabIndex={isSelected || (selectedHour == null && point.hour === 0) ? 0 : -1}
              onClick={() => onSelect?.(point.hour)}
              onKeyDown={(e) => move(e, point.hour)}
              className="relative flex h-full flex-1 items-end rounded-sm focus-visible:ring-offset-0"
            >
              {isNow ? (
                <span
                  className={cn(
                    'pointer-events-none absolute -top-6 font-display text-[11px] font-semibold uppercase tracking-wide text-signal',
                    point.hour <= 1 ? 'left-0' : point.hour >= 22 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                  )}
                >
                  {t('common.now')}
                </span>
              ) : null}
              {isNow ? <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-signal/60" /> : null}
              {bar}
            </button>
          );
        })}
      </div>

      {!mini ? (
        <div className="relative mt-2 h-4 font-display text-[12px] tabular-nums text-fg-subtle" aria-hidden>
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
