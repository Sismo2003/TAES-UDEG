/**
 * campusScope.middleware.js — alcance por campus.
 *
 * El CHECK `users_campus_scope` garantiza que todo admin/viewer tenga campus;
 * este módulo hace cumplir que un request no toque un recurso de otra escuela.
 * Docs/DATABASE.md §3.3.
 */
import { apiError } from '../utils/apiError.js';

/** Un superadmin sin campus es el único con alcance global (toda la red). */
export function isGlobalScope(user) {
  return user.role === 'superadmin' && user.campusId === null;
}

/**
 * Regla única: un recurso es accesible si pertenece al campus del usuario, o si
 * el usuario es un superadmin global.
 */
export function assertCampusAccess(user, resourceCampusId) {
  if (isGlobalScope(user)) return;
  if (user.campusId != null && user.campusId === resourceCampusId) return;
  throw apiError(403, 'CAMPUS_FORBIDDEN');
}

/**
 * Campus al que hay que acotar un LISTADO: `null` = sin filtro (superadmin
 * global). Es lo que los modelos esperan — no se les pasa un `where` de Prisma
 * armado afuera, porque la query se escribe en el modelo (models/README.md).
 */
export function scopeCampusId(user) {
  return isGlobalScope(user) ? null : user.campusId;
}
