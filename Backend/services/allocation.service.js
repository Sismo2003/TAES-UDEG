/**
 * allocation.service.js — el motor de asignación y los ajustes manuales.
 *
 * Implementación de Docs/DATABASE.md §7.3. Puntos que no se tocan:
 *   - Orden de llegada estricto: `submitted_at ASC, id ASC`.
 *   - Preferencia 1 → 2 → … → ranksRequired; lleno NO abandona al alumno.
 *   - Sólo oferta activa (semester_subject.is_active Y subject_group.is_active).
 *   - Re-ejecutable: no toca `allocated`, sí reconsidera `unplaced`.
 *   - Serializado con un advisory lock por semestre (no SERIALIZABLE).
 *   - `assigned_count` se recalcula DESDE la realidad, no incrementando en JS;
 *     si viola el CHECK, la transacción entera aborta.
 *
 * Las queries (incluidos el lock y el recálculo, que son SQL crudo) viven en
 * `models/group.model.js`. Este archivo decide el reparto, no consulta.
 */
import { transaction } from '../config/db.js';
import * as semesterModel from '../models/semester.model.js';
import * as submissionModel from '../models/submission.model.js';
import * as groupModel from '../models/group.model.js';
import * as assignmentModel from '../models/assignment.model.js';
import * as auditModel from '../models/audit.model.js';
import { assertCampusAccess } from '../middlewares/campusScope.middleware.js';
import { apiError } from '../utils/apiError.js';

/**
 * Revalida el grupo destino de un movimiento manual: mismo semestre, activo, y
 * con lugar. `skipIfSame` evita el falso "lleno" cuando se re-guarda un alumno
 * en el grupo donde ya está.
 */
function assertTargetUsable(target, semesterId, { skipCapacity = false } = {}) {
  if (!target) throw apiError(404, 'GROUP_NOT_FOUND');
  if (target.semesterSubject.semesterId !== semesterId) throw apiError(400, 'GROUP_OTHER_SEMESTER');
  if (!target.isActive || !target.semesterSubject.isActive) throw apiError(409, 'GROUP_INACTIVE');
  if (!skipCapacity && target.assignedCount >= target.capacity) throw apiError(409, 'GROUP_FULL');
}

/**
 * Todo movimiento manual exige una nota: es el registro de por qué se hizo la
 * excepción, y es lo único que explica una asignación fuera de preferencia
 * cuando alguien audite la bitácora seis meses después.
 */
function assertNote(notes) {
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (text.length === 0) throw apiError(400, 'NOTE_REQUIRED');
  return text;
}

export async function runAllocation(user, semesterId, ip) {
  const sid = Number(semesterId);

  return transaction(async (tx) => {
    await groupModel.acquireAllocationLock(tx, sid);

    const semester = await semesterModel.findById(sid, tx);
    if (!semester) throw apiError(404, 'SEMESTER_NOT_FOUND');
    assertCampusAccess(user, semester.campusId);

    const submissions = await submissionModel.listForAllocation(sid, tx);
    const groups = await groupModel.listAllocatable(sid, tx);

    const bySubject = new Map();
    for (const g of groups) {
      if (!bySubject.has(g.semesterSubjectId)) bySubject.set(g.semesterSubjectId, []);
      bySubject.get(g.semesterSubjectId).push({ ...g, free: g.capacity - g.assignedCount });
    }

    const newAssignments = [];
    const placed = [];
    const unplaced = [];

    for (const sub of submissions) {
      let hit = null;
      for (const pref of sub.preferences) {
        const candidates = bySubject.get(pref.semesterSubjectId) ?? [];
        const group = candidates.find((g) => g.free > 0);
        if (group) {
          group.free -= 1;
          hit = { group, rank: pref.rank };
          break;
        }
      }
      if (hit) {
        newAssignments.push({
          submissionId: sub.id,
          groupId: hit.group.id,
          assignedRank: hit.rank,
          assignedById: user.id,
          isManualOverride: false,
        });
        placed.push(sub.id);
      } else {
        unplaced.push(sub.id);
      }
    }

    if (newAssignments.length > 0) {
      await assignmentModel.createMany(newAssignments, tx);
    }

    const now = new Date();
    if (placed.length > 0) await submissionModel.markStatus(placed, 'allocated', now, tx);
    if (unplaced.length > 0) await submissionModel.markStatus(unplaced, 'unplaced', now, tx);

    await groupModel.recomputeAssignedCounts(tx, sid);

    await auditModel.write(
      {
        userId: user.id,
        action: 'allocation.run',
        entityType: 'semester',
        entityId: sid,
        payload: {
          placed: placed.length,
          unplaced: unplaced.length,
          ranksRequired: semester.ranksRequired,
        },
        ip,
      },
      tx,
    );

    return { placed: placed.length, unplaced: unplaced.length };
  });
}

