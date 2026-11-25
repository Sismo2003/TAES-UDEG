/** Redacción y formato compartidos por las secciones de Estadísticas. */
import type { AllocationPhase, StudentRow } from '../backend/connection';

const NUMBER = new Intl.NumberFormat('es-MX');

export const formatNumber = (n: number) => NUMBER.format(n);

/** `plural(1, 'lugar', 'lugares')` → "1 lugar". */
export function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export type BalanceKind = 'short' | 'surplus' | 'exact';

export function balanceKind(value: number): BalanceKind {
  return value < 0 ? 'short' : value > 0 ? 'surplus' : 'exact';
}

/** Negativo = "Faltan N lugares" · positivo = "Sobran N lugares". */
export function balanceText(value: number, { unit = true } = {}): string {
  const n = Math.abs(value);
  if (value === 0) return 'Exacto';
  const verb = value < 0 ? (n === 1 ? 'Falta' : 'Faltan') : n === 1 ? 'Sobra' : 'Sobran';
  return unit ? `${verb} ${plural(n, 'lugar', 'lugares')}` : `${verb} ${formatNumber(n)}`;
}

export const PHASE_LABEL: Record<AllocationPhase, string> = {
  before: 'Antes de asignar',
  partial: 'Asignación incompleta',
  after: 'Ya se asignó',
};

export const NO_GROUP_LABEL = 'Sin grupo';

/** Misma regla que el Backend: grupo, si no programa, si no "Sin grupo". */
export function schoolGroupName(row: Pick<StudentRow, 'studentSemesterLabel' | 'career'>): string {
  return row.studentSemesterLabel?.trim() || row.career?.trim() || NO_GROUP_LABEL;
}
