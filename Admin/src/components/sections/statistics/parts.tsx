/** Piezas compartidas por las secciones de Estadísticas. */
import type { ReactNode } from 'react';
import { CircleCheck, Equal, TriangleAlert, type LucideIcon } from 'lucide-react';
import { balanceKind, balanceText, type BalanceKind } from '../../../lib/statistics';
import { cn } from '../../../lib/cn';

export const BALANCE_STYLE: Record<
  BalanceKind,
  { icon: LucideIcon; text: string; chip: string; surface: string }
> = {
  short: {
    icon: TriangleAlert,
    text: 'text-(--color-danger-ink)',
    chip: 'bg-(--color-danger)/10 text-(--color-danger-ink)',
    surface: 'border-(--color-danger)/50',
  },
  surplus: {
    icon: CircleCheck,
    text: 'text-(--color-success-ink)',
    chip: 'bg-(--color-success)/10 text-(--color-success-ink)',
    surface: 'border-(--color-success)/40',
  },
  exact: {
    icon: Equal,
    text: 'text-(--color-ink)',
    chip: 'bg-(--color-surface-sunken) text-(--color-ink)',
    surface: 'border-(--color-border)',
  },
};

/** "Faltan N" / "Sobran N" / "Exacto" — palabra + ícono, nunca sólo color. */
export function BalanceChip({ value, unit = false }: { value: number; unit?: boolean }) {
  const { icon: Icon, chip } = BALANCE_STYLE[balanceKind(value)];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap',
        chip,
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {balanceText(value, { unit })}
    </span>
  );
}

export function SectionHeading({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-(--color-ink) text-xs font-bold text-white"
      >
        {step}
      </span>
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-bold tracking-tight">{title}</h3>
        {children && <p className="text-sm text-(--color-ink-muted) mt-0.5">{children}</p>}
      </div>
    </div>
  );
}

export function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-3 rounded-sm', swatch)} />
      {label}
    </span>
  );
}
