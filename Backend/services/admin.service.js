/**
 * admin.service.js — reglas de negocio del panel interno.
 *
 * Reparto de responsabilidades (models/README.md):
 *   controller → sanitiza el input y arma la respuesta
 *   service    → decide: autoriza por campus, valida el dominio, transacciona,
 *                audita
 *   model      → la query
 *
 * Todo endpoint del panel ya pasó por `requireAuth`; el alcance por campus se
 * verifica acá con `assertCampusAccess` antes de tocar un recurso ajeno.
 */
import { transaction } from '../config/db.js';
import { TAEV_CONFIG } from '../config/main.js';
import * as campusModel from '../models/campus.model.js';
import * as semesterModel from '../models/semester.model.js';
import * as studentModel from '../models/student.model.js';
import * as subjectModel from '../models/subject.model.js';
import * as offeringModel from '../models/offering.model.js';
import * as groupModel from '../models/group.model.js';
import * as submissionModel from '../models/submission.model.js';
import * as auditModel from '../models/audit.model.js';
import { deriveClosesAt, resolveSemesterWindow } from '../utils/semesterWindow.js';
import {
  assertCampusAccess,
  isGlobalScope,
  scopeCampusId,
} from '../middlewares/campusScope.middleware.js';
import { apiError } from '../utils/apiError.js';

const WINDOW_MODES = new Set(['scheduled', 'force_open', 'force_closed']);

/** Trae el semestre + campusId y verifica alcance. Lanza 404 / 403. */
async function loadSemesterScoped(user, semesterId, client) {
  const semester = await semesterModel.findById(semesterId, client);
  if (!semester) throw apiError(404, 'SEMESTER_NOT_FOUND');
  assertCampusAccess(user, semester.campusId);
  return semester;
}

// ── Campuses / semestres ────────────────────────────────────────────────────

export function listCampuses(user) {
  return campusModel.listScoped(scopeCampusId(user));
}

export function listSemesters(user) {
  return semesterModel.listScoped(scopeCampusId(user));
}

export async function getSemester(user, semesterId) {
  const semester = await semesterModel.findByIdWithCampus(semesterId);
  if (!semester) throw apiError(404, 'SEMESTER_NOT_FOUND');
  assertCampusAccess(user, semester.campusId);
  return semester;
}

/**
 * Crea un semestre. El admin piensa en "abre a las 10:00 y dura N minutos":
 * se acepta `durationMinutes` y se deriva `closesAt` en un solo lugar
 * (`deriveClosesAt`). `closesAt` explícito también se acepta.
 */
export async function createSemester(user, body, ip) {
  const campusId = isGlobalScope(user) ? Number(body.campusId) : user.campusId;
  if (!campusId) throw apiError(400, 'CAMPUS_REQUIRED');
  assertCampusAccess(user, campusId);

  const { code, label, opensAt } = body;
  if (!code || !label || !opensAt) throw apiError(400, 'MISSING_FIELDS');

  const opens = new Date(opensAt);
  if (Number.isNaN(opens.getTime())) throw apiError(400, 'INVALID_DATE');

  let closes;
  if (body.closesAt) {
    closes = new Date(body.closesAt);
    if (Number.isNaN(closes.getTime())) throw apiError(400, 'INVALID_DATE');
  } else {
    const minutes = Number(body.durationMinutes ?? TAEV_CONFIG.defaultWindowMinutes);
    if (!Number.isInteger(minutes) || minutes <= 0) throw apiError(400, 'INVALID_DURATION');
    closes = deriveClosesAt(opens, minutes);
  }
  if (closes <= opens) throw apiError(400, 'CLOSES_BEFORE_OPENS');

  const ranksRequired = Number(body.ranksRequired ?? TAEV_CONFIG.defaultRanksRequired);
  if (!Number.isInteger(ranksRequired) || ranksRequired < 1 || ranksRequired > 10) {
    throw apiError(400, 'INVALID_RANKS_REQUIRED');
  }

  try {
    return await transaction(async (tx) => {
      const semester = await semesterModel.create(
        {
          campusId,
          code: String(code),
          label: String(label),
          opensAt: opens,
          closesAt: closes,
          windowMode: WINDOW_MODES.has(body.windowMode) ? body.windowMode : 'scheduled',
          ranksRequired,
          notes: body.notes ?? null,
          createdById: user.id,
        },
        tx,
      );
      await auditModel.write(
        {
          userId: user.id,
          action: 'semester.create',
          entityType: 'semester',
          entityId: semester.id,
          payload: { code: semester.code, campusId },
          ip,
        },
        tx,
      );
      return semester;
    });
  } catch (err) {
    if (err?.code === 'P2002') throw apiError(409, 'SEMESTER_CODE_TAKEN');
    throw err;
  }
}

