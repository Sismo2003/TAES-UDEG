/**
 * Estadísticas contra PostgreSQL real, antes y después de correr el allocator.
 * Usa fixtures aislados (campus propio), igual que los tests del allocator.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture, databaseAvailable, prisma } from '../test/helpers/fixture.js';
import { runAllocation } from './allocation.service.js';
import { semesterStatistics } from './statistics.service.js';

const available = await databaseAvailable();

describe('semesterStatistics', { skip: available ? false : 'sin PostgreSQL' }, () => {
  after(() => prisma.$disconnect());

  it('cuadra antes y después de asignar, y respeta el campus', async () => {
    const fx = await createFixture({
      ranksRequired: 2,
      offerings: [
        { name: 'Robótica', groups: [{ label: 'A', capacity: 2 }] },
        {
          name: 'Arte',
          groups: [
            { label: 'A', capacity: 1 },
            { label: 'B', capacity: 9, isActive: false },
          ],
        },
      ],
      // 4 envíos, todos con Robótica primero; sólo hay 3 lugares activos.
      students: [
        [0, 1],
        [0, 1],
        [0, 1],
        [0, 1],
      ],
    });
    try {
      // Un alumno en lista que no envió.
      await prisma.semesterStudent.create({
        data: { semesterId: fx.semester.id, code: '200000001', studentSemesterLabel: '1B' },
      });
      const user = { id: fx.user.id, role: 'admin', campusId: fx.campus.id };

      const before = await semesterStatistics(user, fx.semester.id);
      assert.deepEqual(before.missingShifts, ['vespertino']);
      const [b] = before.shifts;
      assert.equal(b.phase, 'before');
      assert.equal(b.students.roster, 5);
      assert.equal(b.students.submitted, 4);
      assert.equal(b.students.notSubmitted, 1);
      assert.equal(b.seats.total, 3);
      assert.equal(b.seats.excluded, 9);
      assert.equal(b.seats.freeAfterPlacing, -1);
      assert.equal(b.seats.balance, -2);
      assert.deepEqual(
        b.subjects.map((s) => [s.name, s.seats, s.firstChoice, s.anyChoice, s.difference]),
        [
          ['Robótica', 2, 4, 4, -2],
          ['Arte', 1, 0, 4, 1],
        ],
      );
      assert.deepEqual(b.schoolGroups[0], { name: '1B', roster: 1, submitted: 0, missing: 1 });

      await runAllocation(user, fx.semester.id, null);

      const [a] = (await semesterStatistics(user, fx.semester.id)).shifts;
      assert.equal(a.phase, 'after');
      assert.equal(a.submissions.allocated, 3);
      assert.equal(a.submissions.unplaced, 1);
      assert.equal(a.seats.assigned, 3);
      assert.equal(a.seats.freeAfterPlacing, 0);
      assert.equal(a.seats.balance, -2);
      assert.deepEqual(
        a.subjects.map((s) => [s.name, s.assigned, s.free]),
        [
          ['Robótica', 2, 0],
          ['Arte', 1, 0],
        ],
      );

      await assert.rejects(
        () => semesterStatistics({ ...user, campusId: fx.campus.id + 1 }, fx.semester.id),
        { status: 403, message: 'CAMPUS_FORBIDDEN' },
      );
      await assert.rejects(() => semesterStatistics(user, null), { status: 404 });
    } finally {
      await fx.cleanup();
    }
  });
});
