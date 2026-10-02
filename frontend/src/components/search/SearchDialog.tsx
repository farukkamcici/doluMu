'use client';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Clock, Search, SearchX, X } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { LineBadge } from '@/components/transit/LineBadge';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useLine, useLineSearch } from '@/lib/queries';
import { foldForMatch, isMetroTopologyLine, modeOf, POPULAR_LINES, routeLabel } from '@/lib/lines';
import { usePrefs } from '@/store/prefs';
import { useMounted } from '@/hooks/useMounted';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLineName } from '@/hooks/useLineName';
import { useNetwork } from '@/hooks/useNetwork';
import { useBusRegistry, useBusStops } from '@/lib/live/client';
import { cn } from '@/lib/utils';

interface Row {
  code: string;
  typeId?: number;
  subtitle?: string;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Full-screen search on phones, command-palette style panel on larger screens. */
export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const t = useTranslations('search');
  const router = useRouter();
  const mounted = useMounted();
  const recents = usePrefs((s) => s.recents);
  const clearRecents = usePrefs((s) => s.clearRecents);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const debounced = useDebouncedValue(query.trim(), 200);
  const search = useLineSearch(debounced);
  const searching = debounced.length > 0;

  // Rail stations match by name too ("Bostancı" → M4, M8, Marmaray).
  const network = useNetwork();
  const stationHits = useMemo(() => {
    const q = foldForMatch(debounced);
    if (q.length < 3) return [];
    return network.stations.filter((s) => foldForMatch(s.name).includes(q)).slice(0, 4);
  }, [debounced, network.stations]);

  // İETT's live registry: hide bus lines that no longer run, add current lines the forecast DB lacks.
  const registry = useBusRegistry();
  const busStops = useBusStops(open && foldForMatch(debounced).length >= 3);
  const stopHits = useMemo(() => {
    const q = foldForMatch(debounced);
    if (q.length < 3 || !busStops.data) return [];
    return busStops.data.filter((s) => foldForMatch(s.name).includes(q)).slice(0, 4);
  }, [debounced, busStops.data]);

  const rows: Row[] = useMemo(() => {
    if (searching) {
      const live = registry.data ? new Map(registry.data.map((l) => [l.code, l])) : null;
      const fromApi: Row[] = (search.data ?? [])
        .filter((r) => r.transport_type_id !== 1 || !live || live.has(r.line_name))
        .map((r) => ({
          code: r.line_name,
          typeId: r.transport_type_id,
          subtitle: r.transport_type_id === 1 && live?.get(r.line_name)?.name ? routeLabel({ line: live.get(r.line_name)!.name }) : routeLabel(r),
        }));
      const seen = new Set(fromApi.map((r) => r.code));
      const q = foldForMatch(debounced);
      const extra: Row[] = (registry.data ?? [])
        .filter((l) => !seen.has(l.code) && !isMetroTopologyLine(l.code) && (foldForMatch(l.code).startsWith(q) || (q.length >= 3 && foldForMatch(l.name).includes(q))))
        .slice(0, 6)
        .map((l) => ({ code: l.code, typeId: 1, subtitle: routeLabel({ line: l.name }) }));
      return [...fromApi, ...extra];
    }
    const base = mounted && recents.length ? recents : POPULAR_LINES;
    return base.map((code) => ({ code }));
  }, [searching, search.data, mounted, recents, registry.data, debounced]);

