/**
 * shift.js — turnos del semestre (matutino / vespertino).
 *
 * Cada turno es un semestre independiente con su propio link en el portal
 * (`/matutino`, `/vespertino`). La lista vive acá y en el enum `Shift` de
 * schema.prisma: si se agrega un turno, se agrega en los dos lados.
 */
import { apiError } from './apiError.js';

export const SHIFTS = Object.freeze(['matutino', 'vespertino']);

/**
 * Normaliza el turno que manda el cliente.
 *   - ausente / vacío  ⇒ `null` (el caller decide si es obligatorio)
 *   - válido           ⇒ 'matutino' | 'vespertino'
 *   - cualquier otra cosa ⇒ 400 INVALID_SHIFT
 */
export function parseShift(raw) {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (value === '') return null;
  if (!SHIFTS.includes(value)) throw apiError(400, 'INVALID_SHIFT');
  return value;
}
