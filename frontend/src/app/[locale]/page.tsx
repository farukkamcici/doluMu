import { setRequestLocale } from 'next-intl/server';
import { HomeScreen } from '@/components/home/HomeScreen';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeScreen />;
}
