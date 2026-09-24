-- =============================================================================
-- TAEV-UDEG-PREPA2 — Constraints que Prisma NO sabe generar
--
-- Prisma Migrate no expresa CHECK constraints ni índices parciales. Sin este
-- archivo el esquema queda estructuralmente correcto pero SIN las garantías
-- que hacen que el sistema no se pueda romper: códigos de 9 dígitos, cupos que
-- no se pueden sobrepasar, y un único semestre activo.
--
-- CÓMO SE APLICA
--   Este bloque ya está pegado al final de la migración inicial
--   `Backend/prisma/migrations/20260827000000_init_taev/migration.sql`.
--   Este archivo es la copia de referencia, para que se vea versionado y
--   revisable sin abrir la carpeta de migraciones.
--
--   Si en el futuro regeneras la migración inicial desde cero
--   (`prisma migrate dev --create-only`), Prisma NO va a re-emitir nada de
--   esto: hay que volver a pegarlo a mano. Es la trampa número uno de este
--   esquema.
--
-- Todo acá es aditivo: ni un DROP, ni un TRUNCATE, ni un DELETE.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPUSES / USERS — alcance por escuela
-- ─────────────────────────────────────────────────────────────────────────────

-- El code del campus se usa TAL CUAL como segmento de URL del portal público
-- (/registro/prepa-2). Restringirlo a minúsculas, dígitos y guiones evita que
-- un admin cree "PREPA 2" (con espacio y mayúsculas) y rompa el enlace.
ALTER TABLE "campuses"
  ADD CONSTRAINT "campuses_code_format"
  CHECK ("code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- SÓLO UN SUPERADMIN PUEDE SER GLOBAL.
-- `users.campus_id` NULL significa "ve toda la red". Si un `admin` o un
-- `viewer` pudiera quedarse sin campus, sería silenciosamente omnipotente —
-- y el bug se vería recién cuando alguien de PREPA 2 abriera la ventana de
-- PREPA 3. Un superadmin sí puede estar acotado a un campus si conviene.
--
-- Ojo: esto define el ALCANCE. Hacerlo cumplir en cada request es trabajo del
-- middleware de autorización (ver Docs/DATABASE.md §7). Los dos hacen falta.
ALTER TABLE "users"
  ADD CONSTRAINT "users_campus_scope"
  CHECK ("role" = 'superadmin' OR "campus_id" IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- SEMESTERS
-- ─────────────────────────────────────────────────────────────────────────────

-- La ventana tiene que ser un intervalo real. Impide que un error de captura
-- (cerrar antes de abrir) deje al semestre en un estado imposible de razonar.
ALTER TABLE "semesters"
  ADD CONSTRAINT "semesters_window_valid"
  CHECK ("closes_at" > "opens_at");

-- Rango sano de preferencias. 1 mínimo (si no, no hay nada que ordenar); 10
-- como techo defensivo contra un typo del admin (ranks_required = 300).
ALTER TABLE "semesters"
  ADD CONSTRAINT "semesters_ranks_required_valid"
  CHECK ("ranks_required" BETWEEN 1 AND 10);

-- EXACTAMENTE UN SEMESTRE ACTIVO POR ESCUELA.
-- El portal público resuelve "¿a qué semestre entra este alumno?" con
-- `WHERE campus_id = $1 AND is_current = true`. Si hubiera dos, esa consulta
-- devuelve lo que el planner decida y el sistema se vuelve no determinista en
-- el peor momento posible. Este índice parcial lo hace imposible: el segundo
-- UPDATE del mismo campus falla.
--
-- Es por campus, no global: PREPA 2 y PREPA 3 corren sus ciclos en paralelo.
--
-- Cambiar de semestre activo es, entonces, una transacción de dos pasos:
--   BEGIN;
--     UPDATE semesters SET is_current = false
--      WHERE campus_id = $1 AND is_current;
--     UPDATE semesters SET is_current = true  WHERE id = $2;
--   COMMIT;
CREATE UNIQUE INDEX "semesters_single_current_per_campus"
  ON "semesters" ("campus_id")
  WHERE "is_current";


-- ─────────────────────────────────────────────────────────────────────────────
-- SEMESTER_STUDENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Código UDEG: EXACTAMENTE 9 dígitos. Ni 8, ni 10, ni letras, ni espacios.
-- La columna es VARCHAR(9) y no CHAR(9) a propósito: CHAR rellena con espacios
-- a la derecha, y '218327451 ' <> '218327451' rompería el login del alumno de
-- forma silenciosa.
ALTER TABLE "semester_students"
  ADD CONSTRAINT "semester_students_code_format"
  CHECK ("code" ~ '^[0-9]{9}$');


-- ─────────────────────────────────────────────────────────────────────────────
-- SUBJECT_GROUPS — la última línea de defensa contra sobrecupo
-- ─────────────────────────────────────────────────────────────────────────────

-- Un grupo sin lugares no es un grupo.
ALTER TABLE "subject_groups"
  ADD CONSTRAINT "subject_groups_capacity_positive"
  CHECK ("capacity" > 0);

-- LA GARANTÍA CENTRAL DEL SISTEMA.
-- `assigned_count` lo mantiene el allocator dentro de la misma transacción que
-- escribe `group_assignments`. Este CHECK convierte a PostgreSQL en el árbitro
-- final: aunque el service tenga un bug, aunque dos admins disparen la
-- asignación a la vez, aunque alguien mueva alumnos a mano — un grupo NO PUEDE
-- terminar con más alumnos que su cupo. La transacción aborta.
--
-- Efecto secundario deliberado: bajar `capacity` por debajo de la ocupación
-- actual falla. El admin tiene que sacar alumnos primero. Eso es correcto:
-- la alternativa es un grupo silenciosamente sobrevendido.
ALTER TABLE "subject_groups"
  ADD CONSTRAINT "subject_groups_assigned_count_valid"
  CHECK ("assigned_count" >= 0 AND "assigned_count" <= "capacity");


-- ─────────────────────────────────────────────────────────────────────────────
-- PREFERENCIAS Y ASIGNACIONES
-- ─────────────────────────────────────────────────────────────────────────────

-- El rank mínimo es 1. El máximo NO se fija acá: es `semesters.ranks_required`,
-- configurable por semestre, y lo valida el service contra ese valor. Un CHECK
-- fijo `BETWEEN 1 AND 3` haría que `ranks_required` fuese mentira.
ALTER TABLE "submission_preferences"
  ADD CONSTRAINT "submission_preferences_rank_positive"
  CHECK ("rank" >= 1);

-- `assigned_rank` acepta NULL o >= 1. NULL = colocación manual en una asignatura
-- que el alumno NO rankeó (el admin lo ubicó "donde había lugar", override fuera
-- de sus preferencias). El 0 sigue prohibido: era un valor mágico que se colaba
-- desde `matchingPref?.rank ?? 0` en allocation.service.js y rompía este CHECK.
-- Actualizado por la migración 20260828224217_assigned_rank_nullable_for_overrides.
ALTER TABLE "group_assignments"
  ADD CONSTRAINT "group_assignments_rank_positive"
  CHECK ("assigned_rank" IS NULL OR "assigned_rank" >= 1);


-- =============================================================================
-- CONSULTAS DE VERIFICACIÓN (no se ejecutan en la migración — copiar y pegar)
--
-- `assigned_count` es un contador materializado. Sólo puede desincronizarse si
-- alguien escribe en `group_assignments` sin actualizarlo en la misma
-- transacción. Corré esto después de cada asignación y en cualquier auditoría:
-- si devuelve filas, hay un bug en el service.
-- =============================================================================

-- 1. ¿El contador coincide con la realidad?
--
-- SELECT sg.id,
--        sg.label,
--        sg.capacity,
--        sg.assigned_count                    AS contador,
--        COUNT(ga.id)                         AS real,
--        sg.assigned_count - COUNT(ga.id)     AS deriva
--   FROM subject_groups sg
--   LEFT JOIN group_assignments ga ON ga.group_id = sg.id
--  GROUP BY sg.id, sg.label, sg.capacity, sg.assigned_count
--  HAVING sg.assigned_count <> COUNT(ga.id);

-- 2. Reconciliación (sólo si la consulta 1 devolvió filas y ya entendiste
--    por qué). Corregir el contador esconde el síntoma, no el bug.
--
-- UPDATE subject_groups sg
--    SET assigned_count = sub.real
--   FROM (SELECT sg2.id, COUNT(ga.id) AS real
--           FROM subject_groups sg2
--           LEFT JOIN group_assignments ga ON ga.group_id = sg2.id
--          GROUP BY sg2.id) sub
--  WHERE sg.id = sub.id
--    AND sg.assigned_count <> sub.real;

-- 3. ¿Algún alumno quedó con estado incoherente respecto a su asignación?
--    (allocated sin fila de asignación, o con fila pero no allocated)
--
-- SELECT fs.id, fs.status, ga.id AS assignment_id
--   FROM form_submissions fs
--   LEFT JOIN group_assignments ga ON ga.submission_id = fs.id
--  WHERE (fs.status = 'allocated' AND ga.id IS NULL)
--     OR (fs.status <> 'allocated' AND ga.id IS NOT NULL);

-- 4. ¿Alguien recibió una preferencia que no pidió?
--
-- SELECT ga.id, ga.submission_id, ga.assigned_rank
--   FROM group_assignments ga
--   JOIN subject_groups sg ON sg.id = ga.group_id
--  WHERE NOT EXISTS (
--          SELECT 1
--            FROM submission_preferences sp
--           WHERE sp.submission_id      = ga.submission_id
--             AND sp.semester_subject_id = sg.semester_subject_id
--             AND sp.rank                = ga.assigned_rank
--        )
--    AND ga.is_manual_override = false;
