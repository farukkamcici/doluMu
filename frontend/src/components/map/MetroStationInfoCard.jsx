'use client';

import { X, TrainFront } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function MetroStationInfoCard({ station, lineName, onClose }) {
  const t = useTranslations('metroStation');

  if (!station) return null;

  const accessibility = station.accessibility || {};

  const amenityBadges = [
    accessibility.elevator_count > 0 && {
      label: t('elevator', { count: accessibility.elevator_count }),
      icon: '🛗'
    },
    accessibility.escalator_count > 0 && {
      label: t('escalator', { count: accessibility.escalator_count }),
      icon: '🎢'
    },
    accessibility.has_wc && { label: t('wc'), icon: '🚻' },
    accessibility.has_baby_room && { label: t('babyRoom'), icon: '👶' },
    accessibility.has_masjid && { label: t('masjid'), icon: '🕌' }
  ].filter(Boolean);

  return (
    <div className="pointer-events-auto absolute bottom-24 left-4 z-[950] w-80 rounded-2xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
            <TrainFront className="h-3.5 w-3.5 text-primary" />
            {lineName}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {station.description || station.name}
          </h3>
          <p className="text-xs text-slate-400" aria-label={t('orderLabel', { order: station.order })}>
            {t('order', { order: station.order })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 p-1 text-slate-300 transition hover:border-white/30 hover:text-white"
          aria-label={t('close')}
        >
          <X size={14} />
        </button>
      </div>

      {station.functional_code && (
        <p className="mt-3 text-[11px] font-mono uppercase tracking-wide text-slate-500">
          {t('functionalCode')}: {station.functional_code}
        </p>
      )}

      <div className="mt-3 space-y-1 text-xs text-slate-300">
        <div>
          <span className="font-semibold text-slate-200">Lat:</span> {station.coordinates.lat?.toFixed(6)}
        </div>
        <div>
          <span className="font-semibold text-slate-200">Lng:</span> {station.coordinates.lng?.toFixed(6)}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('amenities')}
        </p>
        {amenityBadges.length === 0 ? (
          <p className="text-xs text-slate-500">{t('noAmenities')}</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {amenityBadges.map((badge, idx) => (
              <span
                key={`${badge.label}-${idx}`}
                className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white"
              >
                <span>{badge.icon}</span>
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {station.directions && station.directions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('directions')}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-200">
            {station.directions.map((dir) => (
              <li key={dir.id}>→ {dir.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
