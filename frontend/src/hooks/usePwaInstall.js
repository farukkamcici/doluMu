'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function detectIos() {
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;

  const isIPhoneIPadIPod = /iPad|iPhone|iPod/.test(ua);
  const isIPadOs13Plus = platform === 'MacIntel' && maxTouchPoints > 1;

  return isIPhoneIPadIPod || isIPadOs13Plus;
}

function detectStandalone() {
  if (typeof window === 'undefined') return false;

  // iOS Safari exposes navigator.standalone when launched from home screen.
  const isIosStandalone =
    typeof window.navigator !== 'undefined' && window.navigator.standalone === true;

  const isDisplayModeStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;

  return isIosStandalone || isDisplayModeStandalone;
}

export default function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsIos(detectIos());
    setIsStandalone(detectStandalone());

    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;

    const onDisplayModeChange = () => setIsStandalone(detectStandalone());

    mql?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      mql?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const onAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null;

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      return choice;
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return useMemo(
    () => ({
      isIos,
      isStandalone,
      deferredPrompt,
      promptInstall,
    }),
    [deferredPrompt, isIos, isStandalone, promptInstall]
  );
}
