import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:bg-brand/90',
        secondary: 'border border-line bg-card text-fg hover:bg-card-hover',
        soft: 'bg-brand-soft text-brand hover:bg-brand-soft/80',
        ghost: 'text-fg-muted hover:bg-fg/5 hover:text-fg',
      },
      size: {
        sm: 'h-9 rounded-xl px-3 text-sm',
        md: 'h-11 rounded-xl px-4 text-sm',
        lg: 'h-12 rounded-2xl px-5 text-base',
        icon: 'h-11 w-11 rounded-full',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
