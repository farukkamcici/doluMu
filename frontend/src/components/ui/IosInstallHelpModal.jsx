'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Check, Ellipsis, Share2, SquarePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

function detectIosBrowser() {
  if (typeof window === 'undefined') return 'safari';

  const ua = window.navigator.userAgent || '';
  if (/CriOS\//.test(ua)) return 'chrome';
  return 'safari';
}

export default function IosInstallHelpModal({ open, onClose }) {
  const t = useTranslations('pwa');
  const browser = useMemo(() => detectIosBrowser(), []);
  const highlightSafari = browser === 'safari';

  const arrowPositionClass = highlightSafari
    ? 'left-1/2 -translate-x-1/2'
    : 'right-6 translate-x-0';

  const arrowHint = highlightSafari ? t('iosArrowHintSafari') : t('iosArrowHintChrome');

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[1200]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            className="absolute inset-x-4 top-16 mx-auto max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl sm:top-20"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('iosTitle')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text">{t('iosTitle')}</h2>
                <p className="mt-1 text-sm text-slate-300">{t('iosSubtitle')}</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-900/60 text-slate-200 hover:bg-slate-800/60"
                aria-label={t('dismissLabel')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div
                className={cn(
                  'rounded-2xl border p-4',
                  highlightSafari
                    ? 'border-primary/50 bg-slate-800/40'
                    : 'border-white/10 bg-slate-900/40'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-text">{t('iosBrowserSafari')}</span>
                  {highlightSafari ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-secondary">
                      <Check className="h-3.5 w-3.5" />
                      {t('iosRecommended')}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-white/10 bg-slate-800/60 p-2">
                      <Share2 className="h-4 w-4" />
                    </div>
                    <p className="leading-relaxed">{t('iosSafariStep1')}</p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-white/10 bg-slate-800/60 p-2">
                      <SquarePlus className="h-4 w-4" />
                    </div>
                    <p className="leading-relaxed">{t('iosSafariStep2')}</p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-white/10 bg-slate-800/60 p-2">
                      <Check className="h-4 w-4" />
                    </div>
                    <p className="leading-relaxed">{t('iosSafariStep3')}</p>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'rounded-2xl border p-4',
                  !highlightSafari
                    ? 'border-primary/50 bg-slate-800/40'
                    : 'border-white/10 bg-slate-900/40'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-text">{t('iosBrowserChrome')}</span>
                  {!highlightSafari ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-secondary">
                      <Check className="h-3.5 w-3.5" />
                      {t('iosRecommended')}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-white/10 bg-slate-800/60 p-2">
                      <Ellipsis className="h-4 w-4" />
                    </div>
                    <p className="leading-relaxed">{t('iosChromeStep1')}</p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-white/10 bg-slate-800/60 p-2">
                      <Share2 className="h-4 w-4" />
                    </div>
                    <p className="leading-relaxed">{t('iosChromeStep2')}</p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-white/10 bg-slate-800/60 p-2">
                      <SquarePlus className="h-4 w-4" />
                    </div>
                    <p className="leading-relaxed">{t('iosChromeStep3')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90"
              >
                {t('iosGotIt')}
              </button>
            </div>
          </motion.div>

          <motion.div
            className={cn(
              'pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-[1201] flex flex-col items-center',
              arrowPositionClass
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              className="rounded-full border border-white/10 bg-slate-900/80 p-2"
              aria-hidden="true"
            >
              <ArrowDown className="h-5 w-5 text-secondary" />
            </motion.div>
            <span className="mt-2 text-xs text-slate-300">{arrowHint}</span>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