export async function updateSemester(user, semesterId, body, ip) {
  const current = await loadSemesterScoped(user, semesterId);

  const data = {};
  if (body.label != null) data.label = String(body.label);
  if (body.notes !== undefined) data.notes = body.notes ?? null;
  if (body.ranksRequired != null) {
    const n = Number(body.ranksRequired);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw apiError(400, 'INVALID_RANKS_REQUIRED');
    data.ranksRequired = n;
  }
  if (body.opensAt != null || body.closesAt != null || body.durationMinutes != null) {
    const opens = body.opensAt != null ? new Date(body.opensAt) : current.opensAt;
    if (Number.isNaN(opens.getTime())) throw apiError(400, 'INVALID_DATE');
    let closes;
    if (body.closesAt != null) closes = new Date(body.closesAt);
    else if (body.durationMinutes != null) {
      const m = Number(body.durationMinutes);
      if (!Number.isInteger(m) || m <= 0) throw apiError(400, 'INVALID_DURATION');
      closes = deriveClosesAt(opens, m);
    } else closes = current.closesAt;
    if (Number.isNaN(closes.getTime())) throw apiError(400, 'INVALID_DATE');
    if (closes <= opens) throw apiError(400, 'CLOSES_BEFORE_OPENS');
    data.opensAt = opens;
    data.closesAt = closes;
  }

  return transaction(async (tx) => {
    const semester = await semesterModel.updateById(current.id, data, tx);
    await auditModel.write(
      {
        userId: user.id,
        action: 'semester.update',
        entityType: 'semester',
        entityId: semester.id,
        payload: { changed: Object.keys(data) },
        ip,
      },
      tx,
    );
    return semester;
  });
}

/** Cambia `window_mode` — el kill switch. Cada cambio va a `audit_log`. */
export async function changeWindowMode(user, semesterId, mode, ip) {
  if (!WINDOW_MODES.has(mode)) throw apiError(400, 'INVALID_WINDOW_MODE');
  const current = await loadSemesterScoped(user, semesterId);

  return transaction(async (tx) => {
    const semester = await semesterModel.updateById(current.id, { windowMode: mode }, tx);
    await auditModel.write(
      {
        userId: user.id,
        action: `semester.window.${mode}`,
        entityType: 'semester',
        entityId: semester.id,
        payload: { from: current.windowMode, to: mode },
        ip,
      },
      tx,
    );
    return { ...semester, window: resolveSemesterWindow(semester, new Date()) };
  });
}

/** Marca el semestre como activo del campus; apaga el que estuviera. */
export async function setCurrentSemester(user, semesterId, ip) {
  const target = await loadSemesterScoped(user, semesterId);

  return transaction(async (tx) => {
    await semesterModel.unsetCurrentExcept(target.campusId, target.id, tx);
    const semester = await semesterModel.updateById(target.id, { isCurrent: true }, tx);
    await auditModel.write(
      {
        userId: user.id,
        action: 'semester.set_current',
        entityType: 'semester',
        entityId: semester.id,
        payload: { campusId: target.campusId },
        ip,
      },
      tx,
    );
    return semester;
  });
}

