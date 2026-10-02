'use client';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@/components/primitives/Button';
import { canGoBack } from '@/lib/nav';

interface AppBarProps {
  title?: ReactNode;
  /** Show a back button; falls back to home when there is no history (deep link). */
  back?: boolean;
  actions?: ReactNode;
  className?: string;
}

export function AppBar({ title, back = true, actions, className }: AppBarProps) {
  const t = useTranslations('common');
  const router = useRouter();

  const goBack = () => {
    if (canGoBack()) router.back();
    else router.push('/');
  };

  return (
    <header
      className={cn(
        'pt-safe sticky top-0 z-30 bg-bg',
        className,
      )}
    >
      <div className="flex h-14 items-center gap-1 px-2 sm:px-3">
        {back ? (
          <Button variant="ghost" size="icon" onClick={goBack} aria-label={t('back')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1 truncate px-1 font-display text-xl font-bold">{title}</div>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>
    </header>
  );
}
