-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('superadmin', 'admin', 'viewer');

-- CreateEnum
CREATE TYPE "semester_window_mode" AS ENUM ('scheduled', 'force_open', 'force_closed');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('pending', 'allocated', 'unplaced');

-- CreateTable
CREATE TABLE "campuses" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'admin',
    "campus_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" SERIAL NOT NULL,
    "campus_id" INTEGER NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "window_mode" "semester_window_mode" NOT NULL DEFAULT 'scheduled',
    "ranks_required" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semester_subjects" (
    "id" SERIAL NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semester_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semester_students" (
    "id" SERIAL NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "code" VARCHAR(9) NOT NULL,
    "full_name" VARCHAR(160),
    "email" VARCHAR(160),
    "career" VARCHAR(120),
    "student_semester_label" VARCHAR(32),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semester_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_groups" (
    "id" SERIAL NOT NULL,
    "semester_subject_id" INTEGER NOT NULL,
    "label" VARCHAR(32) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subject_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" SERIAL NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "semester_student_id" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" INET,
    "user_agent" TEXT,
    "status" "submission_status" NOT NULL DEFAULT 'pending',
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_preferences" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "semester_subject_id" INTEGER NOT NULL,
    "rank" SMALLINT NOT NULL,

    CONSTRAINT "submission_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_assignments" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "assigned_rank" SMALLINT NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" INTEGER NOT NULL,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "group_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64),
    "entity_id" INTEGER,
    "payload" JSONB,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campuses_code_key" ON "campuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_campus_id_idx" ON "users"("campus_id");

-- CreateIndex
CREATE INDEX "semesters_campus_id_is_current_idx" ON "semesters"("campus_id", "is_current");

