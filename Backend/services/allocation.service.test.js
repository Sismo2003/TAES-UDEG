/**
 * allocation.service.test.js — el motor de asignación y los ajustes manuales.
 *
 * Estos tests corren contra PostgreSQL de verdad, no contra un mock, porque lo
 * que hay que probar ES la base: el CHECK `assigned_count <= capacity` y el
 * advisory lock son la garantía real contra el sobrecupo. Un mock del cliente
 * Prisma probaría que el JavaScript hace lo que el JavaScript dice, que es
 * justamente lo que no preocupa.
 *
 * Cada test arma su propio campus desechable (ver `test/helpers/fixture.js`) y
 * lo borra al terminar: correrlos contra la base de desarrollo no toca el
 * semestre demo.
 *
 * Si no hay base levantada, la suite se salta con un mensaje.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFixture,
  databaseAvailable,
  prisma,
  readAssignments,
  readGroups,
  readStatuses,
} from '../test/helpers/fixture.js';
import * as allocation from './allocation.service.js';

const hasDb = await databaseAvailable();
const options = hasDb
  ? {}
  : { skip: 'Sin base de datos: levantá PostgreSQL (ver README) para correr estos tests.' };

test.after(async () => {
  if (hasDb) await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// El motor
// ─────────────────────────────────────────────────────────────────────────────

test('reparte en orden de llegada estricto: el primero en enviar elige primero', options, async () => {
  // Un solo lugar en Robótica. Tres alumnos lo piden como rank 1.
  const f = await createFixture({
    offerings: [
      { name: 'Robótica', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'Ética', groups: [{ label: 'A', capacity: 5 }] },
    ],
    students: [
      [0, 1], // llega primero
      [0, 1],
      [0, 1],
    ],
  });

  try {
    const result = await allocation.runAllocation(f.user, f.semester.id, '127.0.0.1');
    assert.equal(result.placed, 3);
    assert.equal(result.unplaced, 0);

    const assignments = await readAssignments(f.semester.id);
    const first = assignments.find((a) => a.submissionId === f.students[0].submission.id);

    assert.equal(first.groupId, f.group(0).id, 'el primero en llegar se queda con Robótica');
    assert.equal(first.assignedRank, 1);

    for (const index of [1, 2]) {
      const later = assignments.find((a) => a.submissionId === f.students[index].submission.id);
      assert.equal(later.groupId, f.group(1).id, 'los que llegaron después caen a su rank 2');
      assert.equal(later.assignedRank, 2);
    }
  } finally {
    await f.cleanup();
  }
});

test('un rank lleno NO abandona al alumno: cae al 2 y al 3', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Llena 1', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'Llena 2', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'Con lugar', groups: [{ label: 'A', capacity: 5 }] },
    ],
    students: [
      [0, 1, 2], // se queda con la primera
      [0, 1, 2], // rank 1 lleno → rank 2
      [0, 1, 2], // rank 1 y 2 llenos → rank 3
    ],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const assignments = await readAssignments(f.semester.id);
    const rankOf = (i) =>
      assignments.find((a) => a.submissionId === f.students[i].submission.id).assignedRank;

    assert.equal(rankOf(0), 1);
    assert.equal(rankOf(1), 2);
    assert.equal(rankOf(2), 3);
  } finally {
    await f.cleanup();
  }
});

test('sin lugar en ninguna preferencia queda `unplaced`, no en un grupo al azar', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Pedida y llena', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'Libre pero NO pedida', groups: [{ label: 'A', capacity: 9 }] },
    ],
    students: [[0], [0]],
  });

  try {
    const result = await allocation.runAllocation(f.user, f.semester.id, null);
    assert.equal(result.placed, 1);
    assert.equal(result.unplaced, 1);

    const statuses = await readStatuses(f.semester.id);
    assert.equal(statuses[0].status, 'allocated');
    assert.equal(statuses[1].status, 'unplaced');

    const assignments = await readAssignments(f.semester.id);
    assert.equal(assignments.length, 1, 'al que no entró NO se le inventa un grupo');
  } finally {
    await f.cleanup();
  }
});

test('re-correr no duplica: respeta a los colocados y reconsidera a los sin lugar', options, async () => {
  const f = await createFixture({
    offerings: [{ name: 'Robótica', groups: [{ label: 'A', capacity: 1 }] }],
    students: [[0], [0]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const primera = await readAssignments(f.semester.id);

    // Segunda corrida sin cambios: no hay nada nuevo que repartir.
    const repetida = await allocation.runAllocation(f.user, f.semester.id, null);
    assert.equal(repetida.placed, 0);
    assert.equal(repetida.unplaced, 1);
    assert.deepEqual(await readAssignments(f.semester.id), primera, 'no se duplicó nada');

    // Se abre un lugar: la re-corrida SÍ recupera al que había quedado afuera.
    await prisma.subjectGroup.update({ where: { id: f.group(0).id }, data: { capacity: 2 } });
    const tercera = await allocation.runAllocation(f.user, f.semester.id, null);
    assert.equal(tercera.placed, 1);
    assert.equal(tercera.unplaced, 0);
    assert.equal((await readAssignments(f.semester.id)).length, 2);
  } finally {
    await f.cleanup();
  }
});

test('ignora la oferta y los grupos desactivados', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Oferta apagada', isActive: false, groups: [{ label: 'A', capacity: 9 }] },
      { name: 'Grupo apagado', groups: [{ label: 'A', capacity: 9, isActive: false }] },
      { name: 'Activa', groups: [{ label: 'A', capacity: 9 }] },
    ],
    students: [[0, 1, 2]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const [assignment] = await readAssignments(f.semester.id);
    assert.equal(assignment.groupId, f.group(2).id);
    assert.equal(assignment.assignedRank, 3);
  } finally {
    await f.cleanup();
  }
});

test('el contador `assigned_count` queda igual a las filas reales', options, async () => {
  const f = await createFixture({
    offerings: [{ name: 'Robótica', groups: [{ label: 'A', capacity: 2 }, { label: 'B', capacity: 2 }] }],
    students: [[0], [0], [0]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const groups = await readGroups(f.semester.id);
    const assignments = await readAssignments(f.semester.id);

    for (const g of groups) {
      const real = assignments.filter((a) => a.groupId === g.id).length;
      assert.equal(g.assignedCount, real, `el contador del grupo ${g.label} miente`);
      assert.ok(g.assignedCount <= g.capacity, 'sobrecupo');
    }
  } finally {
    await f.cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Colocación manual (placeSubmission)
// ─────────────────────────────────────────────────────────────────────────────

test('colocar a un `unplaced` fuera de sus preferencias deja `assignedRank` en null', options, async () => {
  // La regresión que motivó la migración `assigned_rank_nullable_for_overrides`:
  // antes se guardaba 0 y el CHECK `assigned_rank >= 1` abortaba la transacción.
  const f = await createFixture({
    offerings: [
      { name: 'Pedida y llena', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'No pedida', groups: [{ label: 'A', capacity: 5 }] },
    ],
    students: [[0], [0]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const sinLugar = f.students[1].submission.id;

    const result = await allocation.placeSubmission(
      f.user,
      sinLugar,
      f.group(1).id,
      'No quedaba lugar en lo que pidió.',
      null,
    );

    const assignment = (await readAssignments(f.semester.id)).find((a) => a.id === result.assignmentId);
    assert.equal(assignment.assignedRank, null, 'fuera de preferencia ⇒ null, nunca 0');
    assert.equal(assignment.isManualOverride, true);
    assert.equal(assignment.notes, 'No quedaba lugar en lo que pidió.');

    const statuses = await readStatuses(f.semester.id);
    assert.equal(statuses[1].status, 'allocated', 'el estado se actualiza en la misma operación');

    const grupo = (await readGroups(f.semester.id)).find((g) => g.id === f.group(1).id);
    assert.equal(grupo.assignedCount, 1, 'la colocación manual cuenta contra el cupo');
  } finally {
    await f.cleanup();
  }
});

test('colocar en una asignatura que SÍ pidió conserva el rank', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Llena', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'Su rank 2', groups: [{ label: 'A', capacity: 5 }] },
    ],
    students: [[0], [0, 1]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    // El segundo quedó en su rank 2 por el motor; lo saco y lo vuelvo a poner a
    // mano para probar la rama de `placeSubmission` con preferencia encontrada.
    const submissionId = f.students[1].submission.id;
    await prisma.groupAssignment.deleteMany({ where: { submissionId } });
    await prisma.formSubmission.update({ where: { id: submissionId }, data: { status: 'unplaced' } });

    const result = await allocation.placeSubmission(
      f.user,
      submissionId,
      f.group(1).id,
      'Recolocación manual.',
      null,
    );

    const assignment = (await readAssignments(f.semester.id)).find((a) => a.id === result.assignmentId);
    assert.equal(assignment.assignedRank, 2);
  } finally {
    await f.cleanup();
  }
});

test('no se puede colocar en un grupo lleno', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Llena', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'También llena', groups: [{ label: 'A', capacity: 1 }] },
    ],
    students: [[0], [1], [0, 1]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const sinLugar = f.students[2].submission.id;

    await assert.rejects(
      () => allocation.placeSubmission(f.user, sinLugar, f.group(0).id, 'Fuerzo el sobrecupo.', null),
      (err) => err.message === 'GROUP_FULL' && err.status === 409,
    );

    const grupo = (await readGroups(f.semester.id)).find((g) => g.id === f.group(0).id);
    assert.equal(grupo.assignedCount, 1, 'la transacción abortada no dejó rastro');
    assert.equal((await readStatuses(f.semester.id))[2].status, 'unplaced');
  } finally {
    await f.cleanup();
  }
});

test('no se puede colocar a alguien que ya tiene grupo', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Robótica', groups: [{ label: 'A', capacity: 5 }] },
      { name: 'Ética', groups: [{ label: 'A', capacity: 5 }] },
    ],
    students: [[0]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);

    await assert.rejects(
      () =>
        allocation.placeSubmission(
          f.user,
          f.students[0].submission.id,
          f.group(1).id,
          'Debería rebotar.',
          null,
        ),
      (err) => err.message === 'ALREADY_ASSIGNED' && err.status === 409,
    );
  } finally {
    await f.cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Mover una asignación (overrideAssignment)
// ─────────────────────────────────────────────────────────────────────────────

test('mover a otro grupo actualiza contadores de origen y destino, y audita', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Robótica', groups: [{ label: 'A', capacity: 5 }] },
      { name: 'Ética', groups: [{ label: 'A', capacity: 5 }] },
    ],
    students: [[0, 1]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const [antes] = await readAssignments(f.semester.id);
    assert.equal(antes.groupId, f.group(0).id);

    await allocation.overrideAssignment(f.user, antes.id, f.group(1).id, 'Cambio pedido por el alumno.', null);

    const [despues] = await readAssignments(f.semester.id);
    assert.equal(despues.groupId, f.group(1).id);
    assert.equal(despues.assignedRank, 2, 'el destino era su rank 2');
    assert.equal(despues.isManualOverride, true);

    const groups = await readGroups(f.semester.id);
    assert.equal(groups.find((g) => g.id === f.group(0).id).assignedCount, 0, 'el origen se liberó');
    assert.equal(groups.find((g) => g.id === f.group(1).id).assignedCount, 1);

    const audit = await prisma.auditLog.findFirst({
      where: { userId: f.user.id, action: 'assignment.override' },
      orderBy: { id: 'desc' },
    });
    assert.equal(audit.entityType, 'group_assignment');
    assert.equal(audit.entityId, antes.id);
    assert.equal(audit.payload.fromGroup, f.group(0).id);
    assert.equal(audit.payload.toGroup, f.group(1).id);
  } finally {
    await f.cleanup();
  }
});

test('mover hacia un grupo lleno se rechaza sin dejar rastro', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Origen', groups: [{ label: 'A', capacity: 5 }] },
      { name: 'Destino lleno', groups: [{ label: 'A', capacity: 1 }] },
    ],
    students: [[1], [0]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const assignments = await readAssignments(f.semester.id);
    const aMover = assignments.find((a) => a.submissionId === f.students[1].submission.id);

    await assert.rejects(
      () => allocation.overrideAssignment(f.user, aMover.id, f.group(1).id, 'Fuerzo el sobrecupo.', null),
      (err) => err.message === 'GROUP_FULL' && err.status === 409,
    );

    const grupo = (await readGroups(f.semester.id)).find((g) => g.id === f.group(1).id);
    assert.equal(grupo.assignedCount, 1);
    assert.equal((await readAssignments(f.semester.id)).find((a) => a.id === aMover.id).groupId, f.group(0).id);
  } finally {
    await f.cleanup();
  }
});

test('mover a un grupo inactivo se rechaza', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Activa', groups: [{ label: 'A', capacity: 5 }] },
      { name: 'Apagada', groups: [{ label: 'A', capacity: 5, isActive: false }] },
    ],
    students: [[0]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const [assignment] = await readAssignments(f.semester.id);

    await assert.rejects(
      () => allocation.overrideAssignment(f.user, assignment.id, f.group(1).id, 'Nota.', null),
      (err) => err.message === 'GROUP_INACTIVE' && err.status === 409,
    );
  } finally {
    await f.cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// La nota es el registro de la excepción
// ─────────────────────────────────────────────────────────────────────────────

test('colocar y mover exigen una nota con contenido', options, async () => {
  const f = await createFixture({
    offerings: [
      { name: 'Llena', groups: [{ label: 'A', capacity: 1 }] },
      { name: 'Con lugar', groups: [{ label: 'A', capacity: 5 }] },
    ],
    students: [[0], [0]],
  });

  try {
    await allocation.runAllocation(f.user, f.semester.id, null);
    const [assignment] = await readAssignments(f.semester.id);
    const sinLugar = f.students[1].submission.id;

    const esNoteRequired = (err) => err.message === 'NOTE_REQUIRED' && err.status === 400;

    for (const nota of [undefined, null, '', '   ']) {
      await assert.rejects(
        () => allocation.placeSubmission(f.user, sinLugar, f.group(1).id, nota, null),
        esNoteRequired,
      );
      await assert.rejects(
        () => allocation.overrideAssignment(f.user, assignment.id, f.group(1).id, nota, null),
        esNoteRequired,
      );
    }

    assert.equal((await readAssignments(f.semester.id)).length, 1, 'ningún rechazo escribió nada');
  } finally {
    await f.cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Alcance por campus
// ─────────────────────────────────────────────────────────────────────────────

test('un admin de otro campus no puede asignar ni mover', options, async () => {
  const f = await createFixture({
    offerings: [{ name: 'Robótica', groups: [{ label: 'A', capacity: 5 }] }],
    students: [[0]],
  });
  const otro = await createFixture({ offerings: [{ name: 'X', groups: [{ label: 'A', capacity: 1 }] }] });

  try {
    const esProhibido = (err) => err.message === 'CAMPUS_FORBIDDEN' && err.status === 403;

    await assert.rejects(() => allocation.runAllocation(otro.user, f.semester.id, null), esProhibido);

    await allocation.runAllocation(f.user, f.semester.id, null);
    const [assignment] = await readAssignments(f.semester.id);

    await assert.rejects(
      () => allocation.overrideAssignment(otro.user, assignment.id, otro.group(0).id, 'Nota.', null),
      esProhibido,
    );
  } finally {
    await otro.cleanup();
    await f.cleanup();
  }
});
