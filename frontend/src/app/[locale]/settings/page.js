'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import BottomNav from '@/components/ui/BottomNav';
import PageHeader from '@/components/ui/PageHeader';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import ReportForm from '@/components/settings/ReportForm';
import IosInstallHelpModal from '@/components/ui/IosInstallHelpModal';
import useMediaQuery from '@/hooks/useMediaQuery';
import usePwaInstall from '@/hooks/usePwaInstall';
import useAppStore from '@/store/useAppStore';
import { 
  Globe, 
  Moon, 
  Database, 
  Trash2, 
  RefreshCw, 
  MessageSquare, 
  Info, 
  Star,
  Shield,
  Heart,
  Download,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

function SettingSection({ title, description, icon: Icon, children }) {
  return (
    <section className="mx-4 mb-4 overflow-hidden rounded-3xl border border-white/10 bg-surface/70 shadow-lg backdrop-blur-md">
      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
        <div className="shrink-0 rounded-2xl border border-primary/25 bg-primary/10 p-2.5">
          <Icon size={18} className="text-secondary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-gray-400">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="px-2 pb-2">
        <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-background/25">
          {children}
        </div>
      </div>
    </section>
  );
}

function SettingItem({ icon: Icon, label, description, value, action, danger }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'shrink-0 rounded-xl border p-2',
            danger
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-white/10 bg-slate-900/40'
          )}
        >
          <Icon size={16} className={cn(danger ? 'text-red-400' : 'text-secondary')} />
        </div>
        <div className="min-w-0">
          <div className={cn('truncate text-sm font-medium', danger ? 'text-red-400' : 'text-text')}>
            {label}
          </div>
          {description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {value ? <span className="text-xs text-gray-400">{value}</span> : null}
        {action}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tpwa = useTranslations('pwa');
  const [showReportForm, setShowReportForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const favorites = useAppStore((state) => state.favorites);
  const setAlertMessage = useAppStore((state) => state.setAlertMessage);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { isIos, isStandalone, deferredPrompt, promptInstall } = usePwaInstall();

  const handleClearFavorites = () => {
    if (favorites.length === 0) {
      alert(t('noFavorites'));
      return;
    }
    
    setShowConfirm('favorites');
  };

  const handleResetApp = () => {
    setShowConfirm('reset');
  };

  const confirmClearFavorites = () => {
    try {
      localStorage.removeItem('ibb-transport-storage');
      useAppStore.persist.clearStorage();
      setShowConfirm(null);
      alert(t('favoritesCleared'));
      window.location.reload();
    } catch (error) {
      console.error('Error clearing favorites:', error);
      alert(t('errorClearing'));
    }
  };

  const confirmResetApp = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            caches.delete(name);
          });
        });
      }
      
      setShowConfirm(null);
      window.location.reload();
    } catch (error) {
      console.error('Error resetting app:', error);
      alert(t('errorResetting'));
    }
  };

  return (
    <>
      <main className="relative flex min-h-screen flex-col bg-background pb-20 font-sans text-text">
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={Settings} />

        <div className="pt-4">
          <SettingSection
            title={t('preferences')}
            description={t('preferencesDesc')}
            icon={Globe}
          >
            <SettingItem
              icon={Globe}
              label={t('language')}
              action={<LanguageSwitcher />}
            />
            <SettingItem
              icon={Moon}
              label={t('theme')}
              value="Dark"
              description={t('themeDesc')}
            />

            {isMobile && !isStandalone ? (
              <SettingItem
                icon={Download}
                label={t('installApp')}
                description={t('installAppDesc')}
                action={
                  <button
                    onClick={async () => {
                      if (isIos) {
                        setShowIosHelp(true);
                        return;
                      }

                      if (!deferredPrompt) {
                        setAlertMessage(t('installUnavailable'));
                        return;
                      }

                      await promptInstall();
                    }}
                    className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                  >
                    {tpwa('installButton')}
                  </button>
                }
              />
            ) : null}
          </SettingSection>

          <SettingSection
            title={t('dataStorage')}
            description={t('dataStorageDesc')}
            icon={Database}
          >
            <SettingItem
              icon={Star}
              label={t('clearFavorites')}
              description={`${favorites.length} ${t('savedLines')}`}
              action={
                <button
                  onClick={handleClearFavorites}
                  disabled={favorites.length === 0}
                  className={cn(
                    'inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                    favorites.length === 0
                      ? 'cursor-not-allowed border-white/5 bg-background/10 text-gray-500'
                      : 'border-white/10 bg-background/30 text-gray-200 hover:bg-white/5'
                  )}
                  aria-label={t('clearFavorites')}
                >
                  <Trash2 size={14} />
                </button>
              }
            />
            <SettingItem
              icon={RefreshCw}
              label={t('resetApp')}
              description={t('resetAppDesc')}
              danger
              action={
                <button
                  onClick={handleResetApp}
                  className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  {t('reset')}
                </button>
              }
            />
          </SettingSection>

          <SettingSection
            title={t('supportFeedback')}
            description={t('supportDesc')}
            icon={MessageSquare}
          >
            <SettingItem
              icon={Heart}
              label={t('aboutProject')}
              description={t('aboutDesc')}
            />
            <SettingItem
              icon={MessageSquare}
              label={t('reportIssue')}
              description={t('reportDesc')}
              action={
                <button
                  onClick={() => setShowReportForm(true)}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                >
                  {t('report')}
                </button>
              }
            />
            <SettingItem icon={Shield} label={t('dataSource')} value="IBB Open Data" />
            <SettingItem icon={Info} label={t('version')} value="v1.0.0 (MVP)" />
          </SettingSection>

          <div className="mt-2 px-6 pb-6 text-center">
            <p className="text-xs text-gray-500">
              {t('footer')}
              <br />
              {t('footerTagline')}
            </p>
          </div>
        </div>

        <BottomNav />
      </main>

      <IosInstallHelpModal open={showIosHelp} onClose={() => setShowIosHelp(false)} />

      {showReportForm && (
        <ReportForm onClose={() => setShowReportForm(false)} />
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl border border-white/10 p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">
              {showConfirm === 'favorites' 
                ? t('confirmClearFavorites')
                : t('confirmResetApp')
              }
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {showConfirm === 'favorites'
                ? t('confirmClearFavoritesDesc')
                : t('confirmResetAppDesc')
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-background border border-white/10 text-gray-400 hover:bg-white/5 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={showConfirm === 'favorites' ? confirmClearFavorites : confirmResetApp}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
