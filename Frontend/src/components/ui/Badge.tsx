import type { ReactNode } from 'react';

type BadgeTone = 'accent' | 'accent-2' | 'neutral' | 'outline';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const tones: Record<BadgeTone, string> = {
  accent: 'bg-(--color-primary)/10 text-(--color-primary)',
  'accent-2': 'bg-(--color-accent)/10 text-(--color-accent)',
  neutral: 'bg-(--color-surface-muted) text-(--color-ink-muted)',
  outline: 'border border-(--color-primary) text-(--color-primary)',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
