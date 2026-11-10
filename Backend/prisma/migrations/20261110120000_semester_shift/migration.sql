-- =============================================================================
-- semester_shift — turnos matutino / vespertino
--
-- Cada turno es un semestre independiente (padrón, oferta, grupos, cupos y
-- ventana propios). Puede haber un semestre activo POR (campus, turno), lo que
-- habilita dos links en el portal: /matutino y /vespertino.
--
-- Aditiva: los semestres existentes quedan como 'matutino' por el DEFAULT.
-- Los DROP de abajo son sólo de ÍNDICES (no tocan filas) y se ejecutan después
-- de crear sus reemplazos, que son estrictamente más permisivos.
-- =============================================================================

-- CreateEnum
CREATE TYPE "shift" AS ENUM ('matutino', 'vespertino');

-- AlterTable
ALTER TABLE "semesters" ADD COLUMN "shift" "shift" NOT NULL DEFAULT 'matutino';

-- CreateIndex
CREATE INDEX "semesters_campus_id_shift_is_current_idx" ON "semesters"("campus_id", "shift", "is_current");

-- CreateIndex: "2026A" es único por campus Y turno.
CREATE UNIQUE INDEX "semesters_campus_id_code_shift_key" ON "semesters"("campus_id", "code", "shift");

-- DropIndex (reemplazados por los de arriba)
DROP INDEX "semesters_campus_id_code_key";
DROP INDEX "semesters_campus_id_is_current_idx";

-- ── Índice parcial (Prisma NO lo genera — espejo en 002_constraints.sql) ─────
-- A lo sumo un semestre activo por (campus, turno).
CREATE UNIQUE INDEX "semesters_single_current_per_campus_shift"
  ON "semesters" ("campus_id", "shift")
  WHERE "is_current";

DROP INDEX "semesters_single_current_per_campus";
