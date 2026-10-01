'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Search, Settings, Star } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { buttonVariants } from '@/components/primitives/Button';
import { Section } from '@/components/primitives/Card';
import { Notice } from '@/components/primitives/Notice';
import { Skeleton } from '@/components/primitives/Skeleton';
import { SearchDialog } from '@/components/search/SearchDialog';
import { POPULAR_LINES } from '@/lib/lines';
import { usePrefs } from '@/store/prefs';
import { useNow } from '@/hooks/useNow';
import { useMounted } from '@/hooks/useMounted';
import { ContextStrip } from './ContextStrip';
import { LineCard } from './LineCard';

export function HomeScreen() {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const now = useNow();
  const mounted = useMounted();
  const favorites = usePrefs((s) => s.favorites);
  const [searchOpen, setSearchOpen] = useState(false);

  // "/" opens search, like most web apps with a search-first home.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const favs = mounted ? favorites : [];
  const popular = POPULAR_LINES.filter((code) => !favs.includes(code));

  return (
    <>
      <header className="pt-safe">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg">
            <Image src="/icons/icon-192x192.png" alt="" width={32} height={32} className="rounded-[9px]" priority />
            <span className="text-lg font-bold tracking-tight">DoluMu</span>
          </Link>
          <Link href="/settings" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={tc('settings')}>
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 pb-16 pt-4 sm:px-6 sm:pt-8">
        <div className="space-y-5">
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-4xl">{t('title')}</h1>
            <p className="mt-1.5 text-fg-muted sm:text-lg">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-14 w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 text-left shadow-card transition-colors hover:border-fg/20 sm:max-w-xl"
          >
            <Search className="h-5 w-5 shrink-0 text-fg-muted" />
            <span className="flex-1 truncate text-fg-subtle">{t('searchPlaceholder')}</span>
            <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-xs text-fg-subtle sm:inline">/</kbd>
          </button>
          <div className="sm:max-w-xl">
            <ContextStrip />
          </div>
        </div>

        <Section title={t('favorites')} id="favorites">
          {!mounted ? (
            <Skeleton className="h-[118px] rounded-2xl sm:max-w-[calc(50%-0.375rem)]" />
          ) : favs.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              {favs.map((code) => (
                <LineCard key={code} code={code} now={now} />
              ))}
            </div>
          ) : (
            <Notice icon={<Star className="h-5 w-5" />} title={t('emptyFavoritesTitle')}>
              {t('emptyFavoritesBody')}
            </Notice>
          )}
        </Section>

        <Section title={t('popular')} id="popular">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {popular.map((code) => (
              <LineCard key={code} code={code} now={now} />
            ))}
          </div>
        </Section>

        <p className="text-xs leading-relaxed text-fg-subtle">
          {tc('notLive')}{' '}
          <Link href="/settings#about" className="font-medium text-brand hover:underline">
            {tc('howItWorks')}
          </Link>
        </p>
      </main>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
