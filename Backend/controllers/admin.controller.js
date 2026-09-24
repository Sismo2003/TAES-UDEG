/**
 * admin.controller.js — panel interno.
 *
 * Un controller de este proyecto hace TRES cosas y ninguna más:
 *   1. sanitiza el input (querystring vía `utils/queryParams.js`, body vía el
 *      service),
 *   2. llama al service,
 *   3. arma el envelope `{ data, message }`.
 *
 * **No escribe queries.** Ni un `prisma.` aparece acá: las consultas viven en
 * `models/` (ver `Backend/models/README.md`). Si necesitás un filtro nuevo, se
 * agrega al modelo y se le pasa ya sanitizado desde acá.
 */
import * as admin from '../services/admin.service.js';
import * as allocation from '../services/allocation.service.js';
import { isExposable } from '../utils/apiError.js';
import {
  parseEnum,
  parseId,
  parseOptionalBool,
  parsePagination,
  parseSearch,
  parseSort,
} from '../utils/queryParams.js';

function fail(res, err, tag) {
  if (err?.code === 'P2002') return res.status(409).json({ data: false, message: 'CONFLICT' });
  if (isExposable(err)) {
    return res.status(err.status).json({ data: false, message: err.message });
  }
  console.error(`[ADMIN] ${tag}:`, err);
  return res.status(500).json({ data: false, message: 'INTERNAL_ERROR' });
}

const ip = (req) => req.ip;

/** Envelope de un listado paginado. Una sola forma para todas las tablas. */
const paged = (res, { rows, total }, { page, pageSize }) =>
  res.status(200).json({ data: { rows, total, page, pageSize } });

// ── Campuses ────────────────────────────────────────────────────────────────

export const listCampuses = async (req, res) => {
  try {
    return res.status(200).json({ data: await admin.listCampuses(req.user) });
  } catch (err) {
    return fail(res, err, 'listCampuses');
  }
};

// ── Semesters ───────────────────────────────────────────────────────────────

export const listSemesters = async (req, res) => {
  try {
    return res.status(200).json({ data: await admin.listSemesters(req.user) });
  } catch (err) {
    return fail(res, err, 'listSemesters');
  }
};

export const getSemester = async (req, res) => {
  try {
    return res.status(200).json({ data: await admin.getSemester(req.user, req.params.id) });
  } catch (err) {
    return fail(res, err, 'getSemester');
  }
};

export const createSemester = async (req, res) => {
  try {
    const data = await admin.createSemester(req.user, req.body ?? {}, ip(req));
    return res.status(201).json({ data, message: 'SEMESTER_CREATED' });
  } catch (err) {
    return fail(res, err, 'createSemester');
  }
};

export const updateSemester = async (req, res) => {
  try {
    const data = await admin.updateSemester(req.user, req.params.id, req.body ?? {}, ip(req));
    return res.status(200).json({ data, message: 'SEMESTER_UPDATED' });
  } catch (err) {
    return fail(res, err, 'updateSemester');
  }
};

export const changeWindow = async (req, res) => {
  try {
    const data = await admin.changeWindowMode(req.user, req.params.id, req.body?.windowMode, ip(req));
    return res.status(200).json({ data, message: 'WINDOW_UPDATED' });
  } catch (err) {
    return fail(res, err, 'changeWindow');
  }
};

export const setCurrent = async (req, res) => {
  try {
    const data = await admin.setCurrentSemester(req.user, req.params.id, ip(req));
    return res.status(200).json({ data, message: 'SEMESTER_SET_CURRENT' });
  } catch (err) {
    return fail(res, err, 'setCurrent');
  }
};

export const clearCurrent = async (req, res) => {
  try {
    const data = await admin.clearCurrentSemester(req.user, req.params.id, ip(req));
    return res.status(200).json({ data, message: 'SEMESTER_CLEAR_CURRENT' });
  } catch (err) {
    return fail(res, err, 'clearCurrent');
  }
};

export const overview = async (req, res) => {
  try {
    return res.status(200).json({ data: await admin.semesterOverview(req.user, req.params.id) });
  } catch (err) {
    return fail(res, err, 'overview');
  }
};

// ── Padrón ──────────────────────────────────────────────────────────────────

export const listStudents = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const filters = {
      ...pagination,
      search: parseSearch(req.query.search),
      isActive: parseOptionalBool(req.query.isActive),
      hasSubmission: parseOptionalBool(req.query.hasSubmission),
      sort: parseSort(req.query.sort, ['code', 'fullName', 'createdAt'], {
        field: 'code',
        dir: 'asc',
      }),
    };
    const result = await admin.listStudents(req.user, req.params.id, filters);
    return paged(res, result, pagination);
  } catch (err) {
    return fail(res, err, 'listStudents');
  }
};

export const createStudent = async (req, res) => {
  try {
    const data = await admin.createStudent(req.user, req.params.id, req.body ?? {}, ip(req));
    return res.status(201).json({ data, message: 'STUDENT_CREATED' });
  } catch (err) {
    return fail(res, err, 'createStudent');
  }
};

export const updateStudent = async (req, res) => {
  try {
    const data = await admin.updateStudent(
      req.user, req.params.id, req.params.studentId, req.body ?? {}, ip(req),
    );
    return res.status(200).json({ data, message: 'STUDENT_UPDATED' });
  } catch (err) {
    return fail(res, err, 'updateStudent');
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const data = await admin.deleteStudent(req.user, req.params.id, req.params.studentId, ip(req));
    return res.status(200).json({ data, message: 'STUDENT_REMOVED' });
  } catch (err) {
    return fail(res, err, 'deleteStudent');
  }
};

