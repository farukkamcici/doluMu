import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StopScreen } from '@/components/stop/StopScreen';

type Props = { params: Promise<{ locale: string; code: string }> };

// No stops are built ahead: each page is rendered on its first visit and then served from the cache
// (the screen loads its data in the browser), instead of rendering on every request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: 'stop' });
  return { title: `${t('title')} ${decodeURIComponent(code)}` };
}

export default async function StopPage({ params }: Props) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const stop = decodeURIComponent(code);
  return (
    <Suspense>
      <StopScreen key={stop} code={stop} />
    </Suspense>
  );
}