/**
 * Quita el semestre activo del campus: el portal público queda SIN semestre y
 * deja de aceptar alumnos (`resolveSemesterWindow(null)` ⇒ `NO_ACTIVE_SEMESTER`).
 * Es distinto del kill switch (`force_closed`), que cierra pero mantiene el
 * semestre a la vista. Los envíos ya registrados no se tocan.
 */
export async function clearCurrentSemester(user, semesterId, ip) {
  const target = await loadSemesterScoped(user, semesterId);
  if (!target.isCurrent) throw apiError(409, 'SEMESTER_NOT_CURRENT');

  return transaction(async (tx) => {
    const semester = await semesterModel.updateById(target.id, { isCurrent: false }, tx);
    await auditModel.write(
      {
        userId: user.id,
        action: 'semester.clear_current',
        entityType: 'semester',
        entityId: semester.id,
        payload: { campusId: target.campusId },
        ip,
      },
      tx,
    );
    return semester;
  });
}

/** Dashboard: contadores y cupos restantes del semestre. */
export async function semesterOverview(user, semesterId) {
  const semester = await loadSemesterScoped(user, semesterId);

  const [students, submissions, byStatus, offerings] = await Promise.all([
    studentModel.countActive(semester.id),
    submissionModel.countBySemester(semester.id),
    submissionModel.countByStatus(semester.id),
    offeringModel.overviewBySemester(semester.id),
  ]);

  return {
    semester: {
      id: semester.id,
      code: semester.code,
      label: semester.label,
      isCurrent: semester.isCurrent,
      ranksRequired: semester.ranksRequired,
      windowMode: semester.windowMode,
    },
    window: resolveSemesterWindow(semester, new Date()),
    counts: { students, submissions, ...byStatus },
    offerings,
  };
}

// ── Padrón ──────────────────────────────────────────────────────────────────

/**
 * Normaliza y valida una fila del padrón. El formato del código es la regla
 * más sensible del sistema (`taev.config.json`, el store del Frontend,
 * `TAEV_STUDENT_CODE_LENGTH` y el CHECK de la BD): acá se aplica la de config,
 * nunca un `\d{9}` escrito a mano.
 */
function normalizeStudentRow(raw) {
  const code = String(raw?.code ?? '').trim();
  if (!TAEV_CONFIG.studentCodePattern.test(code)) throw apiError(400, 'INVALID_CODE_FORMAT');

  return {
    code,
    fullName: raw.fullName?.trim() || null,
    email: raw.email?.trim() || null,
    career: raw.career?.trim() || null,
    studentSemesterLabel: raw.studentSemesterLabel?.trim() || null,
  };
}

export async function listStudents(user, semesterId, filters) {
  const semester = await loadSemesterScoped(user, semesterId);
  return studentModel.listPaginated({ ...filters, semesterId: semester.id });
}

export async function createStudent(user, semesterId, body, ip) {
  const semester = await loadSemesterScoped(user, semesterId);
  const row = normalizeStudentRow(body);

  try {
    return await transaction(async (tx) => {
      const student = await studentModel.create(semester.id, row, tx);
      await auditModel.write(
        {
          userId: user.id,
          action: 'students.create',
          entityType: 'semester',
          entityId: semester.id,
          payload: { code: student.code },
          ip,
        },
        tx,
      );
      return student;
    });
  } catch (err) {
    if (err?.code === 'P2002') throw apiError(409, 'CODE_ALREADY_IN_ROSTER');
    throw err;
  }
}

