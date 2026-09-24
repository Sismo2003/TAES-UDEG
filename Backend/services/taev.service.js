/**
 * taev.service.js — lógica del portal público (sin auth).
 *
 * Tres operaciones: estado de la ventana, verificación del código y envío del
 * formulario. Las tres comparten la resolución del campus y NUNCA deciden la
 * ventana por su cuenta: llaman a `resolveSemesterWindow()` (Docs/DATABASE.md §6).
 *
 * Las queries viven en `models/` — este archivo decide, no consulta.
 */
import { transaction } from '../config/db.js';
import { TAEV_CONFIG } from '../config/main.js';
import * as campusModel from '../models/campus.model.js';
import * as semesterModel from '../models/semester.model.js';
import * as studentModel from '../models/student.model.js';
import * as offeringModel from '../models/offering.model.js';
import * as submissionModel from '../models/submission.model.js';
import { resolveSemesterWindow } from '../utils/semesterWindow.js';
import { apiError } from '../utils/apiError.js';

/**
 * Resuelve a qué campus apunta la request.
 *
 *  1. Explícito (`?campus=` o `body.campus`): se usa ese. 404 si no existe.
 *  2. Omitido + exactamente un campus con semestre `is_current`: se usa ese.
 *  3. Omitido + más de uno: 400 CAMPUS_REQUIRED. NUNCA adivina.
 *  4. Omitido + ninguno con semestre activo: si hay un solo campus activo en
 *     total, se usa (para poder devolver `semester: null`); si no, 400.
 */
async function resolveCampus(campusCode) {
  if (campusCode) {
    const campus = await campusModel.findActiveByCode(campusCode);
    if (!campus) throw apiError(404, 'CAMPUS_NOT_FOUND');
    return campus;
  }

  const withCurrent = await campusModel.listActiveWithCurrentSemester();
  if (withCurrent.length === 1) return withCurrent[0];
  if (withCurrent.length > 1) throw apiError(400, 'CAMPUS_REQUIRED');

  const active = await campusModel.listActive();
  if (active.length === 1) return active[0];
  throw apiError(400, 'CAMPUS_REQUIRED');
}

/** GET /api/taev/status */
export async function getStatus(campusCode) {
  const campus = await resolveCampus(campusCode);
  const semester = await semesterModel.findCurrentByCampus(campus.id);
  const window = resolveSemesterWindow(semester ?? null, new Date());

  return {
    campus: { code: campus.code, name: campus.name },
    semester: semester
      ? { code: semester.code, label: semester.label, ranksRequired: semester.ranksRequired }
      : null,
    window,
    offerings: semester ? await offeringModel.listActiveBySemester(semester.id) : [],
  };
}

/** POST /api/taev/verify-code */
export async function verifyCode(campusCode, code) {
  if (!TAEV_CONFIG.studentCodePattern.test(String(code ?? ''))) {
    throw apiError(400, 'INVALID_CODE_FORMAT');
  }

  const campus = await resolveCampus(campusCode);
  const semester = await semesterModel.findCurrentByCampus(campus.id);
  const window = resolveSemesterWindow(semester ?? null, new Date());
  if (!window.isOpen) throw apiError(403, window.reason);

  const student = await studentModel.findActiveByCode(semester.id, code);
  if (!student) throw apiError(404, 'CODE_NOT_FOUND');
  if (student.submission) throw apiError(409, 'ALREADY_SUBMITTED');

  return {
    studentName: student.fullName,
    semesterLabel: semester.label,
    ranksRequired: semester.ranksRequired,
    offerings: await offeringModel.listActiveBySemester(semester.id),
  };
}

/**
 * Valida la forma de `preferences` contra `ranksRequired`. Lanza
 * `400 INVALID_PREFERENCES` ante cualquier desviación.
 */
function assertPreferencesShape(preferences, ranksRequired) {
  if (!Array.isArray(preferences) || preferences.length !== ranksRequired) {
    throw apiError(400, 'INVALID_PREFERENCES');
  }

  const ranks = [];
  const subjectIds = [];
  for (const p of preferences) {
    const rank = Number(p?.rank);
    const ssid = Number(p?.semesterSubjectId);
    if (!Number.isInteger(rank) || !Number.isInteger(ssid)) {
      throw apiError(400, 'INVALID_PREFERENCES');
    }
    ranks.push(rank);
    subjectIds.push(ssid);
  }

  const expected = new Set(Array.from({ length: ranksRequired }, (_, i) => i + 1));
  if (ranks.length !== expected.size || !ranks.every((r) => expected.delete(r))) {
    throw apiError(400, 'INVALID_PREFERENCES');
  }
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw apiError(400, 'INVALID_PREFERENCES');
  }

  return subjectIds;
}

/**
 * POST /api/taev/submit
 *
 * Todo dentro de una transacción: la ventana se REVALIDA acá (un alumno que
 * pasó a las 10:14:59 no puede enviar a las 10:20), el código se re-chequea y
 * las preferencias se validan contra la oferta activa antes de insertar.
 */
export async function submitPreferences({ campusCode, code, preferences, ip, userAgent }) {
  if (!TAEV_CONFIG.studentCodePattern.test(String(code ?? ''))) {
    throw apiError(400, 'INVALID_CODE_FORMAT');
  }

  const campus = await resolveCampus(campusCode);

  return transaction(async (tx) => {
    const semester = await semesterModel.findCurrentByCampus(campus.id, tx);
    const window = resolveSemesterWindow(semester ?? null, new Date());
    if (!window.isOpen) throw apiError(403, window.reason);

    const student = await studentModel.findActiveByCode(semester.id, code, tx);
    if (!student) throw apiError(404, 'CODE_NOT_FOUND');
    if (student.submission) throw apiError(409, 'ALREADY_SUBMITTED');

    const subjectIds = assertPreferencesShape(preferences, semester.ranksRequired);

    const valid = await offeringModel.findActiveByIds(semester.id, subjectIds, tx);
    if (valid.length !== subjectIds.length) throw apiError(400, 'INVALID_PREFERENCES');
    const nameById = new Map(valid.map((v) => [v.id, v.subject.name]));

    const submission = await submissionModel.createWithPreferences(
      { semesterId: semester.id, studentId: student.id, ip, userAgent, preferences },
      tx,
    );

    return {
      semesterLabel: semester.label,
      submittedAt: submission.submittedAt.toISOString(),
      preferences: preferences
        .slice()
        .sort((a, b) => Number(a.rank) - Number(b.rank))
        .map((p) => ({ rank: Number(p.rank), name: nameById.get(Number(p.semesterSubjectId)) })),
    };
  });
}
