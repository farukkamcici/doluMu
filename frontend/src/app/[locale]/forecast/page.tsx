import { redirect } from '@/i18n/routing';

// v1 favourites page; favourites now live on the home screen.
export default async function LegacyForecastPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/', locale });
}
