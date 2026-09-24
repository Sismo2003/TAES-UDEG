/**
 * assignment.model.js — queries sobre `group_assignments` (el resultado final).
 *
 * `assigned_by_id` NUNCA es null: toda fila dice qué admin la produjo. Auto vs.
 * manual lo distingue `is_manual_override`, no la ausencia del autor.
 */
import { prisma } from '../config/db.js';

export function createMany(rows, client = prisma) {
  return client.groupAssignment.createMany({ data: rows });
}

export function create(data, client = prisma) {
  return client.groupAssignment.create({ data });
}

/** Asignación + envío + campus: el contexto para autorizar y revalidar un movimiento. */
export function findByIdWithContext(id, client = prisma) {
  return client.groupAssignment.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      groupId: true,
      submission: {
        select: {
          id: true,
          semesterId: true,
          status: true,
          semester: { select: { campusId: true } },
          preferences: { select: { rank: true, semesterSubjectId: true } },
        },
      },
    },
  });
}

export function updateById(id, data, client = prisma) {
  return client.groupAssignment.update({ where: { id: Number(id) }, data });
}
