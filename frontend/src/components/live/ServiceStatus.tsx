'use client';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Sheet } from '@/components/primitives/Sheet';
import { LineBadge } from '@/components/transit/LineBadge';
import { useMetroStatus } from '@/lib/live/client';
import { forecastCode } from '@/lib/network';
import type { EquipmentOutage } from '@/lib/live/types';

/** Home: live rail disruptions, lift/escalator outages and Metro İstanbul announcements. */
export function ServiceStatus() {
  const t = useTranslations('live');
  const locale = useLocale();
  const status = useMetroStatus();
  const [open, setOpen] = useState(false);
  const data = status.data;

  const byStation = useMemo(() => {
    const groups = new Map<string, EquipmentOutage[]>();
    for (const o of data?.equipment?.outages ?? []) {
      const key = `${o.line}|${o.station}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'tr'));
  }, [data]);

  if (status.isError && !data) return null;
  const broken = (kind: string) => data?.equipment?.totals.find((x) => x.kind === kind)?.broken ?? 0;
  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso)) : '';

  return (
    <section aria-labelledby="status" className="pt-6">
      <h2 id="status" className="eyebrow px-4 pb-2 sm:px-5">
        {t('statusTitle')}
      </h2>
      <div className="border-y border-line bg-card">
        {!data ? (
          <div className="h-14 animate-pulse bg-fg/[0.04]" />
        ) : (
          <>
            {data.disruptions.length ? (
              data.disruptions.map((d) => (
                <Link
                  key={d.line}
                  href={`/line/${forecastCode(d.line)}`}
                  className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-card-hover sm:px-5"
                >
                  <LineBadge code={d.line} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-signal">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t('disruption')}
                    </span>
                    <span className="line-clamp-2 text-sm text-fg-muted">{d.message}</span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm sm:px-5">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {t('allClear')}
              </p>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-card-hover sm:px-5"
            >
              <span className="min-w-0 flex-1 truncate">
                {data.equipment
                  ? t('equipmentSummary', { lifts: broken('lift'), escalators: broken('escalator') })
                  : t('announcements')}
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-fg-muted">
                {t('seeAll')}
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          </>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen} title={t('statusTitle')} description={t('source')}>
        <div className="-mx-5 pb-6">
          {data?.announcements.length ? (
            <>
              <p className="eyebrow px-5 pb-1">{t('announcements')}</p>
              <ul className="border-y border-line">
                {data.announcements.map((a) => (
                  <li key={a.id} className="border-b border-line px-5 py-3 last:border-b-0">
                    <p className="text-xs text-fg-subtle">{date(a.date)}</p>
                    <p className="font-semibold">{a.title}</p>
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-fg-muted">{a.body}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {byStation.length ? (
            <>
              <p className="eyebrow px-5 pb-1 pt-5">{t('equipmentTitle')}</p>
              <ul className="border-y border-line">
                {byStation.map(([key, items]) => (
                  <li key={key} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0">
                    <LineBadge code={items[0].line} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{items[0].station}</span>
                    <span className="shrink-0 text-xs text-fg-muted">
                      {items.map((o) => t(`kinds.${o.kind}`)).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </Sheet>
    </section>
  );
}
