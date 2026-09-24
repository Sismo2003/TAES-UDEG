/**
 * semester.model.js — queries sobre `semesters`.
 *
 * El alcance por campus se expresa acá como un filtro (`campusId === null` ⇒
 * toda la red), pero la DECISIÓN de si un usuario puede ver ese campus la toma
 * el service con `assertCampusAccess`. El modelo filtra; no autoriza.
 */
import { prisma } from '../config/db.js';

const LIST_SELECT = {
  id: true,
  campusId: true,
  code: true,
  label: true,
  isCurrent: true,
  opensAt: true,
  closesAt: true,
  windowMode: true,
  ranksRequired: true,
  campus: { select: { id: true, code: true, name: true } },
};

/** Listado del panel, acotado por campus. `campusId === null` ⇒ sin filtro. */
export function listScoped(campusId, client = prisma) {
  return client.semester.findMany({
    where: campusId == null ? {} : { campusId },
    orderBy: [{ campusId: 'asc' }, { code: 'desc' }],
    select: LIST_SELECT,
  });
}

export function findById(id, client = prisma) {
  return client.semester.findUnique({ where: { id: Number(id) } });
}

/** Igual que `findById` pero con el campus embebido — para pantallas de detalle. */
export function findByIdWithCampus(id, client = prisma) {
  return client.semester.findUnique({ where: { id: Number(id) }, select: LIST_SELECT });
}

/** El semestre activo de un campus, o `null`. Usa el índice `(campus_id, is_current)`. */
export function findCurrentByCampus(campusId, client = prisma) {
  return client.semester.findFirst({ where: { campusId, isCurrent: true } });
}

/** Ids de los semestres de un campus — el acotado de la bitácora los necesita. */
export async function idsByCampus(campusId, client = prisma) {
  const rows = await client.semester.findMany({ where: { campusId }, select: { id: true } });
  return rows.map((r) => r.id);
}

export function create(data, client = prisma) {
  return client.semester.create({ data });
}

export function updateById(id, data, client = prisma) {
  return client.semester.update({ where: { id: Number(id) }, data });
}

/** Apaga el `is_current` de los demás semestres del campus. */
export function unsetCurrentExcept(campusId, semesterId, client = prisma) {
  return client.semester.updateMany({
    where: { campusId, isCurrent: true, NOT: { id: Number(semesterId) } },
    data: { isCurrent: false },
  });
}
