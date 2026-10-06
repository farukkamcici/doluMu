import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmailLink, LegalBlock, LegalPage } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/lib/app';

type Props = { params: Promise<{ locale: string }> };
type Section = { title: string; body: string[] };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  return { title: t('title') };
}

/** Linked from the iOS app's Settings and its App Store listing, so it must stay at this path. */
export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.privacy');
  const sections = t.raw('sections') as Section[];
  return (
    <LegalPage title={t('title')} lead={t('updated')}>
      {sections.map((s) => (
        <LegalBlock key={s.title} title={s.title}>
          {s.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </LegalBlock>
      ))}
      <LegalBlock title={t('contact')}>
        <p>
          {t('contactBody')} <EmailLink email={CONTACT_EMAIL} />
        </p>
      </LegalBlock>
    </LegalPage>
  );
}
