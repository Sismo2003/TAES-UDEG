-- =============================================================================
-- TAEV — Test de regresión del esquema.
--
-- Verifica que la base RECHAZA todo lo que debe rechazar. Cada assert intenta
-- una violación; si PostgreSQL la acepta, el script aborta con FALLO.
--
-- Estos constraints son la diferencia entre "el service tiene un bug" y "el
-- service tiene un bug Y además se corrompieron los datos". Corré esto cada
-- vez que toques schema.prisma o 002_constraints.sql.
--
-- CÓMO SE CORRE (contra una base DESECHABLE — nunca contra datos reales):
--
--   docker run -d --name taev-verify \
--     -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=taev_verify \
--     -p 55432:5432 postgres:16-alpine
--
--   docker exec -i taev-verify psql -U postgres -d taev_verify -q \
--     -v ON_ERROR_STOP=1 \
--     < Backend/prisma/migrations/20260827000000_init_taev/migration.sql
--
--   docker exec -i taev-verify psql -U postgres -d taev_verify -q \
--     < Database/scripts/verify_constraints.sql
--
--   docker rm -f taev-verify
--
-- Salida esperada: 27 líneas "OK" y el banner final. Cualquier "FALLO" o
-- "ERROR" significa que una garantía del modelo dejó de existir.
--
-- El script inserta datos, así que corre UNA vez por base limpia: una segunda
-- corrida sin recrear el esquema choca contra sus propios inserts.
-- =============================================================================

\set ON_ERROR_STOP 1

-- ── Datos base ───────────────────────────────────────────────────────────────
INSERT INTO campuses (code, name, is_active, created_at, updated_at)
VALUES ('prepa-3', 'Preparatoria No. 3', TRUE, now(), now());

INSERT INTO users (email, password_hash, full_name, role, campus_id, is_active, created_at, updated_at)
VALUES ('admin2@udg.mx', 'x', 'Admin Prepa 2', 'admin', 1, TRUE, now(), now()),
       ('super@udg.mx',  'x', 'Superadmin',    'superadmin', NULL, TRUE, now(), now());

INSERT INTO semesters (campus_id, code, label, is_current, opens_at, closes_at, window_mode, ranks_required, created_by_id, created_at, updated_at)
VALUES (1, '2026A', '2026-A', TRUE, '2026-08-22T16:00:00Z', '2026-08-22T16:15:00Z', 'scheduled', 3, 1, now(), now());

INSERT INTO subjects (code, name, is_active, created_at, updated_at)
VALUES ('TAEV-ROB', 'Robótica', TRUE, now(), now()),
       ('TAEV-ART', 'Arte',     TRUE, now(), now());

INSERT INTO semester_subjects (semester_id, subject_id, display_order, is_active, created_at, updated_at)
VALUES (1, 1, 0, TRUE, now(), now()),
       (1, 2, 1, TRUE, now(), now());

INSERT INTO subject_groups (semester_subject_id, label, capacity, assigned_count, display_order, is_active, created_at, updated_at)
VALUES (1, 'A', 2, 0, 0, TRUE, now(), now());

INSERT INTO semester_students (semester_id, code, full_name, is_active, created_at, updated_at)
VALUES (1, '218327451', 'Alumno Uno', TRUE, now(), now());

\echo '--- datos base OK ---'


-- ── Helper: cada assert falla el script si la violación NO es rechazada ──────

CREATE OR REPLACE FUNCTION assert_rejects(etiqueta TEXT, sentencia TEXT)
RETURNS VOID AS $$
BEGIN
  BEGIN
    EXECUTE sentencia;
  EXCEPTION
    WHEN check_violation OR unique_violation OR foreign_key_violation
      OR not_null_violation OR string_data_right_truncation THEN
      RAISE NOTICE 'OK   rechazado: %', etiqueta;
      RETURN;
  END;
  RAISE EXCEPTION 'FALLO: la base ACEPTÓ algo que debía rechazar -> %', etiqueta;
END;
$$ LANGUAGE plpgsql;


-- ── Código de alumno: EXACTAMENTE 9 dígitos ─────────────────────────────────

SELECT assert_rejects('código de 8 dígitos',
  $q$INSERT INTO semester_students (semester_id, code, is_active, created_at, updated_at)
     VALUES (1, '21832745', TRUE, now(), now())$q$);

