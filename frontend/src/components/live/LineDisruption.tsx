'use client';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { useLineDisruptions } from './outages';

/** Metro İstanbul's live notice for this line (partial closures, works…). */
export function LineDisruption({ code }: { code: string }) {
  const t = useTranslations('live');
  const disruptions = useLineDisruptions(code);
  if (!disruptions.length) return null;
  return (
    <div className="space-y-2 border-b border-line bg-warn-soft px-4 py-3 sm:px-5">
      {disruptions.map((d) => (
        <div key={d.line + d.message} className="flex gap-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
          <div>
            <p className="font-semibold text-fg">{t('disruption')}</p>
            <p className="text-fg-muted">{d.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
