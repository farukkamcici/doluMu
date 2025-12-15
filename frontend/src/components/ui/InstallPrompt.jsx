'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import useMediaQuery from '@/hooks/useMediaQuery';
import usePwaInstall from '@/hooks/usePwaInstall';
import { cn } from '@/lib/utils';
import IosInstallHelpModal from '@/components/ui/IosInstallHelpModal';

const LAST_SHOWN_AT_KEY = 'ibb_transport:pwa_install_last_shown_at';
const NEVER_SHOW_KEY = 'ibb_transport:pwa_install_never_show';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function readNeverShow() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(NEVER_SHOW_KEY) === '1';
}

function writeNeverShow() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NEVER_SHOW_KEY, '1');
}

function readLastShownAt() {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(LAST_SHOWN_AT_KEY);
  const asNumber = raw ? Number(raw) : 0;
  return Number.isFinite(asNumber) ? asNumber : 0;
}

function writeLastShownAt(now) {
  if (typeof window === 'undefined') return;

  const timestamp = typeof now === 'number' ? now : new Date().getTime();
  window.localStorage.setItem(LAST_SHOWN_AT_KEY, String(timestamp));
}

export default function InstallPrompt({ className }) {
  const t = useTranslations('pwa');
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { isIos, isStandalone, deferredPrompt, promptInstall } = usePwaInstall();

  const [neverShowAgain, setNeverShowAgain] = useState(() => readNeverShow());
  const [lastShownAt, setLastShownAt] = useState(() => readLastShownAt());
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isEligible = useMemo(() => {
    if (!isMobile) return false;
    if (isStandalone) return false;
    if (neverShowAgain) return false;
    if (new Date().getTime() - lastShownAt < ONE_DAY_MS) return false;

    // Android/Chrome shows the native prompt only when `beforeinstallprompt` has fired.
    if (!isIos && !deferredPrompt) return false;

    return true;
  }, [deferredPrompt, isIos, isMobile, isStandalone, lastShownAt, neverShowAgain]);

  useEffect(() => {
    if (!isEligible) return;
    writeLastShownAt();
  }, [isEligible]);

  const dismiss = () => {
    const now = new Date().getTime();
    setLastShownAt(now);
    writeLastShownAt(now);
  };

  const dismissForever = () => {
    const now = new Date().getTime();
    setNeverShowAgain(true);
    writeNeverShow();
    setLastShownAt(now);
    writeLastShownAt(now);
  };

  const onInstallClick = async () => {
    if (isIos) {
      setShowIosHelp(true);
      return;
    }

    const choice = await promptInstall();

    if (choice) {
      dismiss();
    }
  };

  return (
    <>
      <IosInstallHelpModal open={showIosHelp} onClose={() => setShowIosHelp(false)} />

      <AnimatePresence>
        {isEligible ? (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{
              y: 100,
              opacity: 0,
              transition: { duration: 0.2, ease: 'easeInOut' },
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
              delay: 2.5,
            }}
            className={cn(
              'fixed left-4 right-4 z-[1100] mx-auto max-w-md',
              'bottom-[calc(env(safe-area-inset-bottom)+4rem+0.75rem)]',
              className
            )}
          >
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-white/10 bg-slate-800/70">
                <Image
                  src="/icons/icon-192x192.png"
                  alt={t('appIconAlt')}
                  fill
                  sizes="40px"
                  className="object-cover"
                  priority={false}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text">
                  {t('installTitle')}
                </div>
                <div className="truncate text-xs text-slate-300">
                  {t('installSubtitle')}
                </div>
                <button
                  type="button"
                  onClick={dismissForever}
                  className="mt-1 text-[11px] font-medium text-slate-400 underline decoration-slate-600/60 underline-offset-2 hover:text-slate-200"
                >
                  {t('dontShowAgain')}
                </button>
              </div>

              <button
                type="button"
                onClick={onInstallClick}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 active:scale-[0.98]"
              >
                {t('installButton')}
              </button>

              <button
                type="button"
                onClick={dismiss}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-900/60 text-slate-200 hover:bg-slate-800/60"
                aria-label={t('dismissLabel')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
