import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Color = 'primary' | 'neutral';
type Variant = 'filled' | 'soft' | 'outlined' | 'flat';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: Color;
  variant?: Variant;
  isGlow?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium text-sm transition disabled:opacity-45 disabled:cursor-not-allowed';

const variants: Record<Color, Record<Variant, string>> = {
  primary: {
    filled: 'bg-(--color-primary) text-white hover:opacity-90',
    soft: 'bg-(--color-primary)/10 text-(--color-primary) hover:bg-(--color-primary)/15',
    outlined: 'border border-(--color-primary) text-(--color-primary) hover:bg-(--color-primary)/5',
    flat: 'text-(--color-primary) hover:bg-(--color-primary)/10',
  },
  neutral: {
    filled: 'bg-(--color-ink) text-white hover:opacity-90',
    soft: 'bg-(--color-surface-muted) text-(--color-ink) hover:bg-(--color-border)/40',
    outlined: 'border border-(--color-border) text-(--color-ink) hover:border-(--color-primary)/40',
    flat: 'text-(--color-ink-muted) hover:bg-(--color-surface-muted)',
  },
};

export function Button({
  color = 'primary',
  variant = 'filled',
  isGlow = false,
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const classes = [
    base,
    variants[color][variant],
    'px-5 py-3',
    fullWidth ? 'w-full' : '',
    isGlow ? 'shadow-[0_0_24px_-6px_var(--color-primary)]' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
