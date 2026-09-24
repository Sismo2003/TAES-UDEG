/**
 * offering.model.js — queries sobre `semester_subjects` (LA OFERTA).
 *
 * Punto de anclaje de todo lo que depende de una asignatura: los grupos y las
 * preferencias apuntan acá, no a `subjects`. Por eso las queries de esta tabla
 * casi siempre traen los grupos embebidos: la oferta sin su cupo no dice nada.
 */
import { prisma } from '../config/db.js';

const GROUP_SELECT = {
  id: true,
  label: true,
  capacity: true,
  assignedCount: true,
  displayOrder: true,
  isActive: true,
};

const ROW_SELECT = {
  id: true,
  subjectId: true,
  displayOrder: true,
  isActive: true,
  subject: { select: { id: true, code: true, name: true, description: true } },
  groups: { orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }], select: GROUP_SELECT },
};

/** Oferta completa del semestre, con grupos. Lo que consume el editor del panel. */
export function listBySemester(semesterId, client = prisma) {
  return client.semesterSubject.findMany({
    where: { semesterId: Number(semesterId) },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: ROW_SELECT,
  });
}

/**
 * Oferta ACTIVA en el orden del formulario. Es la query del portal público:
 * sólo id, nombre y orden — nada de cupos ni de ocupación, que el alumno no ve.
 */
export async function listActiveBySemester(semesterId, client = prisma) {
  const rows = await client.semesterSubject.findMany({
    where: { semesterId: Number(semesterId), isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, displayOrder: true, subject: { select: { name: true } } },
  });
  return rows.map((r) => ({
    semesterSubjectId: r.id,
    name: r.subject.name,
    displayOrder: r.displayOrder,
  }));
}

/** Sub-conjunto activo de una lista de ids — valida las preferencias de un envío. */
export function findActiveByIds(semesterId, ids, client = prisma) {
  return client.semesterSubject.findMany({
    where: { id: { in: ids }, semesterId: Number(semesterId), isActive: true },
    select: { id: true, subject: { select: { name: true } } },
  });
}

export function findById(id, client = prisma) {
  return client.semesterSubject.findUnique({ where: { id: Number(id) } });
}

export function create(data, client = prisma) {
  return client.semesterSubject.create({
    data: {
      semesterId: Number(data.semesterId),
      subjectId: Number(data.subjectId),
      displayOrder: Number(data.displayOrder ?? 0),
    },
    select: ROW_SELECT,
  });
}

export function updateById(id, data, client = prisma) {
  return client.semesterSubject.update({
    where: { id: Number(id) },
    data,
    select: ROW_SELECT,
  });
}

/**
 * Resumen para el dashboard: oferta + grupos, ya reducida a totales.
 * Se hace en una query con los grupos embebidos y se agrega en JS — son
 * decenas de filas, no vale un GROUP BY extra por asignatura.
 */
export async function overviewBySemester(semesterId, client = prisma) {
  const rows = await client.semesterSubject.findMany({
    where: { semesterId: Number(semesterId) },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      isActive: true,
      subject: { select: { name: true } },
      groups: { orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }], select: GROUP_SELECT },
    },
  });

  return rows.map((o) => ({
    semesterSubjectId: o.id,
    name: o.subject.name,
    isActive: o.isActive,
    capacity: o.groups.reduce((s, g) => s + g.capacity, 0),
    assigned: o.groups.reduce((s, g) => s + g.assignedCount, 0),
    groups: o.groups,
  }));
}
