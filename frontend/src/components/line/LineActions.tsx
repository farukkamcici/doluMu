'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Share2, Star } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { usePrefs } from '@/store/prefs';
import { useMounted } from '@/hooks/useMounted';
import { cn } from '@/lib/utils';

export function FavoriteButton({ code }: { code: string }) {
  const t = useTranslations('line');
  const mounted = useMounted();
  const isFavorite = usePrefs((s) => s.favorites.includes(code));
  const toggle = usePrefs((s) => s.toggleFavorite);
  const active = mounted && isFavorite;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-pressed={active}
      aria-label={active ? t('favoriteRemove') : t('favoriteAdd')}
      onClick={() => toggle(code)}
      className={cn(active && 'text-signal hover:text-signal')}
    >
      <Star className="h-5 w-5" fill={active ? 'currentColor' : 'none'} />
    </Button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const t = useTranslations('line');
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Unsupported payload: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  };

  return (
    <Button variant="ghost" size="icon" onClick={share} aria-label={copied ? t('linkCopied') : t('share')}>
      {copied ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
      <span className="sr-only" aria-live="polite">
        {copied ? t('linkCopied') : ''}
      </span>
    </Button>
  );
}
