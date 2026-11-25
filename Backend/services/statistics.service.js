/**
 * statistics.service.js — estadísticas de un ciclo, turno por turno.
 *
 * Sólo lectura (los `viewer` también entran). Dado un semestre, junta los dos
 * turnos con el mismo código en el mismo campus. Las queries viven en `models/`
 * y las cuentas en `utils/statistics.js`.
 */
import { transaction } from '../config/db.js';
import * as semesterModel from '../models/semester.model.js';
import * as studentModel from '../models/student.model.js';
import * as offeringModel from '../models/offering.model.js';
import * as submissionModel from '../models/submission.model.js';
import { assertCampusAccess } from '../middlewares/campusScope.middleware.js';
import { buildShiftStatistics, combineShiftStatistics } from '../utils/statistics.js';
import { SHIFTS } from '../utils/shift.js';
import { apiError } from '../utils/apiError.js';

async function loadShift(semester, tx) {
  const [offerings, preferenceCounts, statusCounts, rosterRows, submittedRows, inactiveWithSubmission] =
    await Promise.all([
      offeringModel.overviewBySemester(semester.id, tx),
      submissionModel.countPreferencesBySubjectRank(semester.id, tx),
      submissionModel.countByStatus(semester.id, tx),
      studentModel.countActiveBySchoolGroup(semester.id, {}, tx),
      studentModel.countActiveBySchoolGroup(semester.id, { onlySubmitted: true }, tx),
      studentModel.countInactiveWithSubmission(semester.id, tx),
    ]);

  return {
    shift: semester.shift,
    semester: {
      id: semester.id,
      label: semester.label,
      isCurrent: semester.isCurrent,
      ranksRequired: semester.ranksRequired,
    },
    ...buildShiftStatistics({
      offerings,
      preferenceCounts,
      statusCounts,
      rosterRows,
      submittedRows,
      inactiveWithSubmission,
    }),
  };
}

export function semesterStatistics(user, semesterId) {
  // REPEATABLE READ: con la ventana abierta entran envíos mientras se cuenta, y
  // todas las cifras de la pantalla tienen que salir de la misma foto.
  return transaction(
    async (tx) => {
      const base = await semesterModel.findByIdWithCampus(semesterId, tx);
      if (!base) throw apiError(404, 'SEMESTER_NOT_FOUND');
      assertCampusAccess(user, base.campusId);

      const siblings = await semesterModel.listByCampusCode(base.campusId, base.code, tx);
      const shifts = [];
      for (const semester of siblings) shifts.push(await loadShift(semester, tx));

      return {
        code: base.code,
        campus: base.campus,
        generatedAt: new Date().toISOString(),
        shifts,
        missingShifts: SHIFTS.filter((s) => !shifts.some((x) => x.shift === s)),
        totals: combineShiftStatistics(shifts),
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 15_000 },
  );
}
