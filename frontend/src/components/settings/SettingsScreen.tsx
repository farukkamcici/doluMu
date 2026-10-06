'use client';
import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { ChevronRight } from 'lucide-react';
import { AppBar } from '@/components/app/AppBar';
import { Card } from '@/components/primitives/Card';
import { Segmented } from '@/components/primitives/Segmented';
import { Button } from '@/components/primitives/Button';
import { Sheet } from '@/components/primitives/Sheet';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { usePrefs } from '@/store/prefs';
import { useMounted } from '@/hooks/useMounted';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { APP_VERSION } from '@/lib/app';
import { ReportSheet } from './ReportSheet';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const td = useTranslations('line.details');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const { state: installState, install } = usePwaInstall();
  const [reportOpen, setReportOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const favorites = usePrefs((s) => s.favorites);
  const recents = usePrefs((s) => s.recents);
  const clearFavorites = usePrefs((s) => s.clearFavorites);
  const clearRecents = usePrefs((s) => s.clearRecents);

  return (
    <>
      <AppBar title={t('title')} />
      <main className="mx-auto max-w-2xl space-y-7 pb-16 pt-2">
        <Group title={t('appearance')}>
          <Row label={t('language')}>
            <Segmented
              className="w-44"
              size="sm"
              label={t('language')}
              value={locale}
              onChange={(next) => router.replace(pathname, { locale: next })}
              options={[
                { value: 'tr', label: 'Türkçe' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Row>
          <Row label={t('theme')}>
            <Segmented
              className="w-56"
              size="sm"
              label={t('theme')}
              value={mounted ? (theme ?? 'system') : 'system'}
              onChange={setTheme}
              options={[
                { value: 'system', label: t('themeSystem') },
                { value: 'light', label: t('themeLight') },
                { value: 'dark', label: t('themeDark') },
              ]}
            />
          </Row>
        </Group>

        <Group title={t('app')}>
          <Row label={t('install')} description={t('installDesc')}>
            {installState === 'installed' ? (
              <span className="text-sm font-medium text-fg-muted">{t('installed')}</span>
            ) : installState === 'prompt' ? (
              <Button size="sm" variant="primary" onClick={install}>
                {t('installAction')}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setHowToOpen(true)}>
                {t('installHowTo')}
              </Button>
            )}
          </Row>
        </Group>

        <Group title={t('support')}>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-card-hover sm:px-5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t('report')}</span>
              <span className="block text-sm text-fg-muted">{t('reportDesc')}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-fg-subtle" />
          </button>
          <LinkRow href="/support" label={t('supportPage')} />
          <LinkRow href="/privacy" label={t('privacy')} />
        </Group>

        <Group title={t('data')} description={t('dataDesc')}>
          <Row label={t('clearFavorites')} description={t('count', { count: mounted ? favorites.length : 0 })}>
            <ConfirmButton disabled={!mounted || !favorites.length} onConfirm={clearFavorites} />
          </Row>
          <Row label={t('clearRecents')} description={t('count', { count: mounted ? recents.length : 0 })}>
            <ConfirmButton disabled={!mounted || !recents.length} onConfirm={clearRecents} />
          </Row>
        </Group>

        <section id="about" className="scroll-mt-20">
          <Group title={t('about')}>
            <div className="space-y-4 px-4 py-4 text-sm leading-relaxed text-fg-muted sm:px-5">
              <p>{t('aboutBody')}</p>
              <p>{td('body')}</p>
              <p>{td('relative')}</p>
              <div>
                <p className="mb-1 font-medium text-fg">{t('sources')}</p>
                <p>{t('sourcesBody')}</p>
              </div>
              <p className="text-xs text-fg-subtle">{t('version', { version: APP_VERSION })}</p>
            </div>
          </Group>
        </section>
      </main>

      <ReportSheet open={reportOpen} onOpenChange={setReportOpen} />
      <Sheet
        open={howToOpen}
        onOpenChange={setHowToOpen}
        title={installState === 'ios' ? t('iosTitle') : t('otherBrowserTitle')}
      >
        {installState === 'ios' ? (
          <ol className="space-y-3 pb-6">
            {(['iosStep1', 'iosStep2', 'iosStep3'] as const).map((key, i) => (
              <li key={key} className="flex items-start gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fg font-display text-sm font-bold text-bg">
                  {i + 1}
                </span>
                <span className="pt-0.5">{t(key)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="pb-6 text-sm text-fg-muted">{t('otherBrowserBody')}</p>
        )}
      </Sheet>
    </>
  );
}

function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h2 className="eyebrow px-4 sm:px-5">{title}</h2>
      {description ? <p className="px-4 text-sm text-fg-muted sm:px-5">{description}</p> : null}
      <Card className="divide-y divide-line overflow-hidden">{children}</Card>
    </div>
  );
}

function LinkRow({ href, label }: { href: '/support' | '/privacy'; label: string }) {
  return (
    <Link href={href} className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-card-hover sm:px-5">
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-5 w-5 text-fg-subtle" />
    </Link>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Two-step destructive action: first tap arms it, second tap confirms. */
function ConfirmButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const t = useTranslations('settings');
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return <span className="text-sm text-fg-muted">{t('cleared')}</span>;
  return (
    <Button
      size="sm"
      variant={armed ? 'primary' : 'secondary'}
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        onConfirm();
        setDone(true);
      }}
      className={armed ? 'bg-danger text-white hover:bg-danger/90' : undefined}
    >
      {armed ? t('confirmClear') : t('clear')}
    </Button>
  );
}
