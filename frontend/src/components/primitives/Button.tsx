import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-fg text-bg hover:bg-fg/85',
        secondary: 'border-[1.5px] border-fg bg-transparent text-fg hover:bg-fg/5',
        soft: 'bg-brand-soft text-fg hover:bg-brand-soft/80',
        ghost: 'text-fg hover:bg-fg/5',
      },
      size: {
        sm: 'h-9 rounded-md px-3 text-sm font-semibold',
        md: 'h-11 rounded-md px-4 text-sm font-semibold',
        lg: 'h-12 rounded-md px-5 text-base font-semibold',
        icon: 'h-11 w-11 rounded-md',
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
