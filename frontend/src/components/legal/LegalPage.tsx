import type { ReactNode } from 'react';
import { AppBar } from '@/components/app/AppBar';
import { Card } from '@/components/primitives/Card';

/** Plain reading page (privacy, support): titled blocks in the settings screen's visual language. */
export function LegalPage({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <>
      <AppBar title={title} />
      <main className="mx-auto max-w-2xl space-y-7 pb-16 pt-2">
        <h1 className="sr-only">{title}</h1>
        {lead ? <p className="px-4 text-sm text-fg-muted sm:px-5">{lead}</p> : null}
        {children}
      </main>
    </>
  );
}

export function LegalBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="eyebrow px-4 sm:px-5">{title}</h2>
      <Card>
        <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-fg-muted sm:px-5">{children}</div>
      </Card>
    </section>
  );
}

export function EmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="font-medium text-fg underline underline-offset-4">
      {email}
    </a>
  );
}
