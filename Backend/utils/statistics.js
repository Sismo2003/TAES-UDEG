/**
 * statistics.js — cuentas de la pantalla "Estadísticas" (puro, sin BD).
 *
 * Responde una pregunta: ¿qué grupos y lugares hay que abrir en cada turno para
 * que todos queden en un grupo? Por eso cuenta EXACTAMENTE lo que cuenta el
 * motor de asignación:
 *   - lugares: grupos activos de ofertas activas (`groupModel.listAllocatable`);
 *   - envíos: todos los del semestre, incluidos los de alumnos dados de baja
 *     después de enviar (el motor también los coloca y ocupan lugar).
 *
 * Los lugares NO se comparten entre turnos: el total de la red de un ciclo
 * nunca netea el sobrante de un turno contra el faltante del otro.
 */

const sum = (list, pick) => list.reduce((acc, item) => acc + pick(item), 0);

const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

const byName = (a, b) => a.localeCompare(b, 'es-MX', { numeric: true, sensitivity: 'base' });

/**
 * Grupo escolar de una fila del padrón: el grupo si lo trae, si no el programa,
 * si no `null` ("Sin grupo"). El Admin repite esta regla al armar el CSV.
 */
export function schoolGroupName({ studentSemesterLabel, career }) {
  return clean(studentSemesterLabel) ?? clean(career);
}

/**
 * Padrón vs. envíos por grupo escolar. Primero los grupos donde nadie ha enviado
 * (suelen ser una lista mal cargada), después por cuántos faltan.
 */
export function buildSchoolGroups(rosterRows, submittedRows) {
  const groups = new Map();
  const entry = (row) => {
    const name = schoolGroupName(row);
    if (!groups.has(name)) groups.set(name, { name, roster: 0, submitted: 0 });
    return groups.get(name);
  };
  for (const row of rosterRows) entry(row).roster += row.count;
  for (const row of submittedRows) entry(row).submitted += row.count;

  return [...groups.values()]
    .map((g) => ({ ...g, missing: g.roster - g.submitted }))
    .sort(
      (a, b) =>
        Number(a.submitted > 0) - Number(b.submitted > 0) ||
        b.missing - a.missing ||
        byName(a.name ?? '', b.name ?? ''),
    );
}

/**
 * Lugares contra demanda por materia, ordenado por demanda de 1ª opción.
 * Una oferta inactiva sólo aparece si alguien la eligió o quedó asignado en
 * ella: no aporta lugares, pero esconder esa demanda confundiría.
 */
export function buildSubjects(offerings, preferenceCounts) {
  const demand = new Map();
  for (const { semesterSubjectId, rank, count } of preferenceCounts) {
    const d = demand.get(semesterSubjectId) ?? { first: 0, any: 0 };
    if (rank === 1) d.first += count;
    // Una asignatura no se puede rankear dos veces en un envío (UNIQUE), así que
    // sumar todos los ranks es contar estudiantes distintos.
    d.any += count;
    demand.set(semesterSubjectId, d);
  }

  return offerings
    .map((o) => {
      const groups = o.groups.map((g) => ({
        id: g.id,
        label: g.label,
        capacity: g.capacity,
        assigned: g.assignedCount,
        isActive: g.isActive,
        /** `true` ⇒ el motor de asignación puede usar este grupo. */
        counts: o.isActive && g.isActive,
      }));
      const usable = groups.filter((g) => g.counts);
      const seats = sum(usable, (g) => g.capacity);
      const assigned = sum(usable, (g) => g.assigned);
      const d = demand.get(o.semesterSubjectId) ?? { first: 0, any: 0 };
      return {
        semesterSubjectId: o.semesterSubjectId,
        name: o.name,
        isActive: o.isActive,
        groups,
        seats,
        firstChoice: d.first,
        anyChoice: d.any,
        difference: seats - d.first,
        assigned,
        free: seats - assigned,
      };
    })
    .filter((s) => s.isActive || s.anyChoice > 0 || s.groups.some((g) => g.assigned > 0))
    .sort((a, b) => b.firstChoice - a.firstChoice || b.anyChoice - a.anyChoice || byName(a.name, b.name));
}

