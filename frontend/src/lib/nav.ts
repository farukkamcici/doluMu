'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { locales } from '@/i18n/config';

const LOCALE_PREFIX = new RegExp(`^/(${locales.join('|')})(?=/|$)`);
const localeOf = (path: string) => LOCALE_PREFIX.exec(path)?.[1] ?? null;
const stripLocale = (path: string) => path.replace(LOCALE_PREFIX, '') || '/';

// In-app history of pathnames, so "back" can tell a deep link (go home) from in-app navigation,
// and can follow a language switch instead of returning to the page in the old language.
let previous: string | null = null;
let current: string | null = null;

export function useTrackNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    // A language switch replaces the URL in place; it is not a new page.
    if (current && stripLocale(current) === stripLocale(pathname)) {
      current = pathname;
      return;
    }
    previous = current;
    current = pathname;
  }, [pathname]);
}

/**
 * Where "back" should go: `null` means browser history is fine; a path (without locale) means
 * push that page in the current language (deep link, or the previous page is in another language).
 */
export function backTarget(): string | null {
  if (!previous) return '/';
  if (current && localeOf(previous) !== localeOf(current)) return stripLocale(previous);
  return null;
}
