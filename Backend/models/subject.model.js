/**
 * subject.model.js — queries sobre `subjects`, el catálogo maestro.
 *
 * El catálogo NO tiene `campus_id` a propósito (ver el comentario del modelo
 * en schema.prisma): "Robótica" es la misma fila en toda la red. Quién la
 * oferta se decide en `semester_subjects` — ver `offering.model.js`.
 */
import { prisma } from '../config/db.js';

const ROW_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isActive: true,
  _count: { select: { offerings: true } },
};

function buildWhere({ search, isActive }) {
  const where = {};
  if (isActive != null) where.isActive = isActive;
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}

const SORTABLE = {
  code: (dir) => [{ code: dir }],
  name: (dir) => [{ name: dir }],
};

export async function listPaginated(filters = {}, client = prisma) {
  const where = buildWhere(filters);
  const { skip = 0, take = 25, sort } = filters;
  const orderBy = (SORTABLE[sort?.field] ?? SORTABLE.name)(sort?.dir ?? 'asc');

  const [rows, total] = await Promise.all([
    client.subject.findMany({ where, orderBy, skip, take, select: ROW_SELECT }),
    client.subject.count({ where }),
  ]);

  return { rows, total };
}

/** Catálogo completo sin paginar — para poblar el `<select>` de "ofertar". */
export function listAllActive(client = prisma) {
  return client.subject.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  });
}

export function findById(id, client = prisma) {
  return client.subject.findUnique({ where: { id: Number(id) }, select: ROW_SELECT });
}

export function create(data, client = prisma) {
  return client.subject.create({ data, select: ROW_SELECT });
}

/**
 * Alta o reuso por `code`. `update: {}` es deliberado: si la asignatura ya
 * existe en el catálogo, ofertarla NO debe pisar su nombre ni su descripción.
 */
export function upsertByCode(data, client = prisma) {
  return client.subject.upsert({
    where: { code: data.code },
    create: data,
    update: {},
    select: { id: true },
  });
}

export function updateById(id, data, client = prisma) {
  return client.subject.update({ where: { id: Number(id) }, data, select: ROW_SELECT });
}