export async function updateStudent(user, semesterId, studentId, body, ip) {
  const semester = await loadSemesterScoped(user, semesterId);
  const existing = await studentModel.findInSemester(semester.id, studentId);
  if (!existing) throw apiError(404, 'STUDENT_NOT_FOUND');

  const data = {};
  if (body.code != null) {
    const code = String(body.code).trim();
    if (!TAEV_CONFIG.studentCodePattern.test(code)) throw apiError(400, 'INVALID_CODE_FORMAT');
    // Cambiar el código de alguien que YA envió rompe la trazabilidad del envío.
    if (code !== existing.code && existing.submission) throw apiError(409, 'STUDENT_HAS_SUBMISSION');
    data.code = code;
  }
  for (const field of ['fullName', 'email', 'career', 'studentSemesterLabel']) {
    if (body[field] !== undefined) data[field] = body[field]?.trim() || null;
  }
  if (body.isActive != null) data.isActive = Boolean(body.isActive);
  if (Object.keys(data).length === 0) throw apiError(400, 'NOTHING_TO_UPDATE');

  try {
    return await transaction(async (tx) => {
      const student = await studentModel.updateById(existing.id, data, tx);
      await auditModel.write(
        {
          userId: user.id,
          action: 'students.update',
          entityType: 'semester',
          entityId: semester.id,
          payload: { studentId: student.id, changed: Object.keys(data) },
          ip,
        },
        tx,
      );
      return student;
    });
  } catch (err) {
    if (err?.code === 'P2002') throw apiError(409, 'CODE_ALREADY_IN_ROSTER');
    throw err;
  }
}

/**
 * Baja del padrón. Si el alumno YA envió, no se borra: se desactiva. Borrarlo
 * arrastraría su envío en cascada y con él el orden de llegada de los demás.
 */
export async function deleteStudent(user, semesterId, studentId, ip) {
  const semester = await loadSemesterScoped(user, semesterId);
  const existing = await studentModel.findInSemester(semester.id, studentId);
  if (!existing) throw apiError(404, 'STUDENT_NOT_FOUND');

  return transaction(async (tx) => {
    const softDelete = Boolean(existing.submission);
    if (softDelete) await studentModel.updateById(existing.id, { isActive: false }, tx);
    else await studentModel.deleteById(existing.id, tx);

    await auditModel.write(
      {
        userId: user.id,
        action: softDelete ? 'students.deactivate' : 'students.delete',
        entityType: 'semester',
        entityId: semester.id,
        payload: { code: existing.code, softDelete },
        ip,
      },
      tx,
    );
    return { id: existing.id, softDelete };
  });
}

/**
 * Carga masiva de padrón. `students` es un array de
 * `{ code, fullName?, email?, career?, studentSemesterLabel? }`.
 * Idempotente por `(semesterId, code)`: repetidos se actualizan.
 */
export async function bulkUploadStudents(user, semesterId, students, ip) {
  const semester = await loadSemesterScoped(user, semesterId);
  if (!Array.isArray(students) || students.length === 0) throw apiError(400, 'NO_ROWS');
  if (students.length > 20_000) throw apiError(400, 'TOO_MANY_ROWS');

  const rows = [];
  const seen = new Set();
  for (const raw of students) {
    let row;
    try {
      row = normalizeStudentRow(raw);
    } catch {
      throw apiError(400, 'INVALID_CODE_IN_BATCH');
    }
    if (seen.has(row.code)) throw apiError(400, 'DUPLICATE_CODE_IN_BATCH');
    seen.add(row.code);
    rows.push(row);
  }

  return transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const res = await studentModel.upsertByCode(semester.id, row, tx);
      if (res.createdAt.getTime() === res.updatedAt.getTime()) created += 1;
      else updated += 1;
    }
    await auditModel.write(
      {
        userId: user.id,
        action: 'students.bulk_upload',
        entityType: 'semester',
        entityId: semester.id,
        payload: { total: rows.length, created, updated },
        ip,
      },
      tx,
    );
    return { total: rows.length, created, updated };
  });
}

// ── Envíos ──────────────────────────────────────────────────────────────────

/**
 * Listado de formularios recibidos, del más reciente al más antiguo. Es la
 * pantalla en vivo que se proyecta durante la ventana; los KPIs (padrón,
 * enviados, faltan) y la cuenta regresiva salen de `semesterOverview`.
 */
export async function listSubmissions(user, semesterId, filters) {
  const semester = await loadSemesterScoped(user, semesterId);
  return submissionModel.listPaginated({ ...filters, semesterId: semester.id });
}

