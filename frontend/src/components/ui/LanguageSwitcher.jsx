'use client';
import { useParams } from 'next/navigation';
import { useTransition } from 'react';
import { useRouter, usePathname } from '@/i18n/routing';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  
  const currentLocale = params.locale || 'tr';

  const switchLocale = (newLocale) => {
    startTransition(() => {
      router.replace(pathname, { locale: newLocale });
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-background/50 p-1 border border-white/10">
      <button
        onClick={() => switchLocale('tr')}
        disabled={isPending}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          currentLocale === 'tr'
            ? 'bg-primary text-white'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        TR
      </button>
      <button
        onClick={() => switchLocale('en')}
        disabled={isPending}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          currentLocale === 'en'
            ? 'bg-primary text-white'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        EN
      </button>
    </div>
  );
}
