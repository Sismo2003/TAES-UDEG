/**
 * student.model.js — queries sobre `semester_students` (el padrón).
 *
 * El listado del panel es el que paginamos de verdad: un padrón real son miles
 * de filas y la tabla del Admin pide de a página. `listPaginated` devuelve
 * siempre `{ rows, total }` — la forma que consume el DataTable.
 */
import { prisma } from '../config/db.js';

const ROW_SELECT = {
  id: true,
  code: true,
  fullName: true,
  email: true,
  career: true,
  studentSemesterLabel: true,
  isActive: true,
  createdAt: true,
  submission: { select: { id: true, submittedAt: true, status: true } },
};

/**
 * Arma el `where` del listado. Separado de la query para que el filtro y el
 * conteo usen EXACTAMENTE el mismo criterio — si divergen, la paginación miente.
 */
function buildWhere({ semesterId, search, isActive, hasSubmission }) {
  const where = { semesterId: Number(semesterId) };

  if (isActive != null) where.isActive = isActive;
  if (hasSubmission === true) where.submission = { isNot: null };
  if (hasSubmission === false) where.submission = { is: null };

  if (search) {
    where.OR = [
      { code: { contains: search } },
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { career: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
}

const SORTABLE = {
  code: (dir) => [{ code: dir }],
  fullName: (dir) => [{ fullName: dir }, { code: 'asc' }],
  createdAt: (dir) => [{ createdAt: dir }, { id: dir }],
};

export async function listPaginated(filters, client = prisma) {
  const where = buildWhere(filters);
  const { skip = 0, take = 25, sort } = filters;
  const orderBy = (SORTABLE[sort?.field] ?? SORTABLE.code)(sort?.dir ?? 'asc');

  const [rows, total] = await Promise.all([
    client.semesterStudent.findMany({ where, orderBy, skip, take, select: ROW_SELECT }),
    client.semesterStudent.count({ where }),
  ]);

  return { rows, total };
}

export function countActive(semesterId, client = prisma) {
  return client.semesterStudent.count({
    where: { semesterId: Number(semesterId), isActive: true },
  });
}

/** Alumno activo por código — la verificación del portal público. */
export function findActiveByCode(semesterId, code, client = prisma) {
  return client.semesterStudent.findFirst({
    where: { semesterId: Number(semesterId), code: String(code), isActive: true },
    select: { id: true, fullName: true, submission: { select: { id: true } } },
  });
}

/** Fila del padrón por id, acotada al semestre (evita tocar la de otro ciclo). */
export function findInSemester(semesterId, studentId, client = prisma) {
  return client.semesterStudent.findFirst({
    where: { id: Number(studentId), semesterId: Number(semesterId) },
    select: ROW_SELECT,
  });
}

export function create(semesterId, row, client = prisma) {
  return client.semesterStudent.create({
    data: { semesterId: Number(semesterId), ...row, isActive: row.isActive ?? true },
    select: ROW_SELECT,
  });
}

/** Alta idempotente por `(semesterId, code)` — el corazón de la carga masiva. */
export function upsertByCode(semesterId, row, client = prisma) {
  return client.semesterStudent.upsert({
    where: { semesterId_code: { semesterId: Number(semesterId), code: row.code } },
    create: { semesterId: Number(semesterId), ...row, isActive: true },
    update: { ...row, isActive: true },
  });
}

export function updateById(id, data, client = prisma) {
  return client.semesterStudent.update({
    where: { id: Number(id) },
    data,
    select: ROW_SELECT,
  });
}

export function deleteById(id, client = prisma) {
  return client.semesterStudent.delete({ where: { id: Number(id) } });
}