/**
 * Mueve a un alumno a otro grupo del MISMO semestre. Toma el mismo advisory
 * lock que el allocator para no reabrir la puerta al sobrecupo. Si el alumno
 * estaba `unplaced`, su estado pasa a `allocated` en la misma transacción.
 */
export async function overrideAssignment(user, assignmentId, targetGroupId, notes, ip) {
  const note = assertNote(notes);

  return transaction(async (tx) => {
    const assignment = await assignmentModel.findByIdWithContext(assignmentId, tx);
    if (!assignment) throw apiError(404, 'ASSIGNMENT_NOT_FOUND');

    const { submission } = assignment;
    assertCampusAccess(user, submission.semester.campusId);
    await groupModel.acquireAllocationLock(tx, submission.semesterId);

    const target = await groupModel.findTarget(targetGroupId, tx);
    assertTargetUsable(target, submission.semesterId, {
      skipCapacity: target?.id === assignment.groupId,
    });

    const matchingPref = submission.preferences.find(
      (p) => p.semesterSubjectId === target.semesterSubjectId,
    );

    await assignmentModel.updateById(
      assignment.id,
      {
        groupId: target.id,
        // `null` (no 0) cuando el destino no es ninguna de sus preferencias: el
        // CHECK acepta NULL o >= 1, y "fuera de preferencia" es un dato, no un
        // rank inventado.
        assignedRank: matchingPref?.rank ?? null,
        assignedById: user.id,
        isManualOverride: true,
        notes: note,
      },
      tx,
    );

    if (submission.status !== 'allocated') {
      await submissionModel.updateStatus(submission.id, 'allocated', new Date(), tx);
    }

    await groupModel.recomputeAssignedCounts(tx, submission.semesterId);

    await auditModel.write(
      {
        userId: user.id,
        action: 'assignment.override',
        entityType: 'group_assignment',
        entityId: assignment.id,
        payload: { fromGroup: assignment.groupId, toGroup: target.id },
        ip,
      },
      tx,
    );

    return { assignmentId: assignment.id, groupId: target.id };
  });
}

/**
 * Coloca a mano a un alumno que no tiene asignación (típicamente `unplaced`).
 * Extiende la superficie documentada: `PATCH /assignments/:id` sólo mueve una
 * asignación existente.
 */
export async function placeSubmission(user, submissionId, targetGroupId, notes, ip) {
  const note = assertNote(notes);

  return transaction(async (tx) => {
    const submission = await submissionModel.findByIdForPlacement(submissionId, tx);
    if (!submission) throw apiError(404, 'SUBMISSION_NOT_FOUND');
    if (submission.assignment) throw apiError(409, 'ALREADY_ASSIGNED');
    assertCampusAccess(user, submission.semester.campusId);
    await groupModel.acquireAllocationLock(tx, submission.semesterId);

    const target = await groupModel.findTarget(targetGroupId, tx);
    assertTargetUsable(target, submission.semesterId);

    const matchingPref = submission.preferences.find(
      (p) => p.semesterSubjectId === target.semesterSubjectId,
    );

    const created = await assignmentModel.create(
      {
        submissionId: submission.id,
        groupId: target.id,
        // `null` = colocado fuera de sus preferencias. Ver overrideAssignment.
        assignedRank: matchingPref?.rank ?? null,
        assignedById: user.id,
        isManualOverride: true,
        notes: note,
      },
      tx,
    );

    await submissionModel.updateStatus(submission.id, 'allocated', new Date(), tx);
    await groupModel.recomputeAssignedCounts(tx, submission.semesterId);

    await auditModel.write(
      {
        userId: user.id,
        action: 'assignment.override',
        entityType: 'group_assignment',
        entityId: created.id,
        payload: { placed: submission.id, toGroup: target.id, manual: true },
        ip,
      },
      tx,
    );

    return { assignmentId: created.id, groupId: target.id };
  });
}