  const setOpen = (next: boolean) => {
    if (!next) {
      setQuery('');
      setActive(0);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (code: string) => {
    setOpen(false);
    router.push(`/line/${encodeURIComponent(code)}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!rows.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(rows[active].code);
    }
  };

  const heading = searching
    ? null
    : mounted && recents.length
      ? t('recents')
      : t('suggestions');

  let content: ReactNode;
  if (searching && search.isLoading) {
    content = (
      <div className="space-y-2 p-2" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  } else if (searching && search.isError) {
    content = <p className="px-5 py-10 text-center text-sm text-fg-muted">{t('error')}</p>;
  } else if (searching && rows.length === 0 && stationHits.length === 0 && stopHits.length === 0 && search.isFetched) {
    content = (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <SearchX className="h-8 w-8 text-fg-subtle" />
        <p className="mt-3 font-medium">{t('noResults', { query: debounced })}</p>
        <p className="mt-1 text-sm text-fg-muted">{t('noResultsHint')}</p>
      </div>
    );
  } else {
    content = (
      <>
        {heading ? (
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <p className="eyebrow">{heading}</p>
            {mounted && recents.length && !searching ? (
              <button type="button" onClick={clearRecents} className="text-xs font-semibold underline underline-offset-4">
                {t('clearRecents')}
              </button>
            ) : null}
          </div>
        ) : null}
        {stationHits.length ? (
          <div className="border-b border-line px-2 pb-2 pt-3">
            <p className="eyebrow px-3 pb-1">{t('stations')}</p>
            <ul>
              {stationHits.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-md px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                    <Highlight text={s.name} query={debounced} />
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {s.lines.map((code) => (
                      <button key={code} type="button" onClick={() => go(code)} aria-label={code}>
                        <LineBadge code={code} size="sm" />
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {rows.length ? <p className="eyebrow px-3 pb-1 pt-3">{t('lines')}</p> : null}
          </div>
        ) : null}
        {stopHits.length ? (
          <div className="border-b border-line px-2 pb-2 pt-3">
            <p className="eyebrow px-3 pb-1">{t('stops')}</p>
            <ul>
              {stopHits.map((s) => (
                <li key={s.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/stop/${s.code}`);
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        <Highlight text={s.name} query={debounced} />
                      </span>
                      <span className="block truncate text-xs text-fg-muted">
                        {s.district} · {[...new Set(s.lines.map((l) => l.code))].slice(0, 8).join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul ref={listRef} role="listbox" id="search-results" aria-label={t('label')} className="p-2">
          {rows.map((row, index) => (
            <li key={row.code} id={`search-opt-${index}`} role="option" aria-selected={index === active} data-index={index}>
              <button
                type="button"
                tabIndex={-1}
                onMouseMove={() => setActive(index)}
                onClick={() => go(row.code)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left',
                  index === active ? 'bg-bg-subtle' : 'hover:bg-bg-subtle',
                )}
              >
                <RowContent row={row} query={debounced} />
                {!searching && mounted && recents.length ? <Clock className="h-4 w-4 text-fg-subtle" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 hidden bg-slate-950/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in sm:block" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'fixed z-50 flex flex-col bg-card text-fg focus:outline-none',
            'inset-0 data-[state=open]:animate-fade-in',
            'sm:inset-auto sm:left-1/2 sm:top-[10vh] sm:max-h-[75vh] sm:w-[min(92vw,36rem)] sm:-translate-x-1/2 sm:rounded-xl sm:border-[1.5px] sm:border-fg sm:shadow-pop',
          )}
        >
          <Dialog.Title className="sr-only">{t('label')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('placeholder')}</Dialog.Description>
          <div className="pt-safe border-b border-line">
            <div className="flex h-16 items-center gap-2 px-2 sm:px-4">
              <Dialog.Close
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-fg/5 sm:hidden"
                aria-label={t('cancel')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Dialog.Close>
              <Search className="hidden h-5 w-5 shrink-0 text-fg-subtle sm:block" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={t('placeholder')}
                aria-label={t('label')}
                role="combobox"
                aria-expanded
                aria-controls="search-results"
                aria-activedescendant={rows.length ? `search-opt-${active}` : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label={t('clear')}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-fg/5"
                >
                  <X className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">{content}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Search results carry their metadata; suggestions/recents fetch it (cached for a day). */
function RowContent({ row, query }: { row: Row; query: string }) {
  const tm = useTranslations('modes');
  const meta = useLine(row.subtitle ? null : row.code);
  const typeId = row.typeId ?? meta.data?.transport_type_id;
  const name = useLineName(row.code, meta.data ?? (row.subtitle ? { line: row.subtitle } : null));
  const subtitle = name || row.subtitle;
  return (
    <>
      <LineBadge code={row.code} typeId={typeId} />
      <span className="min-w-0 flex-1">
        {subtitle ? (
          <span className="block truncate text-sm text-fg">
            <Highlight text={subtitle} query={query} />
          </span>
        ) : (
          <Skeleton className="mb-1 h-4 w-40" />
        )}
        <span className="block text-xs text-fg-muted">{tm(modeOf(row.code, typeId))}</span>
      </span>
    </>
  );
}

/** Bolds the matched part of an upper-case ASCII route name, ignoring Turkish casing/diacritics. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = foldForMatch(query);
  if (!q) return <>{text}</>;
  const index = foldForMatch(text).indexOf(q);
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-bold text-fg underline decoration-2 underline-offset-2">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}
