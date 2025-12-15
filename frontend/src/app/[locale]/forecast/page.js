'use client';
import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import BottomNav from '@/components/ui/BottomNav';
import LineDetailPanel from '@/components/ui/LineDetailPanel';
import PageHeader from '@/components/ui/PageHeader';
import useAppStore from '@/store/useAppStore';
import { Star, TrendingUp, MapPin, AlertTriangle, ArrowRight } from 'lucide-react';
import { getLineMetadata, getForecast, getLineStatus } from '@/lib/api';
import { getTransportType } from '@/lib/transportTypes';
import { useGetTransportLabel } from '@/hooks/useGetTransportLabel';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

const crowdLevelConfig = {
  "Low": { color: "text-emerald-400", bgColor: "bg-emerald-500/20", badge: "bg-emerald-500" },
  "Medium": { color: "text-yellow-400", bgColor: "bg-yellow-500/20", badge: "bg-yellow-500" },
  "High": { color: "text-orange-400", bgColor: "bg-orange-500/20", badge: "bg-orange-500" },
  "Very High": { color: "text-red-400", bgColor: "bg-red-500/20", badge: "bg-red-500" },
};

function FavoriteLineCard({ lineId }) {
  const t = useTranslations('forecast');
  const locale = useLocale();
  const getTransportLabel = useGetTransportLabel();
  const { openLineDetail } = useAppStore();
  const [metadata, setMetadata] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [lineStatus, setLineStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [meta, forecastData, statusData] = await Promise.all([
          getLineMetadata(lineId),
          getForecast(lineId, new Date()),
          getLineStatus(lineId)
        ]);
        
        setMetadata(meta);
        setLineStatus(statusData);
        
        const currentHour = new Date().getHours();
        const current = forecastData.find(f => f.hour === currentHour);
        setCurrentStatus(current);
      } catch (error) {
        console.error('Error fetching line data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [lineId]);

  const handleCardClick = () => {
    if (metadata) {
      const lineObject = {
        id: metadata.line_name,
        name: metadata.line_name,
        metadata: {
          transport_type_id: metadata.transport_type_id,
          road_type: metadata.road_type,
          line: metadata.line,
        }
      };
      openLineDetail(lineObject, { maximize: true });
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-2xl bg-surface/70 p-4 border border-white/10 min-h-[104px] shadow-lg"
        aria-busy="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-5 w-16 rounded" />
          </div>
          <Skeleton className="h-5 w-20 rounded-lg" />
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <span className="sr-only">{t('loading')}</span>
      </div>
    );
  }

  if (!metadata) return null;

  const transportType = getTransportType(metadata.transport_type_id);
  const crowdLevel = currentStatus?.crowd_level || 'Unknown';
  const config = crowdLevelConfig[crowdLevel] || { color: "text-gray-400", bgColor: "bg-gray-500/20", badge: "bg-gray-500" };
  const crowdKey = `crowdLevels.${crowdLevel}`;
  const crowdLabel = typeof t.has === 'function' && t.has(crowdKey) ? t(crowdKey) : crowdLevel;

  return (
    <button
      onClick={handleCardClick}
      className={cn(
        'group w-full rounded-2xl border border-white/10 bg-surface/70 p-4 text-left shadow-lg backdrop-blur-md',
        'transition-colors hover:bg-surface/85 active:bg-surface',
        lineStatus?.status === 'OUT_OF_SERVICE' && "opacity-70"
      )}
    >
      {lineStatus?.status === 'WARNING' && (
        <div className="absolute -top-1 -right-1">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>
            <div className="relative flex items-center justify-center w-6 h-6 bg-red-500 rounded-full border-2 border-background">
              <AlertTriangle size={12} className="text-white" />
            </div>
          </div>
        </div>
      )}
      
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-primary px-3 py-1.5 text-sm font-bold text-white">
              {metadata.line_name}
            </span>
            {transportType ? (
              <span
                className={cn(
                  'rounded-xl px-2 py-1 text-xs font-semibold border',
                  transportType.bgColor,
                  transportType.textColor,
                  transportType.borderColor
                )}
              >
                {getTransportLabel(transportType.labelKey)}
              </span>
            ) : null}
          </div>
          {metadata.line ? (
            <p className="mt-2 line-clamp-1 text-sm text-gray-300">{metadata.line}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {currentStatus ? (
            <div className={cn('rounded-xl px-2 py-1 text-xs font-semibold text-white', config.badge)}>
              {crowdLabel}
            </div>
          ) : null}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span>{t('tapForDetails')}</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>

      {currentStatus ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-background/30 px-3 py-2 text-xs text-gray-200">
            <TrendingUp size={14} className="text-secondary" />
            <span className="text-gray-400">{t('occupancy')}</span>
            <span className="font-semibold text-gray-200">{currentStatus.occupancy_pct}%</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-background/30 px-3 py-2 text-xs text-gray-200">
            <span className="text-gray-400">{t('passengers')}</span>
            <span className="font-semibold text-gray-200">
              {Math.round(currentStatus.predicted_value).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}
            </span>
          </div>
        </div>
      ) : null}
    </button>
  );
}

export default function ForecastPage() {
  const t = useTranslations('forecast');
  const router = useRouter();
  const { favorites, isPanelOpen, isPanelMinimized } = useAppStore();

  const handleGoToMap = () => {
    router.push('/');
  };

  return (
    <main className="relative flex min-h-screen flex-col bg-background pb-20 font-sans text-text">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={Star}
        disableBlur={isPanelOpen && !isPanelMinimized}
      />

      <div className="flex-1 px-4 space-y-4 overflow-y-auto pt-4">
        {favorites.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-2 py-10">
            <div className="w-full max-w-md">
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface/70 p-6 shadow-2xl backdrop-blur">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-secondary/10" />

                <div className="relative">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 rounded-2xl border border-primary/25 bg-primary/10 p-3">
                      <Star size={22} className="text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-text">
                        {t('emptyState.title')}
                      </h2>
                      <p className="mt-1 text-sm text-gray-400">
                        {t('emptyState.description')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-background/30 p-4">
                    <div className="flex items-center gap-3 text-sm text-gray-300">
                      <MapPin size={16} className="text-secondary" />
                      <span className="leading-snug">{t('emptyState.step1')}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-sm text-gray-300">
                      <Star size={16} className="text-secondary" />
                      <span className="leading-snug">{t('emptyState.step2')}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleGoToMap}
                    className="mt-6 w-full rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow hover:bg-primary/90 transition-colors"
                  >
                    {t('emptyState.button')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          favorites.map((lineId) => (
            <FavoriteLineCard key={lineId} lineId={lineId} />
          ))
        )}
      </div>

      <BottomNav />
      <LineDetailPanel />
    </main>
  );
}
