import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BadgeTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger' | 'outline';

const tones: Record<BadgeTone, string> = {
  accent: 'bg-(--color-primary)/10 text-(--color-primary)',
  neutral: 'bg-(--color-surface-muted) text-(--color-ink-muted)',
  success: 'bg-(--color-success)/10 text-(--color-success)',
  warning: 'bg-(--color-warning)/15 text-(--color-warning-ink)',
  danger: 'bg-(--color-danger)/10 text-(--color-danger)',
  outline: 'border border-(--color-border) text-(--color-ink-muted)',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