// ── Catálogo de asignaturas ─────────────────────────────────────────────────
//
// `subjects` es compartido por TODA la red (no tiene campus_id): cualquier
// admin lo lee, y lo que cada escuela ofrece se decide en la oferta del
// semestre, no acá.

export function listSubjects(filters) {
  return subjectModel.listPaginated(filters);
}

export function listSubjectOptions() {
  return subjectModel.listAllActive();
}

export async function createSubject(user, body, ip) {
  const code = String(body.code ?? '').trim().toUpperCase();
  const name = String(body.name ?? '').trim();
  if (!code || !name) throw apiError(400, 'MISSING_FIELDS');
  if (code.length > 32 || name.length > 120) throw apiError(400, 'FIELD_TOO_LONG');

  try {
    return await transaction(async (tx) => {
      const subject = await subjectModel.create(
        { code, name, description: body.description?.trim() || null },
        tx,
      );
      await auditModel.write(
        {
          userId: user.id,
          action: 'subject.create',
          entityType: 'subject',
          entityId: subject.id,
          payload: { code, name },
          ip,
        },
        tx,
      );
      return subject;
    });
  } catch (err) {
    if (err?.code === 'P2002') throw apiError(409, 'SUBJECT_CODE_TAKEN');
    throw err;
  }
}

export async function updateSubject(user, subjectId, body, ip) {
  const existing = await subjectModel.findById(subjectId);
  if (!existing) throw apiError(404, 'SUBJECT_NOT_FOUND');

  const data = {};
  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) throw apiError(400, 'MISSING_FIELDS');
    data.name = name;
  }
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.isActive != null) data.isActive = Boolean(body.isActive);
  if (Object.keys(data).length === 0) throw apiError(400, 'NOTHING_TO_UPDATE');

  return transaction(async (tx) => {
    const subject = await subjectModel.updateById(existing.id, data, tx);
    await auditModel.write(
      {
        userId: user.id,
        action: 'subject.update',
        entityType: 'subject',
        entityId: subject.id,
        payload: { changed: Object.keys(data) },
        ip,
      },
      tx,
    );
    return subject;
  });
}

// ── Oferta y grupos ─────────────────────────────────────────────────────────

export async function listOfferings(user, semesterId) {
  const semester = await loadSemesterScoped(user, semesterId);
  return offeringModel.listBySemester(semester.id);
}

/**
 * Agrega una asignatura a la oferta del semestre. `subjectId` para ofrecer una
 * del catálogo; `{ code, name }` para crear la del catálogo y ofrecerla.
 */
export async function addOffering(user, semesterId, body, ip) {
  const semester = await loadSemesterScoped(user, semesterId);

  try {
    return await transaction(async (tx) => {
      let subjectId = body.subjectId ? Number(body.subjectId) : null;
      if (!subjectId) {
        const code = String(body.code ?? '').trim().toUpperCase();
        const name = String(body.name ?? '').trim();
        if (!code || !name) throw apiError(400, 'MISSING_FIELDS');
        const subject = await subjectModel.upsertByCode(
          { code, name, description: body.description?.trim() || null },
          tx,
        );
        subjectId = subject.id;
      }

      const offering = await offeringModel.create(
        { semesterId: semester.id, subjectId, displayOrder: body.displayOrder ?? 0 },
        tx,
      );
      await auditModel.write(
        {
          userId: user.id,
          action: 'semester.update',
          entityType: 'semester_subject',
          entityId: offering.id,
          payload: { semesterId: semester.id, subjectId },
          ip,
        },
        tx,
      );
      return offering;
    });
  } catch (err) {
    if (err?.code === 'P2002') throw apiError(409, 'SUBJECT_ALREADY_OFFERED');
    if (err?.code === 'P2003') throw apiError(400, 'SUBJECT_NOT_FOUND');
    throw err;
  }
}

