import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Color = 'primary' | 'neutral' | 'danger';
type Variant = 'filled' | 'soft' | 'outlined' | 'flat';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: Color;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition ' +
  'disabled:opacity-45 disabled:cursor-not-allowed outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-(--color-primary)/40';

const sizes: Record<Size, string> = {
  sm: 'text-xs px-2.5 min-h-8',
  md: 'text-sm px-4 min-h-10',
};

const variants: Record<Color, Record<Variant, string>> = {
  primary: {
    filled: 'bg-(--color-primary) text-white hover:opacity-90',
    soft: 'bg-(--color-primary)/10 text-(--color-primary) hover:bg-(--color-primary)/15',
    outlined: 'border border-(--color-primary) text-(--color-primary) hover:bg-(--color-primary)/5',
    flat: 'text-(--color-primary) hover:bg-(--color-primary)/10',
  },
  neutral: {
    filled: 'bg-(--color-ink) text-white hover:opacity-90',
    soft: 'bg-(--color-surface-muted) text-(--color-ink) hover:bg-(--color-border)/50',
    outlined:
      'border border-(--color-border) bg-(--color-surface) text-(--color-ink) hover:border-(--color-primary)/40',
    flat: 'text-(--color-ink-muted) hover:bg-(--color-surface-muted)',
  },
  danger: {
    filled: 'bg-(--color-danger) text-white hover:opacity-90',
    soft: 'bg-(--color-danger)/10 text-(--color-danger) hover:bg-(--color-danger)/15',
    outlined: 'border border-(--color-danger) text-(--color-danger) hover:bg-(--color-danger)/5',
    flat: 'text-(--color-danger) hover:bg-(--color-danger)/10',
  },
};

export function Button({
  color = 'primary',
  variant = 'filled',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, sizes[size], variants[color][variant], fullWidth && 'w-full', className)}
      {...props}
    >
      {children}
    </button>
  );
}
