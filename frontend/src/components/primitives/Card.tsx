import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-y border-line bg-card', className)} {...props} />;
}

interface SectionProps {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

/** Titled content block used on the home and line pages. */
export function Section({ title, action, children, className, id }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)} aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
