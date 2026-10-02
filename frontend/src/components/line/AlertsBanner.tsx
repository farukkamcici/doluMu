'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Sheet } from '@/components/primitives/Sheet';
import type { LineStatus } from '@/lib/api';

/** IETT service notices. Out-of-service state is shown in the "now" card instead. */
export function AlertsBanner({ status, code }: { status: LineStatus | undefined; code: string }) {
  const t = useTranslations('line.status');
  const [open, setOpen] = useState(false);

  if (status?.status !== 'WARNING' || !status.alerts.length) return null;
  const [first] = status.alerts;
  const many = status.alerts.length > 1 || first.text.length > 140;

  return (
    <>
      <button
        type="button"
        disabled={!many}
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-3 border-l-4 border-signal bg-warn-soft px-4 py-3 text-left text-sm disabled:cursor-default"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-fg">{t('warning')}</span>
          <span className="line-clamp-2 text-fg-muted">{first.text}</span>
        </span>
        {many ? (
          <span className="flex shrink-0 items-center gap-0.5 self-center text-xs font-medium text-fg-muted">
            {t('alerts', { count: status.alerts.length })}
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : null}
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={`${code} · ${t('alerts', { count: status.alerts.length })}`}>
        <ul className="space-y-3 pb-4">
          {status.alerts.map((alert, i) => (
            <li key={i} className="rounded-xl bg-bg-subtle p-4 text-sm leading-relaxed">
              {alert.time ? <p className="mb-1 text-xs text-fg-subtle">{alert.time}</p> : null}
              {alert.text}
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
