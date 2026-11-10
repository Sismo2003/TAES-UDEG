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
  shift: true,
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
    orderBy: [{ campusId: 'asc' }, { code: 'desc' }, { shift: 'asc' }],
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

/**
 * El semestre activo de un campus y turno, o `null`. Usa el índice
 * `(campus_id, shift, is_current)`. El índice único parcial garantiza que hay
 * a lo sumo uno.
 */
export function findCurrentByCampusShift(campusId, shift, client = prisma) {
  return client.semester.findFirst({ where: { campusId, shift, isCurrent: true } });
}

/** Todos los semestres activos de un campus (uno por turno, como máximo). */
export function listCurrentByCampus(campusId, client = prisma) {
  return client.semester.findMany({
    where: { campusId, isCurrent: true },
    orderBy: { shift: 'asc' },
  });
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

/** Apaga el `is_current` de los demás semestres del mismo campus y turno. */
export function unsetCurrentExcept(campusId, shift, semesterId, client = prisma) {
  return client.semester.updateMany({
    where: { campusId, shift, isCurrent: true, NOT: { id: Number(semesterId) } },
    data: { isCurrent: false },
  });
}