/** `before` = nadie resuelto · `partial` = corrió y quedan pendientes · `after`. */
function resolvePhase({ pending, allocated, unplaced }) {
  if (allocated + unplaced === 0) return 'before';
  return pending > 0 ? 'partial' : 'after';
}

/** Cuentas de un turno (un semestre). */
export function buildShiftStatistics({
  offerings,
  preferenceCounts,
  statusCounts,
  rosterRows,
  submittedRows,
  inactiveWithSubmission,
}) {
  const subjects = buildSubjects(offerings, preferenceCounts);
  const bySchoolGroup = buildSchoolGroups(rosterRows, submittedRows);
  const allGroups = subjects.flatMap((s) => s.groups);

  // El cupo excluido se mide sobre TODA la oferta, incluidas las materias
  // inactivas que `buildSubjects` no lista: así cuadra con el Dashboard.
  const rawGroups = offerings.flatMap((o) =>
    o.groups.map((g) => ({ capacity: g.capacity, counts: o.isActive && g.isActive })),
  );

  const roster = sum(bySchoolGroup, (g) => g.roster);
  const submitted = sum(bySchoolGroup, (g) => g.submitted);
  const { pending, allocated, unplaced } = statusCounts;
  const total = sum(subjects, (s) => s.seats);
  const assigned = sum(subjects, (s) => s.assigned);

  return {
    phase: resolvePhase(statusCounts),
    students: {
      roster,
      submitted,
      notSubmitted: roster - submitted,
      inactiveWithSubmission,
    },
    submissions: { total: pending + allocated + unplaced, pending, allocated, unplaced },
    seats: {
      total,
      groups: allGroups.filter((g) => g.counts).length,
      assigned,
      /** Lugares que quedan libres tras colocar a TODOS los que ya enviaron. */
      freeAfterPlacing: total - assigned - pending,
      /** Si todos toman materia: negativo = faltan, positivo = sobran. */
      balance: total - roster - inactiveWithSubmission,
      /** Cupo de grupos o materias inactivos (el Dashboard sí lo suma). */
      excluded: sum(
        rawGroups.filter((g) => !g.counts),
        (g) => g.capacity,
      ),
      assignedInInactive: sum(
        allGroups.filter((g) => !g.counts),
        (g) => g.assigned,
      ),
    },
    subjects,
    schoolGroups: bySchoolGroup,
  };
}

/** Separa faltantes y sobrantes: NUNCA se compensan entre turnos. */
function splitBalance(values) {
  return {
    missing: sum(values, (v) => Math.max(0, -v)),
    surplus: sum(values, (v) => Math.max(0, v)),
  };
}

/**
 * Total de los turnos de un mismo ciclo. Un turno sin nadie en la lista no entra
 * al balance: sus lugares no "sobran", todavía no se sabe quién los necesita.
 */
export function combineShiftStatistics(shifts) {
  const add = (pick) => sum(shifts, pick);
  const withDemand = shifts.filter(
    (s) => s.students.roster + s.students.inactiveWithSubmission > 0,
  );
  return {
    students: {
      roster: add((s) => s.students.roster),
      submitted: add((s) => s.students.submitted),
      notSubmitted: add((s) => s.students.notSubmitted),
      inactiveWithSubmission: add((s) => s.students.inactiveWithSubmission),
    },
    submissions: {
      total: add((s) => s.submissions.total),
      pending: add((s) => s.submissions.pending),
      allocated: add((s) => s.submissions.allocated),
      unplaced: add((s) => s.submissions.unplaced),
    },
    seats: {
      total: add((s) => s.seats.total),
      groups: add((s) => s.seats.groups),
      assigned: add((s) => s.seats.assigned),
      freeAfterPlacing: splitBalance(shifts.map((s) => s.seats.freeAfterPlacing)),
      balance: splitBalance(withDemand.map((s) => s.seats.balance)),
    },
  };
}
