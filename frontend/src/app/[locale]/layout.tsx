import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Barlow, Barlow_Semi_Condensed } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Analytics } from '@vercel/analytics/react';
import { locales } from '@/i18n/config';
import Providers from '@/components/app/Providers';
import '../globals.css';

// DIN-like grotesque, close to transit wayfinding type; condensed cut for line codes and numbers.
const sans = Barlow({ variable: '--font-sans', subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'] });
const display = Barlow_Semi_Condensed({
  variable: '--font-display',
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
});

type Params = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return {
    title: { default: t('title'), template: '%s · DoluMu' },
    description: t('description'),
    applicationName: 'DoluMu',
    manifest: '/manifest.json',
    appleWebApp: { capable: true, title: 'DoluMu', statusBarStyle: 'default' },
    icons: {
      icon: [
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    alternates: { languages: { tr: '/tr', en: '/en' } },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#efede7' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e0f' },
  ],
};

export default async function RootLayout({ children, params }: Params & { children: ReactNode }) {
  const { locale } = await params;
  if (!(locales as string[]).includes(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} font-sans`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
