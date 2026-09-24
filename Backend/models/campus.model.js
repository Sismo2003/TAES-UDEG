/**
 * campus.model.js — queries sobre `campuses`.
 *
 * Ver `models/README.md`: acá vive la query, el service decide, el controller
 * sanitiza. Ningún archivo fuera de `models/` importa `prisma`.
 */
import { prisma } from '../config/db.js';

const PUBLIC_SELECT = { id: true, code: true, name: true };
const ADMIN_SELECT = { id: true, code: true, name: true, isActive: true };

/**
 * Listado del panel. `campusId === null` ⇒ sin filtro (superadmin global);
 * cualquier otro valor acota a esa escuela.
 */
export function listScoped(campusId, client = prisma) {
  return client.campus.findMany({
    where: campusId == null ? {} : { id: campusId },
    orderBy: { code: 'asc' },
    select: ADMIN_SELECT,
  });
}

/** Campus activo por su code url-safe ("prepa-2"). `null` si no existe. */
export function findActiveByCode(code, client = prisma) {
  return client.campus.findFirst({
    where: { code: String(code), isActive: true },
    select: PUBLIC_SELECT,
  });
}

/** Campus activos que tienen un semestre marcado como `is_current`. */
export function listActiveWithCurrentSemester(client = prisma) {
  return client.campus.findMany({
    where: { isActive: true, semesters: { some: { isCurrent: true } } },
    select: PUBLIC_SELECT,
  });
}

/** Todos los campus activos, tengan o no semestre abierto. */
export function listActive(client = prisma) {
  return client.campus.findMany({ where: { isActive: true }, select: PUBLIC_SELECT });
}
