'use client';
import { AlertTriangle, Moon, Info } from 'lucide-react';
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

export default function StatusBanner({ status, className }) {
  const t = useTranslations('status');

  if (!status || status.status === 'ACTIVE') {
    return null;
  }

  const config = STATUS_CONFIG[status.status];
  if (!config) return null;

  const Icon = config.icon;
  const isLongMessage = status.message && status.message.length > 80;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 flex items-start gap-2',
        config.bgColor,
        config.borderColor,
        config.animate && 'animate-pulse',
        className
      )}
    >
      <Icon size={16} className={cn('shrink-0 mt-0.5', config.iconColor)} />
      <div className="flex-1 min-w-0">
        {isLongMessage ? (
          <div className="overflow-hidden">
            <p className={cn('text-xs font-medium whitespace-nowrap animate-marquee', config.textColor)}>
              {status.message}
            </p>
          </div>
        ) : (
          <p className={cn('text-xs font-medium', config.textColor)}>
            {status.message}
          </p>
        )}
        {status.next_service_time && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {t('nextService')}: {status.next_service_time}
          </p>
        )}
      </div>
    </div>
  );
}