SELECT assert_rejects('código de 10 dígitos',
  $q$INSERT INTO semester_students (semester_id, code, is_active, created_at, updated_at)
     VALUES (1, '2183274512', TRUE, now(), now())$q$);

SELECT assert_rejects('código con letras',
  $q$INSERT INTO semester_students (semester_id, code, is_active, created_at, updated_at)
     VALUES (1, '21832745a', TRUE, now(), now())$q$);

SELECT assert_rejects('código duplicado en el mismo semestre',
  $q$INSERT INTO semester_students (semester_id, code, is_active, created_at, updated_at)
     VALUES (1, '218327451', TRUE, now(), now())$q$);


-- ── Un solo semestre activo POR CAMPUS ──────────────────────────────────────

SELECT assert_rejects('segundo semestre is_current en el MISMO campus',
  $q$INSERT INTO semesters (campus_id, code, label, is_current, opens_at, closes_at, window_mode, ranks_required, created_by_id, created_at, updated_at)
     VALUES (1, '2026B', '2026-B', TRUE, '2026-12-01T16:00:00Z', '2026-12-01T16:15:00Z', 'scheduled', 3, 1, now(), now())$q$);

SELECT assert_rejects('mismo code de semestre repetido en el mismo campus',
  $q$INSERT INTO semesters (campus_id, code, label, is_current, opens_at, closes_at, window_mode, ranks_required, created_by_id, created_at, updated_at)
     VALUES (1, '2026A', 'dup', FALSE, '2026-12-01T16:00:00Z', '2026-12-01T16:15:00Z', 'scheduled', 3, 1, now(), now())$q$);

SELECT assert_rejects('ventana invertida (closes_at <= opens_at)',
  $q$INSERT INTO semesters (campus_id, code, label, is_current, opens_at, closes_at, window_mode, ranks_required, created_by_id, created_at, updated_at)
     VALUES (2, '2026X', 'mala', FALSE, '2026-08-22T16:15:00Z', '2026-08-22T16:00:00Z', 'scheduled', 3, 1, now(), now())$q$);

SELECT assert_rejects('ranks_required fuera de rango',
  $q$INSERT INTO semesters (campus_id, code, label, is_current, opens_at, closes_at, window_mode, ranks_required, created_by_id, created_at, updated_at)
     VALUES (2, '2026Y', 'mala', FALSE, '2026-08-22T16:00:00Z', '2026-08-22T16:15:00Z', 'scheduled', 300, 1, now(), now())$q$);

-- ...pero OTRO campus SÍ puede tener su propio semestre activo a la vez.
INSERT INTO semesters (campus_id, code, label, is_current, opens_at, closes_at, window_mode, ranks_required, created_by_id, created_at, updated_at)
VALUES (2, '2026A', '2026-A', TRUE, '2026-08-22T17:00:00Z', '2026-08-22T17:15:00Z', 'scheduled', 3, 2, now(), now());
\echo 'OK   aceptado: semestre activo simultáneo en OTRO campus'


-- ── Alcance de usuarios por campus ──────────────────────────────────────────

SELECT assert_rejects('admin sin campus (sería omnipotente)',
  $q$INSERT INTO users (email, password_hash, full_name, role, campus_id, is_active, created_at, updated_at)
     VALUES ('suelto@udg.mx', 'x', 'Admin sin campus', 'admin', NULL, TRUE, now(), now())$q$);

SELECT assert_rejects('viewer sin campus',
  $q$INSERT INTO users (email, password_hash, full_name, role, campus_id, is_active, created_at, updated_at)
     VALUES ('viewer@udg.mx', 'x', 'Viewer sin campus', 'viewer', NULL, TRUE, now(), now())$q$);

SELECT assert_rejects('code de campus con mayúsculas y espacio (rompería la URL)',
  $q$INSERT INTO campuses (code, name, is_active, created_at, updated_at)
     VALUES ('PREPA 4', 'Preparatoria No. 4', TRUE, now(), now())$q$);


-- ── Cupos: la garantía central ──────────────────────────────────────────────

