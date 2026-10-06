import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { EmailLink, LegalBlock, LegalPage } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/lib/app';

type Props = { params: Promise<{ locale: string }> };
type Question = { q: string; a: string };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.support' });
  return { title: t('title') };
}

/** The App Store listing's Support URL. */
export default async function SupportPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.support');
  const questions = t.raw('questions') as Question[];
  return (
    <LegalPage title={t('title')} lead={t('intro')}>
      <LegalBlock title={t('email')}>
        <p>
          <EmailLink email={CONTACT_EMAIL} />
        </p>
        <Link href="/settings" className="flex items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-fg">{t('report')}</span>
            <span className="block">{t('reportDesc')}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-fg-subtle" />
        </Link>
      </LegalBlock>
      <LegalBlock title={t('faq')}>
        {questions.map((item) => (
          <div key={item.q}>
            <p className="font-medium text-fg">{item.q}</p>
            <p>{item.a}</p>
          </div>
        ))}
      </LegalBlock>
      <div className="px-4 sm:px-5">
        <Link href="/privacy" className="text-sm font-medium underline underline-offset-4">
          {t('privacy')}
        </Link>
      </div>
    </LegalPage>
  );
}