export const bulkStudents = async (req, res) => {
  try {
    const data = await admin.bulkUploadStudents(
      req.user, req.params.id, req.body?.students, ip(req),
    );
    return res.status(200).json({ data, message: 'STUDENTS_UPLOADED' });
  } catch (err) {
    return fail(res, err, 'bulkStudents');
  }
};

// ── Envíos ──────────────────────────────────────────────────────────────────

const SUBMISSION_STATUSES = ['pending', 'allocated', 'unplaced'];

export const listSubmissions = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const result = await admin.listSubmissions(req.user, req.params.id, {
      ...pagination,
      search: parseSearch(req.query.search),
      status: parseEnum(req.query.status, SUBMISSION_STATUSES),
      // "Quiénes quedaron en este grupo / en esta asignatura" (panel de
      // Asignaciones). El modelo los aplica sobre la asignación, no sobre el
      // envío: filtrar por grupo excluye a los `unplaced` por definición.
      groupId: parseId(req.query.groupId),
      semesterSubjectId: parseId(req.query.semesterSubjectId),
    });
    return paged(res, result, pagination);
  } catch (err) {
    return fail(res, err, 'listSubmissions');
  }
};

// ── Catálogo de asignaturas ─────────────────────────────────────────────────

export const listSubjects = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const result = await admin.listSubjects({
      ...pagination,
      search: parseSearch(req.query.search),
      isActive: parseOptionalBool(req.query.isActive),
      sort: parseSort(req.query.sort, ['code', 'name'], { field: 'name', dir: 'asc' }),
    });
    return paged(res, result, pagination);
  } catch (err) {
    return fail(res, err, 'listSubjects');
  }
};

/** Catálogo sin paginar — sólo id/code/name, para poblar el selector de oferta. */
export const listSubjectOptions = async (_req, res) => {
  try {
    return res.status(200).json({ data: await admin.listSubjectOptions() });
  } catch (err) {
    return fail(res, err, 'listSubjectOptions');
  }
};

export const createSubject = async (req, res) => {
  try {
    const data = await admin.createSubject(req.user, req.body ?? {}, ip(req));
    return res.status(201).json({ data, message: 'SUBJECT_CREATED' });
  } catch (err) {
    return fail(res, err, 'createSubject');
  }
};

export const updateSubject = async (req, res) => {
  try {
    const data = await admin.updateSubject(req.user, req.params.id, req.body ?? {}, ip(req));
    return res.status(200).json({ data, message: 'SUBJECT_UPDATED' });
  } catch (err) {
    return fail(res, err, 'updateSubject');
  }
};

// ── Oferta y grupos ─────────────────────────────────────────────────────────

export const listOfferings = async (req, res) => {
  try {
    return res.status(200).json({ data: await admin.listOfferings(req.user, req.params.id) });
  } catch (err) {
    return fail(res, err, 'listOfferings');
  }
};

export const addOffering = async (req, res) => {
  try {
    const data = await admin.addOffering(req.user, req.params.id, req.body ?? {}, ip(req));
    return res.status(201).json({ data, message: 'OFFERING_ADDED' });
  } catch (err) {
    return fail(res, err, 'addOffering');
  }
};

export const updateOffering = async (req, res) => {
  try {
    const data = await admin.updateOffering(
      req.user, req.params.id, req.params.offeringId, req.body ?? {},
    );
    return res.status(200).json({ data, message: 'OFFERING_UPDATED' });
  } catch (err) {
    return fail(res, err, 'updateOffering');
  }
};

export const createGroup = async (req, res) => {
  try {
    const data = await admin.createGroup(req.user, req.params.id, req.body ?? {}, ip(req));
    return res.status(201).json({ data, message: 'GROUP_CREATED' });
  } catch (err) {
    return fail(res, err, 'createGroup');
  }
};

export const updateGroup = async (req, res) => {
  try {
    const data = await admin.updateGroup(
      req.user, req.params.id, req.params.groupId, req.body ?? {}, ip(req),
    );
    return res.status(200).json({ data, message: 'GROUP_UPDATED' });
  } catch (err) {
    return fail(res, err, 'updateGroup');
  }
};

// ── Asignación ──────────────────────────────────────────────────────────────

export const allocate = async (req, res) => {
  try {
    const data = await allocation.runAllocation(req.user, req.params.id, ip(req));
    return res.status(200).json({ data, message: 'ALLOCATION_DONE' });
  } catch (err) {
    return fail(res, err, 'allocate');
  }
};

export const overrideAssignment = async (req, res) => {
  try {
    const data = await allocation.overrideAssignment(
      req.user, req.params.id, req.body?.groupId, req.body?.notes, ip(req),
    );
    return res.status(200).json({ data, message: 'ASSIGNMENT_MOVED' });
  } catch (err) {
    return fail(res, err, 'overrideAssignment');
  }
};

export const placeSubmission = async (req, res) => {
  try {
    const data = await allocation.placeSubmission(
      req.user, req.body?.submissionId, req.body?.groupId, req.body?.notes, ip(req),
    );
    return res.status(201).json({ data, message: 'SUBMISSION_PLACED' });
  } catch (err) {
    return fail(res, err, 'placeSubmission');
  }
};

// ── Bitácora ────────────────────────────────────────────────────────────────

const AUDIT_ENTITY_TYPES = ['semester', 'semester_subject', 'subject_group', 'group_assignment', 'subject'];

export const auditLog = async (req, res) => {
  try {
    const pagination = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 500 });
    const result = await admin.listAuditLog(req.user, {
      ...pagination,
      search: parseSearch(req.query.search),
      action: parseSearch(req.query.action, 64),
      entityType: parseEnum(req.query.entityType, AUDIT_ENTITY_TYPES),
    });
    return paged(res, result, pagination);
  } catch (err) {
    return fail(res, err, 'auditLog');
  }
};
