/**
 * Por qué falló cada preferencia de un alumno que quedó sin lugar.
 *
 * El allocator no guarda el motivo: sólo deja el envío en `unplaced`. Pero el
 * motivo se deduce del estado ACTUAL de la oferta, que el panel ya tiene en
 * `overview.offerings` — y esa es justamente la información útil, porque el
 * admin no quiere saber por qué falló hace diez minutos sino qué puede hacer
 * ahora: si un grupo se liberó, colocarlo ahí; si la asignatura está apagada,
 * activarla en Oferta y grupos.
 */
import type { Overview } from '../backend/connection';

/** `'con-lugar'` no es un fallo: es "ya hay cupo, colocalo en su preferencia". */
export type PreferenceReason = 'llena' | 'inactiva' | 'con-lugar';

export interface OfferingSeats {
  isActive: boolean;
  /** Lugares libres sumando SÓLO los grupos activos. */
  freeSeats: number;
}

export type OfferingIndex = Map<number, OfferingSeats>;

/** Índice `semesterSubjectId → cupo libre`, para no recorrer la oferta por fila. */
export function buildOfferingIndex(overview: Overview | null): OfferingIndex {
  const index: OfferingIndex = new Map();
  if (!overview) return index;

  for (const offering of overview.offerings) {
    const freeSeats = offering.groups
      .filter((g) => g.isActive)
      .reduce((sum, g) => sum + Math.max(0, g.capacity - g.assignedCount), 0);
    index.set(offering.semesterSubjectId, { isActive: offering.isActive, freeSeats });
  }
  return index;
}

/**
 * `null` cuando la preferencia no está en el índice (oferta retirada del
 * semestre): no hay nada honesto que decir, mejor no mostrar badge.
 */
export function reasonFor(semesterSubjectId: number, index: OfferingIndex): PreferenceReason | null {
  const offering = index.get(semesterSubjectId);
  if (!offering) return null;
  if (!offering.isActive) return 'inactiva';
  return offering.freeSeats > 0 ? 'con-lugar' : 'llena';
}

export const REASON_LABEL: Record<PreferenceReason, string> = {
  llena: 'llena',
  inactiva: 'inactiva',
  'con-lugar': 'con lugar ahora',
};

export const REASON_TONE = {
  llena: 'danger',
  inactiva: 'neutral',
  'con-lugar': 'success',
} as const;
