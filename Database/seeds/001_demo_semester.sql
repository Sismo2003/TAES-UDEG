-- =============================================================================
-- TAEV — Seed de demo para desarrollo local.
--
-- Deja la base en un estado donde el portal público FUNCIONA de punta a punta:
-- un campus, un admin, un semestre abierto, 7 asignaturas ofertadas con 3
-- grupos cada una, y 30 códigos de alumno de prueba.
--
-- ⚠️ SÓLO PARA LOCAL. Contiene un hash de contraseña conocido y códigos de
--    alumno inventados. Nunca correr contra producción.
--
-- CÓMO SE CORRE
--   docker exec -i taev-db psql -U postgres -d taev_udeg_prepa2 \
--     < Database/seeds/001_demo_semester.sql
--
-- Es idempotente: se puede correr varias veces sin duplicar nada.
-- Para volver a empezar de cero, ver el bloque de limpieza al final.
--
-- CREDENCIAL DEL ADMIN DE DEMO
--   email:    admin@prepa2.local
--   password: taev-demo-2026
--
--   El hash es bcrypt cost 10, verificado contra esa contraseña. Sirve tal cual
--   si la implementación de auth usa bcrypt/bcryptjs. Si se elige argon2, hay
--   que regenerarlo:
--     node -e "console.log(require('bcryptjs').hashSync('taev-demo-2026', 10))"
--
--   Este usuario no puede entrar a ningún lado todavía: la auth aún no existe
--   (ver Docs/HANDOFF.md). Está sembrado porque `semesters.created_by_id` es
--   NOT NULL y hace falta alguien que figure como creador del semestre.
-- =============================================================================


-- ── Campus ───────────────────────────────────────────────────────────────────
-- `prepa-2` ya lo inserta la migración inicial. Este ON CONFLICT lo hace
-- seguro de todos modos y deja el seed autocontenido.

INSERT INTO campuses (code, name, is_active, created_at, updated_at)
VALUES ('prepa-2', 'Preparatoria No. 2', TRUE, now(), now())
ON CONFLICT (code) DO NOTHING;


-- ── Admin de demo ────────────────────────────────────────────────────────────

INSERT INTO users (email, password_hash, full_name, role, campus_id, is_active, created_at, updated_at)
SELECT 'admin@prepa2.local',
       '$2b$10$fpVPSYvZt5j7g0niXf9Kwukt1hqw.O9LqAr6End2uDQLWkibC04MK',
       'Admin Demo Prepa 2',
       'admin',
       c.id,
       TRUE, now(), now()
  FROM campuses c
 WHERE c.code = 'prepa-2'
ON CONFLICT (email) DO NOTHING;


-- ── Catálogo maestro de asignaturas (compartido por toda la red) ─────────────

INSERT INTO subjects (code, name, description, is_active, created_at, updated_at)
VALUES
  ('TAEV-DIS', 'Diseño',         'Fundamentos de diseño gráfico y composición visual.', TRUE, now(), now()),
  ('TAEV-ART', 'Arte',           'Expresión artística y apreciación estética.',          TRUE, now(), now()),
  ('TAEV-SER', 'Serigrafía',     'Técnicas de impresión y estampado textil.',            TRUE, now(), now()),
  ('TAEV-SAL', 'Salubridad',     'Salud comunitaria y primeros auxilios.',               TRUE, now(), now()),
  ('TAEV-ETI', 'Ética',          'Reflexión ética aplicada a la vida ciudadana.',        TRUE, now(), now()),
  ('TAEV-ROB', 'Robótica',       'Electrónica, programación y prototipado.',             TRUE, now(), now()),
  ('TAEV-EMP', 'Emprendimiento', 'Modelos de negocio y proyectos productivos.',          TRUE, now(), now())
ON CONFLICT (code) DO NOTHING;


-- ── Semestre 2026A, ABIERTO AHORA ────────────────────────────────────────────
--
-- La ventana va de hace 5 minutos a dentro de 2 horas: al correr el seed el
-- formulario ya está aceptando envíos, sin tener que tocar nada.
--
-- Para probar los otros estados de la ventana, sin recrear nada:
--   cerrado por kill switch → UPDATE semesters SET window_mode = 'force_closed' WHERE code = '2026A';
--   abierto a la fuerza     → UPDATE semesters SET window_mode = 'force_open'   WHERE code = '2026A';
--   todavía no abre         → UPDATE semesters SET opens_at = now() + interval '1 hour',
--                                                  closes_at = now() + interval '2 hours',
--                                                  window_mode = 'scheduled' WHERE code = '2026A';
--   ya cerró                → UPDATE semesters SET opens_at = now() - interval '2 hours',
--                                                  closes_at = now() - interval '1 hour',
--                                                  window_mode = 'scheduled' WHERE code = '2026A';

INSERT INTO semesters (campus_id, code, label, is_current, opens_at, closes_at,
                       window_mode, ranks_required, notes, created_by_id, created_at, updated_at)
SELECT c.id,
       '2026A',
       '2026-A',
       TRUE,
       now() - interval '5 minutes',
       now() + interval '2 hours',
       'scheduled',
       3,
       'Semestre de demo generado por Database/seeds/001_demo_semester.sql',
       u.id,
       now(), now()
  FROM campuses c
  JOIN users u ON u.email = 'admin@prepa2.local'
 WHERE c.code = 'prepa-2'
