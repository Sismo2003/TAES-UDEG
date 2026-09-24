/**
 * group.model.js — queries sobre `subject_groups` (las secciones con cupo).
 *
 * Acá viven los DOS únicos SQL crudos del sistema, documentados en
 * Docs/DATABASE.md §7.3. Están en el modelo, no en el service, por la misma
 * regla que todo lo demás: la query se escribe en un solo lugar. Ambos van
 * parametrizados con los template tags de Prisma — nunca concatenación.
 */
import { prisma } from '../config/db.js';
import { TAEV_CONFIG } from '../config/main.js';

const TARGET_SELECT = {
  id: true,
  label: true,
  capacity: true,
  assignedCount: true,
  isActive: true,
  semesterSubjectId: true,
  semesterSubject: { select: { semesterId: true, isActive: true } },
};

export function create(data, client = prisma) {
  return client.subjectGroup.create({
    data: {
      semesterSubjectId: Number(data.semesterSubjectId),
      label: String(data.label),
      capacity: Number(data.capacity),
      displayOrder: Number(data.displayOrder ?? 0),
    },
  });
}

/** Grupo + el semestre de su oferta: lo mínimo para verificar alcance. */
export function findByIdWithScope(id, client = prisma) {
  return client.subjectGroup.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      label: true,
      capacity: true,
      assignedCount: true,
      semesterSubject: { select: { semesterId: true } },
    },
  });
}

/** Grupo destino de una asignación manual: incluye cupo y estado de la oferta. */
export function findTarget(id, client = prisma) {
  return client.subjectGroup.findUnique({ where: { id: Number(id) }, select: TARGET_SELECT });
}

export function updateById(id, data, client = prisma) {
  return client.subjectGroup.update({ where: { id: Number(id) }, data });
}

/**
 * Grupos que el allocator puede llenar: activos, de una oferta activa, en el
 * orden en que se llenan (`display_order`, luego `id` como desempate estable).
 */
export function listAllocatable(semesterId, client = prisma) {
  return client.subjectGroup.findMany({
    where: { isActive: true, semesterSubject: { semesterId: Number(semesterId), isActive: true } },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, semesterSubjectId: true, capacity: true, assignedCount: true },
  });
}

/**
 * Advisory lock transaccional por semestre. Encola las corridas del allocator y
 * los overrides manuales en vez de dejarlos pelearse por los cupos. Se libera
 * solo al terminar la transacción.
 */
export function acquireAllocationLock(tx, semesterId) {
  return tx.$executeRaw`
    SELECT pg_advisory_xact_lock(${TAEV_CONFIG.allocationLockKey}::int, ${Number(semesterId)}::int)`;
}

/**
 * Recalcula `assigned_count` DESDE la realidad (`COUNT` de group_assignments),
 * nunca incrementando en JS. Si el resultado viola el CHECK
 * `assigned_count <= capacity`, la transacción entera aborta — que es el punto.
 */
export function recomputeAssignedCounts(tx, semesterId) {
  return tx.$executeRaw`
    UPDATE subject_groups sg
       SET assigned_count = sub.total
      FROM (
        SELECT g.id, COUNT(ga.id)::int AS total
          FROM subject_groups g
          LEFT JOIN group_assignments ga ON ga.group_id = g.id
          JOIN semester_subjects ss ON ss.id = g.semester_subject_id
         WHERE ss.semester_id = ${Number(semesterId)}
         GROUP BY g.id
      ) sub
     WHERE sg.id = sub.id
       AND sg.assigned_count IS DISTINCT FROM sub.total`;
}
