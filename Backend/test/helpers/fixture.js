/**
 * fixture.js — datos desechables para los tests que necesitan la base.
 *
 * NO hace `TRUNCATE`. Cada fixture crea su PROPIO campus (con un código
 * aleatorio) y se lleva todo al borrarse, así que correr los tests contra la
 * base de desarrollo no toca el semestre demo ni el padrón que haya cargado.
 * Un TRUNCATE global sería más corto y borraría el trabajo de quien esté
 * probando el panel en la otra ventana.
 *
 * El aislamiento entre tests es por campus/semestre, que es también el alcance
 * del advisory lock del allocator: dos fixtures nunca compiten por el lock.
 *
 * Requiere PostgreSQL levantado con las credenciales del `.env`. Si no hay
 * base, los tests se saltan con un mensaje en vez de fallar en rojo.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../../config/db.js';

export async function databaseAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const suffix = () => randomBytes(4).toString('hex');

/**
 * Arma un semestre completo y listo para asignar.
 *
 * @param {object} spec
 * @param {Array<{name: string, groups: Array<{label: string, capacity: number, isActive?: boolean}>, isActive?: boolean}>} spec.offerings
 *   La oferta, EN ORDEN: el índice es el `displayOrder`, que es el orden en que
 *   el allocator llena los grupos.
 * @param {Array<Array<number>>} spec.students
 *   Un array por alumno con los índices de `offerings` que pidió, en orden de
 *   preferencia. `[0, 2]` = rank 1 la primera oferta, rank 2 la tercera.
 *   El orden del array es el ORDEN DE LLEGADA (submittedAt creciente).
 */
export async function createFixture({ offerings, students = [], ranksRequired = 3 }) {
  const tag = suffix();

  const campus = await prisma.campus.create({
    data: { code: `test-${tag}`, name: `Campus de prueba ${tag}` },
  });

  const user = await prisma.user.create({
    data: {
      campusId: campus.id,
      email: `admin-${tag}@test.local`,
      fullName: 'Admin de prueba',
      passwordHash: 'no-se-usa-en-estos-tests',
      role: 'admin',
    },
  });

  const semester = await prisma.semester.create({
    data: {
      campusId: campus.id,
      code: `T${tag.slice(0, 4)}`,
      label: `Semestre de prueba ${tag}`,
      opensAt: new Date('2026-01-01T10:00:00Z'),
      closesAt: new Date('2026-01-01T10:15:00Z'),
      ranksRequired,
      createdById: user.id,
    },
  });

  const createdOfferings = [];
  for (const [index, spec] of offerings.entries()) {
    const subject = await prisma.subject.create({
      data: { code: `TEST-${tag}-${index}`, name: spec.name },
    });
    const offering = await prisma.semesterSubject.create({
      data: {
        semesterId: semester.id,
        subjectId: subject.id,
        displayOrder: index,
        isActive: spec.isActive ?? true,
      },
    });
    const groups = [];
    for (const [gIndex, g] of spec.groups.entries()) {
      groups.push(
        await prisma.subjectGroup.create({
          data: {
            semesterSubjectId: offering.id,
            label: g.label,
            capacity: g.capacity,
            displayOrder: gIndex,
            isActive: g.isActive ?? true,
          },
        }),
      );
    }
    createdOfferings.push({ ...offering, subject, groups });
  }

  // Orden de llegada explícito: un minuto entre envío y envío, para que el
  // test afirme sobre el orden y no sobre la resolución del reloj.
  const base = new Date('2026-01-01T10:00:00Z').getTime();
  const createdStudents = [];
  for (const [index, prefs] of students.entries()) {
    const code = String(100000000 + index).padStart(9, '0');
    const student = await prisma.semesterStudent.create({
      data: { semesterId: semester.id, code, fullName: `Alumno ${index}` },
    });
    const submission = await prisma.formSubmission.create({
      data: {
        semesterId: semester.id,
        semesterStudentId: student.id,
        submittedAt: new Date(base + index * 60_000),
      },
    });
    await prisma.submissionPreference.createMany({
      data: prefs.map((offeringIndex, rankIndex) => ({
        submissionId: submission.id,
        semesterId: semester.id,
        semesterSubjectId: createdOfferings[offeringIndex].id,
        rank: rankIndex + 1,
      })),
    });
    createdStudents.push({ student, submission });
  }

  return {
    campus,
    user,
    semester,
    offerings: createdOfferings,
    students: createdStudents,
    /** Atajo: el grupo `g` de la oferta `o`, por índice. */
    group: (o, g = 0) => createdOfferings[o].groups[g],
    cleanup: () => destroyFixture({ campusId: campus.id, semesterId: semester.id, userId: user.id, tag }),
  };
}

/**
 * Borra en orden explícito. Las FK de `group_assignments` hacia el grupo y
 * hacia el usuario son RESTRICT, así que un `DELETE FROM campuses` a secas
 * podría fallar según el orden que elija Postgres.
 */
async function destroyFixture({ campusId, semesterId, userId, tag }) {
  const submissionIds = (
    await prisma.formSubmission.findMany({ where: { semesterId }, select: { id: true } })
  ).map((s) => s.id);

  await prisma.groupAssignment.deleteMany({ where: { submissionId: { in: submissionIds } } });
  await prisma.formSubmission.deleteMany({ where: { semesterId } }); // arrastra preferencias
  await prisma.subjectGroup.deleteMany({ where: { semesterSubject: { semesterId } } });
  await prisma.semesterSubject.deleteMany({ where: { semesterId } });
  await prisma.semesterStudent.deleteMany({ where: { semesterId } });
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.semester.deleteMany({ where: { id: semesterId } });
  await prisma.subject.deleteMany({ where: { code: { startsWith: `TEST-${tag}-` } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.campus.deleteMany({ where: { id: campusId } });
}

/** Estado de los grupos tal como quedó en la base, para afirmar sobre cupos. */
export function readGroups(semesterId) {
  return prisma.subjectGroup.findMany({
    where: { semesterSubject: { semesterId } },
    select: { id: true, label: true, capacity: true, assignedCount: true },
    orderBy: { id: 'asc' },
  });
}

export function readAssignments(semesterId) {
  return prisma.groupAssignment.findMany({
    where: { submission: { semesterId } },
    select: {
      id: true,
      submissionId: true,
      groupId: true,
      assignedRank: true,
      isManualOverride: true,
      notes: true,
    },
    orderBy: { id: 'asc' },
  });
}

export function readStatuses(semesterId) {
  return prisma.formSubmission.findMany({
    where: { semesterId },
    select: { id: true, status: true },
    orderBy: { submittedAt: 'asc' },
  });
}

export { prisma };
