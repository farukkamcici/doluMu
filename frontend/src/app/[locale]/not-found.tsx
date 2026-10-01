import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { buttonVariants } from '@/components/primitives/Button';

export default async function NotFound() {
  const t = await getTranslations('errors');
  const tc = await getTranslations('common');
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl font-bold tracking-tight text-fg-subtle">404</p>
      <h1 className="mt-4 text-xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="mt-2 text-fg-muted">{t('notFoundBody')}</p>
      <Link href="/" className={buttonVariants({ variant: 'primary', className: 'mt-6' })}>
        {tc('home')}
      </Link>
    </main>
  );
}
