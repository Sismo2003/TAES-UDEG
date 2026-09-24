-- AlterTable
ALTER TABLE "group_assignments" ALTER COLUMN "assigned_rank" DROP NOT NULL;

-- CHECK relajado — Prisma no gestiona CHECK constraints, se edita a mano.
-- `assigned_rank` ahora acepta NULL: colocación manual en una asignatura que el
-- alumno NO rankeó (el admin lo ubicó "donde había lugar"). El 0 sigue prohibido
-- (era un valor mágico que se colaba desde `matchingPref?.rank ?? 0`).
-- Copia de referencia en Database/schemas/002_constraints.sql.
ALTER TABLE "group_assignments" DROP CONSTRAINT "group_assignments_rank_positive";
ALTER TABLE "group_assignments"
  ADD CONSTRAINT "group_assignments_rank_positive"
  CHECK ("assigned_rank" IS NULL OR "assigned_rank" >= 1);