SELECT assert_rejects('capacity = 0',
  $q$INSERT INTO subject_groups (semester_subject_id, label, capacity, assigned_count, display_order, is_active, created_at, updated_at)
     VALUES (2, 'Z', 0, 0, 0, TRUE, now(), now())$q$);

SELECT assert_rejects('assigned_count por encima de capacity',
  $q$UPDATE subject_groups SET assigned_count = 3 WHERE id = 1$q$);

SELECT assert_rejects('assigned_count negativo',
  $q$UPDATE subject_groups SET assigned_count = -1 WHERE id = 1$q$);

-- Llenar hasta el cupo exacto SÍ se puede.
UPDATE subject_groups SET assigned_count = 2 WHERE id = 1;
\echo 'OK   aceptado: assigned_count = capacity (cupo exacto)'

SELECT assert_rejects('bajar capacity por debajo de la ocupación actual',
  $q$UPDATE subject_groups SET capacity = 1 WHERE id = 1$q$);

UPDATE subject_groups SET assigned_count = 0 WHERE id = 1;


-- ── Envíos y preferencias ───────────────────────────────────────────────────

INSERT INTO form_submissions (semester_id, semester_student_id, submitted_at, status)
VALUES (1, 1, now(), 'pending');
\echo 'OK   aceptado: primer envío del alumno'

SELECT assert_rejects('segundo envío del mismo alumno',
  $q$INSERT INTO form_submissions (semester_id, semester_student_id, submitted_at, status)
     VALUES (1, 1, now(), 'pending')$q$);

SELECT assert_rejects('envío cuyo semester_id no coincide con el del alumno (FK compuesta)',
  $q$INSERT INTO form_submissions (semester_id, semester_student_id, submitted_at, status)
     VALUES (2, 1, now(), 'pending')$q$);

INSERT INTO submission_preferences (submission_id, semester_id, semester_subject_id, rank)
VALUES (1, 1, 1, 1);
\echo 'OK   aceptado: preferencia rank 1'

SELECT assert_rejects('dos preferencias con el mismo rank',
  $q$INSERT INTO submission_preferences (submission_id, semester_id, semester_subject_id, rank)
     VALUES (1, 1, 2, 1)$q$);

SELECT assert_rejects('rankear dos veces la misma asignatura',
  $q$INSERT INTO submission_preferences (submission_id, semester_id, semester_subject_id, rank)
     VALUES (1, 1, 1, 2)$q$);

SELECT assert_rejects('rank cero',
  $q$INSERT INTO submission_preferences (submission_id, semester_id, semester_subject_id, rank)
     VALUES (1, 1, 2, 0)$q$);

-- LA PRUEBA CLAVE del rediseño: una preferencia que apunte a la oferta de OTRO
-- semestre. Antes esto era posible (subject_id iba al catálogo global).
INSERT INTO semester_subjects (semester_id, subject_id, display_order, is_active, created_at, updated_at)
SELECT s.id, 1, 0, TRUE, now(), now()
  FROM semesters s WHERE s.campus_id = 2 AND s.code = '2026A';

SELECT assert_rejects('preferencia hacia la oferta de OTRO semestre/campus',
  format($q$INSERT INTO submission_preferences (submission_id, semester_id, semester_subject_id, rank)
            VALUES (1, 1, %s, 2)$q$,
         (SELECT ss.id FROM semester_subjects ss
            JOIN semesters s ON s.id = ss.semester_id
           WHERE s.campus_id = 2)));

-- Y el simétrico: tampoco se puede declarar la preferencia "en" el otro
-- semestre, porque entonces choca contra la FK compuesta del envío.
SELECT assert_rejects('preferencia con semester_id ajeno al del envío',
  format($q$INSERT INTO submission_preferences (submission_id, semester_id, semester_subject_id, rank)
            VALUES (1, %s, %s, 2)$q$,
         (SELECT s.id FROM semesters s WHERE s.campus_id = 2),
         (SELECT ss.id FROM semester_subjects ss
            JOIN semesters s ON s.id = ss.semester_id
           WHERE s.campus_id = 2)));

\echo ''
\echo '════════════════════════════════════════════════'
\echo '  TODOS LOS CONSTRAINTS SE COMPORTAN COMO DEBEN'
\echo '════════════════════════════════════════════════'
