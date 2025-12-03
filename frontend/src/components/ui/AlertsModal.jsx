'use client';
import { X, AlertTriangle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export default function AlertsModal({ isOpen, onClose, messages, lineCode }) {
  const t = useTranslations('status');

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999]"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <div 
          className="bg-slate-900 rounded-xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{t('alerts')}</h2>
                <p className="text-sm text-gray-400">
                  {t('lineCode')}: {lineCode} • {messages.length} {t('activeAlerts')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content - Custom Scrollbar */}
          <div className="overflow-y-auto max-h-[calc(80vh-5rem)] p-6 space-y-3 scrollbar-thin scrollbar-thumb-amber-500/30 scrollbar-track-slate-800/50 hover:scrollbar-thumb-amber-500/50">
            {messages.map((alert, index) => (
              <div
                key={index}
                className="p-4 rounded-lg border bg-amber-500/5 border-amber-500/20"
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-amber-400">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {alert.text}
                    </p>
                    {alert.time && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                        <Clock size={12} />
                        <span>{alert.time}</span>
                        {alert.type && (
                          <>
                            <span className="mx-1">•</span>
                            <span>{alert.type}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
