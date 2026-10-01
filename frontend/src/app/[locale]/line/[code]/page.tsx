import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LineScreen } from '@/components/line/LineScreen';

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: 'line.chart' });
  const line = decodeURIComponent(code);
  return { title: `${line} · ${t('title')}` };
}

export default async function LinePage({ params }: Props) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const line = decodeURIComponent(code);
  return (
    <Suspense>
      <LineScreen key={line} code={line} />
    </Suspense>
  );
}