ON CONFLICT (campus_id, code) DO NOTHING;


-- ── Oferta del semestre: las 7 asignaturas ──────────────────────────────────

INSERT INTO semester_subjects (semester_id, subject_id, display_order, is_active, created_at, updated_at)
SELECT s.id,
       sub.id,
       orden_map.orden,
       TRUE, now(), now()
  FROM semesters s
  JOIN campuses c ON c.id = s.campus_id AND c.code = 'prepa-2'
  JOIN (VALUES
          ('TAEV-DIS', 0), ('TAEV-ART', 1), ('TAEV-SER', 2), ('TAEV-SAL', 3),
          ('TAEV-ETI', 4), ('TAEV-ROB', 5), ('TAEV-EMP', 6)
       ) AS orden_map(code, orden) ON TRUE
  JOIN subjects sub ON sub.code = orden_map.code
 WHERE s.code = '2026A'
ON CONFLICT (semester_id, subject_id) DO NOTHING;


-- ── Grupos: 3 por asignatura (A, B, C) con cupo 10 ──────────────────────────
--
-- 7 asignaturas × 3 grupos × 10 lugares = 210 lugares para 30 alumnos de
-- prueba. Para forzar el camino "se llenó, pasa al rank 2" y el camino
-- "unplaced", bajá el cupo:
--   UPDATE subject_groups SET capacity = 1;

INSERT INTO subject_groups (semester_subject_id, label, capacity, assigned_count,
                            display_order, is_active, created_at, updated_at)
SELECT ss.id,
       g.label,
       10,
       0,
       g.orden,
       TRUE, now(), now()
  FROM semester_subjects ss
  JOIN semesters s ON s.id = ss.semester_id AND s.code = '2026A'
  JOIN campuses c ON c.id = s.campus_id AND c.code = 'prepa-2'
  JOIN (VALUES ('A', 0), ('B', 1), ('C', 2)) AS g(label, orden) ON TRUE
ON CONFLICT (semester_subject_id, label) DO NOTHING;


-- ── Padrón: 30 códigos de 9 dígitos ─────────────────────────────────────────
--
-- Van del 218327451 al 218327480. Cualquiera sirve para probar el portal.
-- Los primeros 5 llevan nombre; el resto queda con full_name NULL a propósito,
-- para que el Frontend tenga que manejar ese caso (el padrón real llega
-- incompleto más veces de las que uno quisiera).

INSERT INTO semester_students (semester_id, code, full_name, email, career,
                               student_semester_label, is_active, created_at, updated_at)
SELECT s.id,
       lpad((218327450 + n)::text, 9, '0'),
       CASE n
         WHEN 1 THEN 'Fernanda Torres Aguilar'
         WHEN 2 THEN 'Diego Ramírez Solano'
         WHEN 3 THEN 'Valeria Mendoza Cruz'
         WHEN 4 THEN 'Sebastián López Rivas'
         WHEN 5 THEN 'Ximena Castillo Vega'
         ELSE NULL
       END,
       NULL,
       'Bachillerato General por Competencias',
       '4to semestre',
       TRUE, now(), now()
  FROM semesters s
  JOIN campuses c ON c.id = s.campus_id AND c.code = 'prepa-2'
  CROSS JOIN generate_series(1, 30) AS n
 WHERE s.code = '2026A'
ON CONFLICT (semester_id, code) DO NOTHING;


-- ── Resumen ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_semestre  TEXT;
  v_alumnos   INT;
  v_oferta    INT;
  v_grupos    INT;
  v_lugares   INT;
BEGIN
  SELECT s.label,
         (SELECT COUNT(*) FROM semester_students ss WHERE ss.semester_id = s.id),
         (SELECT COUNT(*) FROM semester_subjects sj WHERE sj.semester_id = s.id),
         (SELECT COUNT(*) FROM subject_groups g
            JOIN semester_subjects sj ON sj.id = g.semester_subject_id
           WHERE sj.semester_id = s.id),
         (SELECT COALESCE(SUM(g.capacity), 0) FROM subject_groups g
            JOIN semester_subjects sj ON sj.id = g.semester_subject_id
           WHERE sj.semester_id = s.id)
    INTO v_semestre, v_alumnos, v_oferta, v_grupos, v_lugares
    FROM semesters s
    JOIN campuses c ON c.id = s.campus_id AND c.code = 'prepa-2'
   WHERE s.code = '2026A';

  RAISE NOTICE '';
  RAISE NOTICE '  Semestre % listo y ABIERTO', v_semestre;
  RAISE NOTICE '  % alumnos en el padrón (218327451 … 218327480)', v_alumnos;
  RAISE NOTICE '  % asignaturas ofertadas · % grupos · % lugares', v_oferta, v_grupos, v_lugares;
  RAISE NOTICE '  admin@prepa2.local / taev-demo-2026';
  RAISE NOTICE '';
END $$;


-- =============================================================================
-- LIMPIEZA — para volver a sembrar desde cero.
--
-- DESTRUCTIVO. Está comentado a propósito: descomentar y correr a mano,
-- nunca automatizar. Sólo borra el semestre de demo (y en cascada su padrón,
-- oferta, grupos, envíos y asignaciones); deja el catálogo y el campus.
--
--   DELETE FROM semesters s
--    USING campuses c
--    WHERE s.campus_id = c.id
--      AND c.code = 'prepa-2'
--      AND s.code = '2026A';
-- =============================================================================
