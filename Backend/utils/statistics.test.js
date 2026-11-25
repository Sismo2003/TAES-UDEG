import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildShiftStatistics, combineShiftStatistics } from './statistics.js';

const group = (id, capacity, extra = {}) => ({
  id,
  label: `G${id}`,
  capacity,
  assignedCount: 0,
  isActive: true,
  ...extra,
});

const offering = (id, name, groups, isActive = true) => ({
  semesterSubjectId: id,
  name,
  isActive,
  groups,
});

const shiftInput = (extra = {}) => ({
  offerings: [],
  preferenceCounts: [],
  statusCounts: { pending: 0, allocated: 0, unplaced: 0 },
  rosterRows: [],
  submittedRows: [],
  inactiveWithSubmission: 0,
  ...extra,
});

describe('buildShiftStatistics', () => {
  it('cuenta sólo grupos activos de ofertas activas y reporta el cupo excluido', () => {
    const s = buildShiftStatistics(
      shiftInput({
        offerings: [
          offering(1, 'Robótica', [group(1, 10), group(2, 5, { isActive: false })]),
          offering(2, 'Ética', [group(3, 20)], false),
          offering(3, 'Arte', [group(4, 7)]),
        ],
      }),
    );
    assert.equal(s.seats.total, 17);
    assert.equal(s.seats.groups, 2);
    assert.equal(s.seats.excluded, 25);
    // La materia inactiva sin demanda no se lista.
    assert.deepEqual(
      s.subjects.map((x) => x.name),
      ['Arte', 'Robótica'],
    );
  });

  it('ordena por 1ª opción y calcula la diferencia por materia', () => {
    const s = buildShiftStatistics(
      shiftInput({
        offerings: [
          offering(1, 'Arte', [group(1, 10)]),
          offering(2, 'Robótica', [group(2, 3)]),
          offering(3, 'Ética', [group(3, 4)], false),
        ],
        preferenceCounts: [
          { semesterSubjectId: 1, rank: 1, count: 2 },
          { semesterSubjectId: 1, rank: 2, count: 5 },
          { semesterSubjectId: 2, rank: 1, count: 5 },
          { semesterSubjectId: 2, rank: 2, count: 1 },
          { semesterSubjectId: 3, rank: 1, count: 1 },
        ],
      }),
    );
    assert.deepEqual(
      s.subjects.map((x) => [x.name, x.seats, x.firstChoice, x.anyChoice, x.difference]),
      [
        ['Robótica', 3, 5, 6, -2],
        ['Arte', 10, 2, 7, 8],
        // Inactiva pero elegida: se muestra con 0 lugares.
        ['Ética', 0, 1, 1, -1],
      ],
    );
  });

  it('antes de asignar: libres = lugares − envíos; balance = lugares − padrón', () => {
    const s = buildShiftStatistics(
      shiftInput({
        offerings: [offering(1, 'Arte', [group(1, 5)])],
        statusCounts: { pending: 7, allocated: 0, unplaced: 0 },
        rosterRows: [{ studentSemesterLabel: '1A', career: null, count: 9 }],
        submittedRows: [{ studentSemesterLabel: '1A', career: null, count: 7 }],
      }),
    );
    assert.equal(s.phase, 'before');
    assert.deepEqual(s.students, {
      roster: 9,
      submitted: 7,
      notSubmitted: 2,
      inactiveWithSubmission: 0,
    });
    assert.equal(s.seats.freeAfterPlacing, -2);
    assert.equal(s.seats.balance, -4);
  });

  it('un dado de baja que ya envió también necesita lugar', () => {
    const s = buildShiftStatistics(
      shiftInput({
        offerings: [offering(1, 'Arte', [group(1, 10)])],
        statusCounts: { pending: 3, allocated: 0, unplaced: 0 },
        rosterRows: [{ studentSemesterLabel: '1A', career: null, count: 10 }],
        submittedRows: [{ studentSemesterLabel: '1A', career: null, count: 2 }],
        inactiveWithSubmission: 1,
      }),
    );
    assert.equal(s.seats.balance, -1);
    assert.equal(s.seats.freeAfterPlacing, 7);
  });

  it('distingue asignación completa de parcial', () => {
    const offerings = [offering(1, 'Arte', [group(1, 5, { assignedCount: 4 })])];
    const after = buildShiftStatistics(
      shiftInput({ offerings, statusCounts: { pending: 0, allocated: 4, unplaced: 2 } }),
    );
    assert.equal(after.phase, 'after');
    assert.equal(after.seats.freeAfterPlacing, 1);
    assert.equal(after.subjects[0].free, 1);

    const partial = buildShiftStatistics(
      shiftInput({ offerings, statusCounts: { pending: 3, allocated: 4, unplaced: 0 } }),
    );
    assert.equal(partial.phase, 'partial');
    assert.equal(partial.seats.freeAfterPlacing, -2);
  });

  it('agrupa por grupo escolar: sin envíos primero, y "Sin grupo" como null', () => {
    const s = buildShiftStatistics(
      shiftInput({
        rosterRows: [
          { studentSemesterLabel: '1A', career: 'P', count: 20 },
          { studentSemesterLabel: '1A', career: null, count: 5 },
          { studentSemesterLabel: '1B', career: 'P', count: 3 },
          { studentSemesterLabel: null, career: null, count: 1 },
          { studentSemesterLabel: '  ', career: '', count: 1 },
          { studentSemesterLabel: null, career: 'Programa X', count: 2 },
        ],
        submittedRows: [
          { studentSemesterLabel: '1A', career: 'P', count: 10 },
          { studentSemesterLabel: null, career: null, count: 1 },
        ],
      }),
    );
    assert.deepEqual(s.schoolGroups, [
      { name: '1B', roster: 3, submitted: 0, missing: 3 },
      { name: 'Programa X', roster: 2, submitted: 0, missing: 2 },
      { name: '1A', roster: 25, submitted: 10, missing: 15 },
      { name: null, roster: 2, submitted: 1, missing: 1 },
    ]);
    assert.equal(s.students.notSubmitted, 21);
  });
});

describe('combineShiftStatistics', () => {
  it('nunca netea el sobrante de un turno contra el faltante del otro', () => {
    const make = (capacity, roster) =>
      buildShiftStatistics(
        shiftInput({
          offerings: [offering(1, 'Arte', [group(1, capacity)])],
          rosterRows: [{ studentSemesterLabel: '1A', career: null, count: roster }],
        }),
      );
    const total = combineShiftStatistics([make(10, 15), make(20, 8)]);
    assert.equal(total.seats.total, 30);
    assert.equal(total.students.roster, 23);
    assert.deepEqual(total.seats.balance, { missing: 5, surplus: 12 });
  });

  it('un turno sin lista no cuenta sus lugares como sobrantes', () => {
    const noRoster = buildShiftStatistics(
      shiftInput({ offerings: [offering(1, 'Arte', [group(1, 40)])] }),
    );
    const total = combineShiftStatistics([noRoster]);
    assert.equal(total.seats.total, 40);
    assert.deepEqual(total.seats.balance, { missing: 0, surplus: 0 });
  });
});