-- CreateIndex
CREATE INDEX "semesters_opens_at_closes_at_idx" ON "semesters"("opens_at", "closes_at");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_campus_id_code_key" ON "semesters"("campus_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "semester_subjects_semester_id_display_order_idx" ON "semester_subjects"("semester_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "semester_subjects_semester_id_subject_id_key" ON "semester_subjects"("semester_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "semester_subjects_id_semester_id_key" ON "semester_subjects"("id", "semester_id");

-- CreateIndex
CREATE INDEX "semester_students_code_idx" ON "semester_students"("code");

-- CreateIndex
CREATE UNIQUE INDEX "semester_students_semester_id_code_key" ON "semester_students"("semester_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "semester_students_id_semester_id_key" ON "semester_students"("id", "semester_id");

-- CreateIndex
CREATE INDEX "subject_groups_semester_subject_id_display_order_idx" ON "subject_groups"("semester_subject_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "subject_groups_semester_subject_id_label_key" ON "subject_groups"("semester_subject_id", "label");

-- CreateIndex
CREATE INDEX "form_submissions_semester_id_submitted_at_id_idx" ON "form_submissions"("semester_id", "submitted_at", "id");

-- CreateIndex
CREATE INDEX "form_submissions_semester_id_status_idx" ON "form_submissions"("semester_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_semester_student_id_semester_id_key" ON "form_submissions"("semester_student_id", "semester_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_id_semester_id_key" ON "form_submissions"("id", "semester_id");

-- CreateIndex
CREATE INDEX "submission_preferences_semester_subject_id_idx" ON "submission_preferences"("semester_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_preferences_submission_id_rank_key" ON "submission_preferences"("submission_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "submission_preferences_submission_id_semester_subject_id_key" ON "submission_preferences"("submission_id", "semester_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_assignments_submission_id_key" ON "group_assignments"("submission_id");

-- CreateIndex
CREATE INDEX "group_assignments_group_id_idx" ON "group_assignments"("group_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_subjects" ADD CONSTRAINT "semester_subjects_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_subjects" ADD CONSTRAINT "semester_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_students" ADD CONSTRAINT "semester_students_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_groups" ADD CONSTRAINT "subject_groups_semester_subject_id_fkey" FOREIGN KEY ("semester_subject_id") REFERENCES "semester_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_semester_student_id_semester_id_fkey" FOREIGN KEY ("semester_student_id", "semester_id") REFERENCES "semester_students"("id", "semester_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_preferences" ADD CONSTRAINT "submission_preferences_submission_id_semester_id_fkey" FOREIGN KEY ("submission_id", "semester_id") REFERENCES "form_submissions"("id", "semester_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_preferences" ADD CONSTRAINT "submission_preferences_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_preferences" ADD CONSTRAINT "submission_preferences_semester_subject_id_semester_id_fkey" FOREIGN KEY ("semester_subject_id", "semester_id") REFERENCES "semester_subjects"("id", "semester_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_assignments" ADD CONSTRAINT "group_assignments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_assignments" ADD CONSTRAINT "group_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "subject_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_assignments" ADD CONSTRAINT "group_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =============================================================================
-- CONSTRAINTS QUE PRISMA NO GENERA — pegados a mano.
-- Copia de referencia versionada en Database/schemas/002_constraints.sql
-- (ahí está el porqué de cada uno, más las consultas de verificación).
--
-- Si regeneras esta migración desde cero, Prisma NO re-emite nada de esto.
-- =============================================================================

-- El code del campus se usa tal cual como segmento de URL del portal.
ALTER TABLE "campuses"
  ADD CONSTRAINT "campuses_code_format"
  CHECK ("code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Sólo un superadmin puede tener alcance global (campus_id NULL).
ALTER TABLE "users"
  ADD CONSTRAINT "users_campus_scope"
  CHECK ("role" = 'superadmin' OR "campus_id" IS NOT NULL);

-- La ventana debe ser un intervalo real.
ALTER TABLE "semesters"
  ADD CONSTRAINT "semesters_window_valid"
  CHECK ("closes_at" > "opens_at");

-- Techo defensivo contra un typo del admin en ranks_required.
ALTER TABLE "semesters"
  ADD CONSTRAINT "semesters_ranks_required_valid"
  CHECK ("ranks_required" BETWEEN 1 AND 10);

-- EXACTAMENTE UN SEMESTRE ACTIVO POR ESCUELA.
CREATE UNIQUE INDEX "semesters_single_current_per_campus"
  ON "semesters" ("campus_id")
  WHERE "is_current";

-- Código UDEG: exactamente 9 dígitos.
ALTER TABLE "semester_students"
  ADD CONSTRAINT "semester_students_code_format"
  CHECK ("code" ~ '^[0-9]{9}$');

-- Un grupo sin lugares no es un grupo.
ALTER TABLE "subject_groups"
  ADD CONSTRAINT "subject_groups_capacity_positive"
  CHECK ("capacity" > 0);

-- GARANTÍA CENTRAL: ningún grupo puede superar su cupo, pase lo que pase.
ALTER TABLE "subject_groups"
  ADD CONSTRAINT "subject_groups_assigned_count_valid"
  CHECK ("assigned_count" >= 0 AND "assigned_count" <= "capacity");

-- El máximo de rank lo valida el service contra semesters.ranks_required.
ALTER TABLE "submission_preferences"
  ADD CONSTRAINT "submission_preferences_rank_positive"
  CHECK ("rank" >= 1);

ALTER TABLE "group_assignments"
  ADD CONSTRAINT "group_assignments_rank_positive"
  CHECK ("assigned_rank" >= 1);

-- =============================================================================
-- SEED MÍNIMO — el campus inicial.
-- `semesters.campus_id` es NOT NULL, así que sin esta fila no se puede crear
-- ningún semestre. Va en la migración (y no en un seed aparte) para que
-- cualquier entorno recién migrado quede utilizable.
-- =============================================================================

INSERT INTO "campuses" ("code", "name", "is_active", "created_at", "updated_at")
VALUES ('prepa-2', 'Preparatoria No. 2', TRUE, now(), now())
ON CONFLICT ("code") DO NOTHING;
