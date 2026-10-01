'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { SearchDialog } from './SearchDialog';

/** App-bar search entry for screens other than home. */
export function SearchButton() {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t('label')}>
        <Search className="h-5 w-5" />
      </Button>
      <SearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
