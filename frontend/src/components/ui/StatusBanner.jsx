'use client';
import { AlertTriangle, Moon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const STATUS_CONFIG = {
  WARNING: {
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    textColor: 'text-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    iconAnimate: true
  },
  OUT_OF_SERVICE: {
    bgColor: 'bg-slate-700/30',
    borderColor: 'border-slate-600/30',
    textColor: 'text-gray-300',
    icon: Moon,
    iconColor: 'text-slate-400',
    iconAnimate: false
  },
  ACTIVE: null
};

export default function StatusBanner({ status, className, onClick }) {
  const t = useTranslations('status');

  if (!status || status.status === 'ACTIVE' || !status.alerts || status.alerts.length === 0) {
    return null;
  }

  const config = STATUS_CONFIG[status.status];
  if (!config) return null;

  const Icon = config.icon;
  const hasMultipleAlerts = status.alerts.length > 1;
  const displayMessage = status.alerts.map(a => a.text).join(' • ');
  const isLongMessage = displayMessage.length > 80;
  const isClickable = hasMultipleAlerts && onClick;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 flex items-start gap-2',
        config.bgColor,
        config.borderColor,
        isClickable && 'cursor-pointer hover:bg-opacity-80 transition-all',
        className
      )}
      onClick={isClickable ? onClick : undefined}
    >
      <Icon size={16} className={cn('shrink-0 mt-0.5', config.iconColor, config.iconAnimate && 'animate-pulse')} />
      <div className="flex-1 min-w-0">
        {isLongMessage ? (
          <div className="overflow-hidden relative">
            <div className="flex animate-scroll">
              <p className={cn('text-xs font-medium whitespace-nowrap', config.textColor)}>
                {displayMessage}
              </p>
              <span className={cn('text-xs font-medium whitespace-nowrap mx-4', config.textColor)}>|</span>
              <p className={cn('text-xs font-medium whitespace-nowrap', config.textColor)}>
                {displayMessage}
              </p>
            </div>
          </div>
        ) : (
          <p className={cn('text-xs font-medium', config.textColor)}>
            {displayMessage}
          </p>
        )}
        <div className="flex items-center justify-between mt-0.5">
          {status.next_service_time && (
            <p className="text-[10px] text-gray-400">
              {t('nextService')}: {status.next_service_time}
            </p>
          )}
          {hasMultipleAlerts && (
            <p className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
              ({status.alerts.length} {t('alerts')})
              {isClickable && <ChevronRight size={12} />}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
