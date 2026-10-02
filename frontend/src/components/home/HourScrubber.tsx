'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';
import { formatHour } from '@/lib/time';

interface HourScrubberProps {
  hour: number;
  onChange: (hour: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}

/** Scrub or play through the day; the map's line widths follow. */
export function HourScrubber({ hour, onChange, playing, onPlayingChange }: HourScrubberProps) {
  const t = useTranslations('home');

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      onChange(hour >= 23 ? 5 : hour + 1);
    }, 700);
    return () => window.clearInterval(id);
  }, [playing, hour, onChange]);

  return (
    <div className="pointer-events-auto rounded-lg bg-card/95 px-3 py-2 shadow-pop backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? t('pause') : t('play')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-fg text-bg"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
        </button>
        <output className="w-14 shrink-0 font-display text-xl font-bold tabular-nums">{formatHour(hour)}</output>
        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={hour}
          aria-label={t('hourLabel')}
          onChange={(e) => {
            onPlayingChange(false);
            onChange(Number(e.target.value));
          }}
          className="hour-range min-w-0 flex-1"
        />
      </div>
      <p className="mt-0.5 text-[11px] text-fg-muted">{t('mapLegend')}</p>
    </div>
  );
}
