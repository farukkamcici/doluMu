'use client';
import { AlertTriangle, Moon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const STATUS_CONFIG = {
  WARNING: {
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-400',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    animate: true
  },
  OUT_OF_SERVICE: {
    bgColor: 'bg-slate-700/30',
    borderColor: 'border-slate-600/30',
    textColor: 'text-gray-300',
    icon: Moon,
    iconColor: 'text-slate-400',
    animate: false
  },
  ACTIVE: null
};

export default function StatusBanner({ status, className, onClick }) {
  const t = useTranslations('status');

  if (!status || status.status === 'ACTIVE' || !status.messages || status.messages.length === 0) {
    return null;
  }

  const config = STATUS_CONFIG[status.status];
  if (!config) return null;

  const Icon = config.icon;
  const hasMultipleMessages = status.messages.length > 1;
  const displayMessage = status.messages.join(' • ');
  const isLongMessage = displayMessage.length > 80;
  const isClickable = hasMultipleMessages && onClick;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 flex items-start gap-2',
        config.bgColor,
        config.borderColor,
        config.animate && 'animate-pulse',
        isClickable && 'cursor-pointer hover:bg-opacity-80 transition-all',
        className
      )}
      onClick={isClickable ? onClick : undefined}
    >
      <Icon size={16} className={cn('shrink-0 mt-0.5', config.iconColor)} />
      <div className="flex-1 min-w-0">
        {isLongMessage ? (
          <div className="overflow-hidden">
            <p className={cn('text-xs font-medium whitespace-nowrap animate-marquee', config.textColor)}>
              {displayMessage}
            </p>
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
          {hasMultipleMessages && (
            <p className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
              ({status.messages.length} {t('alerts')})
              {isClickable && <ChevronRight size={12} />}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
