/**
 * audit.model.js — `audit_log`, bitácora append-only.
 *
 * Acciones que DEBEN registrarse sin excepción (Docs/DATABASE.md §4.11):
 *   semester.create, semester.update, semester.window.*, semester.set_current,
 *   students.bulk_upload, groups.capacity_change, allocation.run,
 *   assignment.override
 *
 * `write` toma el `client` para poder correr DENTRO de la transacción de la
 * operación que audita: si la operación aborta, la bitácora no queda con una
 * entrada de algo que nunca pasó.
 */
import { prisma } from '../config/db.js';

const ROW_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  payload: true,
  ip: true,
  createdAt: true,
  user: { select: { id: true, fullName: true, email: true } },
};

export function write({ userId, action, entityType, entityId, payload, ip }, client = prisma) {
  return client.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      payload: payload ?? undefined,
      ip: ip ?? null,
    },
  });
}

/**
 * `where` del listado. El acotado por campus no es un `campus_id` en la tabla
 * (la bitácora no lo tiene): es "lo que hice yo" ∪ "lo que pasó en MIS
 * semestres". `all: true` (superadmin global) se salta el filtro.
 */
function buildWhere({ all, userId, semesterIds, action, entityType, search }) {
  const and = [];

  if (!all) {
    and.push({
      OR: [
        { userId },
        { entityType: 'semester', entityId: { in: semesterIds ?? [] } },
      ],
    });
  }
  if (action) and.push({ action: { contains: action, mode: 'insensitive' } });
  if (entityType) and.push({ entityType });
  if (search) {
    and.push({
      OR: [
        { action: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function listPaginated(filters, client = prisma) {
  const where = buildWhere(filters);
  const { skip = 0, take = 50 } = filters;

  const [rows, total] = await Promise.all([
    client.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: ROW_SELECT }),
    client.auditLog.count({ where }),
  ]);

  return { rows, total };
}