export async function updateOffering(user, semesterId, offeringId, body) {
  const semester = await loadSemesterScoped(user, semesterId);
  const offering = await offeringModel.findById(offeringId);
  if (!offering || offering.semesterId !== semester.id) throw apiError(404, 'OFFERING_NOT_FOUND');

  const data = {};
  if (body.displayOrder != null) data.displayOrder = Number(body.displayOrder);
  if (body.isActive != null) data.isActive = Boolean(body.isActive);
  if (Object.keys(data).length === 0) throw apiError(400, 'NOTHING_TO_UPDATE');

  return offeringModel.updateById(offering.id, data);
}

export async function createGroup(user, semesterId, body, ip) {
  const semester = await loadSemesterScoped(user, semesterId);
  const offering = await offeringModel.findById(body.semesterSubjectId);
  if (!offering || offering.semesterId !== semester.id) throw apiError(404, 'OFFERING_NOT_FOUND');

  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) throw apiError(400, 'INVALID_CAPACITY');
  const label = String(body.label ?? '').trim();
  if (!label) throw apiError(400, 'MISSING_FIELDS');

  try {
    return await transaction(async (tx) => {
      const group = await groupModel.create(
        {
          semesterSubjectId: offering.id,
          label,
          capacity,
          displayOrder: body.displayOrder ?? 0,
        },
        tx,
      );
      await auditModel.write(
        {
          userId: user.id,
          action: 'groups.create',
          entityType: 'subject_group',
          entityId: group.id,
          payload: { semesterId: semester.id, label, capacity },
          ip,
        },
        tx,
      );
      return group;
    });
  } catch (err) {
    if (err?.code === 'P2002') throw apiError(409, 'GROUP_LABEL_TAKEN');
    throw err;
  }
}

export async function updateGroup(user, semesterId, groupId, body, ip) {
  const semester = await loadSemesterScoped(user, semesterId);
  const group = await groupModel.findByIdWithScope(groupId);
  if (!group || group.semesterSubject.semesterId !== semester.id) {
    throw apiError(404, 'GROUP_NOT_FOUND');
  }

  const data = {};
  if (body.label != null) data.label = String(body.label).trim();
  if (body.displayOrder != null) data.displayOrder = Number(body.displayOrder);
  if (body.isActive != null) data.isActive = Boolean(body.isActive);
  let capacityChanged = false;
  if (body.capacity != null) {
    const c = Number(body.capacity);
    if (!Number.isInteger(c) || c <= 0) throw apiError(400, 'INVALID_CAPACITY');
    // El CHECK de la BD también lo atrapa; chequearlo acá da un 409 con sentido
    // en vez de un error de constraint traducido a mano.
    if (c < group.assignedCount) throw apiError(409, 'CAPACITY_BELOW_ASSIGNED');
    data.capacity = c;
    capacityChanged = c !== group.capacity;
  }
  if (Object.keys(data).length === 0) throw apiError(400, 'NOTHING_TO_UPDATE');

  try {
    return await transaction(async (tx) => {
      const updated = await groupModel.updateById(group.id, data, tx);
      if (capacityChanged) {
        await auditModel.write(
          {
            userId: user.id,
            action: 'groups.capacity_change',
            entityType: 'subject_group',
            entityId: group.id,
            payload: { from: group.capacity, to: data.capacity },
            ip,
          },
          tx,
        );
      }
      return updated;
    });
  } catch (err) {
    // Red de seguridad: el CHECK `assigned_count <= capacity` de la BD.
    if (err?.code === 'P2010' || /assigned_count/.test(String(err?.message))) {
      throw apiError(409, 'CAPACITY_BELOW_ASSIGNED');
    }
    throw err;
  }
}

// ── Bitácora ────────────────────────────────────────────────────────────────

/**
 * La bitácora no tiene `campus_id`: el acotado es "lo que hice yo" ∪ "lo que
 * pasó en mis semestres". El superadmin global ve todo.
 */
export async function listAuditLog(user, filters) {
  if (isGlobalScope(user)) {
    return auditModel.listPaginated({ ...filters, all: true });
  }
  const semesterIds = await semesterModel.idsByCampus(user.campusId);
  return auditModel.listPaginated({ ...filters, all: false, userId: user.id, semesterIds });
}
