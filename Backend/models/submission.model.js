/**
 * submission.model.js — queries sobre `form_submissions` y sus preferencias.
 *
 * El envío es INMUTABLE una vez creado: acá no hay un `update` de preferencias
 * a propósito. Lo único que cambia después del insert es `status`/`resolvedAt`,
 * que los escribe el allocator.
 */
import { prisma } from '../config/db.js';

export function countBySemester(semesterId, client = prisma) {
  return client.formSubmission.count({ where: { semesterId: Number(semesterId) } });
}

/** `{ pending, allocated, unplaced }` en una sola pasada por el índice (semester_id, status). */
export async function countByStatus(semesterId, client = prisma) {
  const rows = await client.formSubmission.groupBy({
    by: ['status'],
    where: { semesterId: Number(semesterId) },
    _count: { _all: true },
  });

  const counts = { pending: 0, allocated: 0, unplaced: 0 };
  for (const r of rows) counts[r.status] = r._count._all;
  return counts;
}

/**
 * Listado del panel de "Envíos" — la pantalla en vivo que se proyecta durante
 * la ventana. ORDEN INVERSO al del allocator (`submitted_at DESC, id DESC`): el
 * último en llegar va arriba. Usa el mismo índice `(semester_id, submitted_at,
 * id)`, recorrido hacia atrás.
 */
const LIVE_ROW_SELECT = {
  id: true,
  submittedAt: true,
  status: true,
  student: { select: { code: true, fullName: true } },
  preferences: {
    orderBy: { rank: 'asc' },
    select: {
      rank: true,
      // El panel de Asignaciones cruza esto contra la oferta para decir por qué
      // falló cada preferencia (llena / inactiva). El nombre solo no alcanza.
      semesterSubjectId: true,
      semesterSubject: { select: { subject: { select: { name: true } } } },
    },
  },
  assignment: {
    select: {
      // `id` es lo que necesita PATCH /admin/assignments/:id para mover al alumno.
      id: true,
      assignedRank: true,
      groupId: true,
      group: {
        select: {
          label: true,
          semesterSubjectId: true,
          semesterSubject: { select: { subject: { select: { name: true } } } },
        },
      },
    },
  },
};

function buildLiveWhere({ semesterId, status, search, groupId, semesterSubjectId }) {
  const where = { semesterId: Number(semesterId) };
  if (status) where.status = status;
  if (search) {
    where.student = {
      OR: [
        { code: { contains: search } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  // "Quiénes quedaron en Robótica grupo A". Filtrar por grupo o por asignatura
  // deja fuera a los `unplaced` por definición: no tienen fila de asignación.
  if (groupId) {
    where.assignment = { groupId };
  } else if (semesterSubjectId) {
    where.assignment = { group: { semesterSubjectId } };
  }
  return where;
}

function shapeLiveRow(r) {
  return {
    id: r.id,
    code: r.student.code,
    fullName: r.student.fullName,
    submittedAt: r.submittedAt,
    status: r.status,
    preferences: r.preferences.map((p) => ({
      rank: p.rank,
      semesterSubjectId: p.semesterSubjectId,
      name: p.semesterSubject.subject.name,
    })),
    assignment: r.assignment
      ? {
          id: r.assignment.id,
          // `null` ⇒ colocación manual fuera de las preferencias del alumno.
          assignedRank: r.assignment.assignedRank,
          groupId: r.assignment.groupId,
          groupLabel: r.assignment.group.label,
          semesterSubjectId: r.assignment.group.semesterSubjectId,
          subjectName: r.assignment.group.semesterSubject.subject.name,
        }
      : null,
  };
}

export async function listPaginated(filters, client = prisma) {
  const where = buildLiveWhere(filters);
  const { skip = 0, take = 25 } = filters;

  const [rows, total] = await Promise.all([
    client.formSubmission.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: LIVE_ROW_SELECT,
    }),
    client.formSubmission.count({ where }),
  ]);

  return { rows: rows.map(shapeLiveRow), total };
}

/**
 * La cola del allocator: `pending` + `unplaced` en ORDEN DE LLEGADA ESTRICTO
 * (`submitted_at ASC, id ASC`). Ese orden es el corazón de la equidad del
 * sistema y es exactamente el índice `(semester_id, submitted_at, id)`.
 */
export function listForAllocation(semesterId, client = prisma) {
  return client.formSubmission.findMany({
    where: { semesterId: Number(semesterId), status: { in: ['pending', 'unplaced'] } },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      preferences: { orderBy: { rank: 'asc' }, select: { rank: true, semesterSubjectId: true } },
    },
  });
}

export function markStatus(ids, status, resolvedAt, client = prisma) {
  return client.formSubmission.updateMany({
    where: { id: { in: ids } },
    data: { status, resolvedAt },
  });
}

export function updateStatus(id, status, resolvedAt, client = prisma) {
  return client.formSubmission.update({
    where: { id: Number(id) },
    data: { status, resolvedAt },
  });
}

/** Envío + el contexto que necesita una colocación manual (campus, prefs, si ya tiene grupo). */
export function findByIdForPlacement(id, client = prisma) {
  return client.formSubmission.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      semesterId: true,
      status: true,
      semester: { select: { campusId: true } },
      assignment: { select: { id: true } },
      preferences: { select: { rank: true, semesterSubjectId: true } },
    },
  });
}

/**
 * Crea el envío y sus preferencias. Se llama SIEMPRE con el `tx` del service:
 * un envío sin preferencias no es un envío a medias, es un dato corrupto.
 *
 * `semester_id` es un escalar compartido por tres relaciones compuestas, así
 * que Prisma no lo acepta como argumento en un create anidado: la submission
 * va con `connect` y las preferencias con `createMany`, que sí toma los
 * escalares de FK.
 */
export async function createWithPreferences(
  { semesterId, studentId, ip, userAgent, preferences },
  client = prisma,
) {
  const submission = await client.formSubmission.create({
    data: {
      semester: { connect: { id: Number(semesterId) } },
      student: {
        connect: {
          semester_student_scope: { id: Number(studentId), semesterId: Number(semesterId) },
        },
      },
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    },
    select: { id: true, submittedAt: true },
  });

  await client.submissionPreference.createMany({
    data: preferences.map((p) => ({
      submissionId: submission.id,
      semesterId: Number(semesterId),
      semesterSubjectId: Number(p.semesterSubjectId),
      rank: Number(p.rank),
    })),
  });

  return submission;
}
