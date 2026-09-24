import type { ReactNode } from 'react';

type Elevation = 'sm' | 'md' | 'lg';

interface CardProps {
  children: ReactNode;
  elevation?: Elevation;
  className?: string;
}

const elevations: Record<Elevation, string> = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
};

/** Tarjeta estándar del Portal TAEV: borde hairline. */
export function Card({ children, elevation = 'md', className = '' }: CardProps) {
  return (
    <div
      className={`rounded-none border border-(--color-border) bg-(--color-surface) p-6 ${elevations[elevation]} ${className}`}
    >
      {children}
    </div>
  );
}
