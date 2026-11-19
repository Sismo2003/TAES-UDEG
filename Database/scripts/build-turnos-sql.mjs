#!/usr/bin/env node
/**
 * build-turnos-sql.mjs — genera el SQL que deja la base lista "desde cero"
 * para un día de registro con DOS turnos (cada uno es un semestre propio, con
 * su padrón, su oferta y sus cupos):
 *
 *   <code> / matutino    [opens, closes)  ← is_current, link /matutino
 *   <code> / vespertino  [opens, closes)  ← is_current, link /vespertino
 *
 * Un semestre activo POR (campus, turno) — migración 20261110120000_semester_shift.
 *
 * Este script NO contiene datos: lee los CSV del padrón y un JSON de oferta y
 * escribe el .sql en una ruta que le pases (usar una ignorada por git, p. ej.
 * Database/backups/). El .sql generado SÍ trae datos reales: nunca commitearlo.
 *
 * Uso:
 *   node Database/scripts/build-turnos-sql.mjs \
 *     --matutino   ruta/padron-matutino.csv \
 *     --vespertino ruta/padron-vespertino.csv \
 *     --config     ruta/turnos.config.json \
 *     --out        Database/backups/reset_turnos.sql
 *
 * CSV esperado (export de la escuela): CODIGO,NOMBRE,SEMESTRE,Programa
 * Config: ver Database/scripts/turnos.config.example.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

// ── args ────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
for (const k of ['matutino', 'vespertino', 'config', 'out']) {
  if (!args[k]) die(`falta --${k}`);
}

function die(msg) {
  console.error(`[TURNOS] ERROR: ${msg}`);
  process.exit(1);
}

// ── CSV (RFC 4180: comillas, comillas dobles escapadas, comas internas) ─────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

function loadPadron(path, shift) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows.shift().map((h) => h.trim().toUpperCase());
  const idx = (name) => {
    const i = header.indexOf(name);
    if (i < 0) die(`${path}: falta la columna ${name}`);
    return i;
  };
  const iCode = idx('CODIGO'), iName = idx('NOMBRE'), iSem = idx('SEMESTRE'), iProg = idx('PROGRAMA');

  const seen = new Set();
  return rows.map((r, n) => {
    const line = n + 2;
    const code = (r[iCode] ?? '').trim();
    if (!/^[0-9]{9}$/.test(code)) die(`${path}:${line} código inválido (debe ser de 9 dígitos)`);
    if (seen.has(code)) die(`${path}:${line} código repetido dentro del archivo`);
    seen.add(code);
    const name = (r[iName] ?? '').trim().replace(/\s+/g, ' ');
    const label = (r[iSem] ?? '').trim().replace(/\s+/g, ' ');
    const career = (r[iProg] ?? '').trim().replace(/\s+/g, ' ');
    if (name.length > 160) die(`${path}:${line} nombre > 160 caracteres`);
    if (label.length > 32) die(`${path}:${line} SEMESTRE > 32 caracteres: "${label}"`);
    if (career.length > 120) die(`${path}:${line} Programa > 120 caracteres`);
    if (!label.toUpperCase().includes(shift)) {
      die(`${path}:${line} el SEMESTRE "${label}" no dice ${shift} — ¿archivo equivocado?`);
    }
    return { code, name: name || null, label: label || null, career: career || null };
  });
}

// ── config ──────────────────────────────────────────────────────────────────
const cfg = JSON.parse(readFileSync(args.config, 'utf8'));
const SHIFTS = ['MATUTINO', 'VESPERTINO'];

function checkInstant(name, v) {
  if (typeof v !== 'string' || !/[+-]\d\d:\d\d$|Z$/.test(v) || Number.isNaN(Date.parse(v))) {
    die(`config.${name} debe ser ISO 8601 CON zona horaria (p. ej. 2026-11-19T07:00:00-06:00)`);
  }
  return new Date(v);
}

if (!cfg.campusCode) die('config.campusCode requerido');

// ── usuarios del panel (opcional). Sólo el HASH bcrypt, nunca la contraseña:
//    node Backend/scripts/hash-string.js  → "$2b$10$..."
const USERS = cfg.users ?? [];
if (!Array.isArray(USERS)) die('config.users debe ser una lista');
USERS.forEach((u, i) => {
  const where = `config.users[${i}]`;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email ?? '') || u.email.length > 160) die(`${where}.email inválido`);
  if (!u.fullName || u.fullName.length > 160) die(`${where}.fullName requerido, ≤ 160`);
  if (!['superadmin', 'admin', 'viewer'].includes(u.role)) die(`${where}.role debe ser superadmin | admin | viewer`);
  if (u.role !== 'superadmin' && !u.campusCode) die(`${where}: un ${u.role} necesita campusCode (CHECK users_campus_scope)`);
  if (!/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(u.passwordHash ?? '')) {
    die(`${where}.passwordHash debe ser un hash bcrypt (node Backend/scripts/hash-string.js), NO la contraseña`);
  }
});

for (const s of SHIFTS) {
  const sh = cfg.shifts?.[s];
  if (!sh) die(`config.shifts.${s} requerido`);
  // ranksRequired por turno (sh.ranksRequired) o global (cfg.ranksRequired).
  const ranks = sh.ranksRequired ?? cfg.ranksRequired;
  if (!Number.isInteger(ranks) || ranks < 1 || ranks > 10) {
    die(`ranksRequired de ${s} debe ser entero 1–10 (config.ranksRequired o config.shifts.${s}.ranksRequired)`);
  }
  sh._ranks = ranks;
  if (!sh.code || sh.code.length > 16) die(`config.shifts.${s}.code requerido, ≤ 16 caracteres`);
  if (!sh.label || sh.label.length > 64) die(`config.shifts.${s}.label requerido, ≤ 64 caracteres`);
  sh._opens = checkInstant(`shifts.${s}.opensAt`, sh.opensAt);
  sh._closes = checkInstant(`shifts.${s}.closesAt`, sh.closesAt);
  if (sh._closes <= sh._opens) die(`config.shifts.${s}: closesAt debe ser > opensAt`);

  if (!Array.isArray(sh.offering) || sh.offering.length < ranks) {
    die(`config.shifts.${s}.offering necesita al menos ${ranks} asignaturas (ranksRequired) — si no, nadie puede enviar`);
  }
  const subj = new Set();
  sh.offering.forEach((o, i) => {
    const where = `config.shifts.${s}.offering[${i}]`;
    if (!o.subjectCode) die(`${where}.subjectCode requerido`);
    if (String(o.subjectCode).length > 32) die(`${where}.subjectCode > 32 caracteres`);
    if (o.name != null && (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 120)) {
      die(`${where}.name debe ser texto de 1–120 caracteres`);
    }
    if (subj.has(o.subjectCode)) die(`${where}: asignatura repetida ${o.subjectCode}`);
    subj.add(o.subjectCode);
    if (!Array.isArray(o.groups) || o.groups.length === 0) die(`${where}.groups: al menos un grupo`);
    const labels = new Set();
    o.groups.forEach((g, j) => {
      if (!g.label || String(g.label).length > 32) die(`${where}.groups[${j}].label requerido, ≤ 32`);
      if (labels.has(g.label)) die(`${where}.groups[${j}]: label repetido "${g.label}"`);
      labels.add(g.label);
      if (!Number.isInteger(g.capacity) || g.capacity <= 0) {
        die(`${where}.groups[${j}].capacity debe ser entero > 0 (está en ${JSON.stringify(g.capacity)})`);
      }
    });
  });
}
const M = cfg.shifts.MATUTINO, V = cfg.shifts.VESPERTINO;
for (const s of SHIFTS) cfg.shifts[s]._shift = s.toLowerCase(); // enum shift: 'matutino' | 'vespertino'
if (V._opens < M._closes) die('las ventanas se traslapan: VESPERTINO.opensAt < MATUTINO.closesAt');

// ── padrón ──────────────────────────────────────────────────────────────────
const padron = { MATUTINO: loadPadron(args.matutino, 'MATUTINO'), VESPERTINO: loadPadron(args.vespertino, 'VESPERTINO') };
const both = new Set(padron.MATUTINO.map((s) => s.code));
const cross = padron.VESPERTINO.filter((s) => both.has(s.code));
if (cross.length) die(`${cross.length} código(s) aparecen en los dos turnos — corregir el padrón antes`);

// ── SQL ─────────────────────────────────────────────────────────────────────
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const guardAfter = cfg.refuseIfSubmissionsSince ?? M.opensAt;
checkInstant('refuseIfSubmissionsSince', guardAfter);

function shiftSql(s, sh, isCurrent) {
  const out = [];
  out.push(`-- ── ${s}: ${sh.code} ─────────────────────────────────────────────`);
  out.push(`INSERT INTO semesters (campus_id, code, label, shift, is_current, opens_at, closes_at, window_mode, ranks_required, notes, created_by_id, updated_at)
SELECT c.id, ${lit(sh.code)}, ${lit(sh.label)}, '${sh._shift}', ${isCurrent}, ${lit(sh.opensAt)}::timestamptz, ${lit(sh.closesAt)}::timestamptz,
       'scheduled', ${sh._ranks}, ${lit(`Turno ${s}. Generado por build-turnos-sql.mjs`)},
       (SELECT id FROM users WHERE role = 'superadmin' AND is_active ORDER BY id LIMIT 1), now()
FROM campuses c WHERE c.code = ${lit(cfg.campusCode)};`);

  const sem = `(SELECT s.id FROM semesters s JOIN campuses c ON c.id = s.campus_id WHERE c.code = ${lit(cfg.campusCode)} AND s.code = ${lit(sh.code)} AND s.shift = '${sh._shift}')`;

  sh.offering.forEach((o, i) => {
    out.push(`INSERT INTO semester_subjects (semester_id, subject_id, display_order, updated_at)
SELECT ${sem}, sub.id, ${i}, now() FROM subjects sub WHERE sub.code = ${lit(o.subjectCode)} AND sub.is_active;`);
    o.groups.forEach((g, j) => {
      out.push(`INSERT INTO subject_groups (semester_subject_id, label, capacity, display_order, updated_at)
SELECT ss.id, ${lit(g.label)}, ${g.capacity}, ${j}, now()
FROM semester_subjects ss JOIN subjects sub ON sub.id = ss.subject_id
WHERE ss.semester_id = ${sem} AND sub.code = ${lit(o.subjectCode)};`);
    });
  });

  out.push(`INSERT INTO semester_students (semester_id, code, full_name, career, student_semester_label, updated_at)
SELECT ${sem}, v.code, v.full_name, v.career, v.label, now() FROM (VALUES`);
  out.push(padron[s].map((st) => `  (${lit(st.code)}, ${lit(st.name)}, ${lit(st.career)}, ${lit(st.label)})`).join(',\n'));
  out.push(`) AS v(code, full_name, career, label);`);
  return out.join('\n\n');
}

function catalogSql() {
  const byCode = new Map();
  for (const o of [...M.offering, ...V.offering]) {
    if (o.name && !byCode.has(o.subjectCode)) byCode.set(o.subjectCode, o);
  }
  if (!byCode.size) return '-- (sin altas: todas las claves deben existir ya)';
  return `INSERT INTO subjects (code, name, description, updated_at) VALUES
${[...byCode.values()].map((o) => `  (${lit(o.subjectCode)}, ${lit(o.name.trim())}, ${lit(o.description?.trim() || null)}, now())`).join(',\n')}
ON CONFLICT (code) DO UPDATE SET is_active = true, updated_at = now();`;
}

const totalGroups = (sh) => sh.offering.reduce((n, o) => n + o.groups.length, 0);
const totalSeats = (sh) => sh.offering.reduce((n, o) => n + o.groups.reduce((m, g) => m + g.capacity, 0), 0);

const expect = (sh, s) => `    SELECT count(*) INTO n FROM semester_students WHERE semester_id = (SELECT s.id FROM semesters s WHERE s.campus_id = cid AND s.code = ${lit(sh.code)} AND s.shift = '${sh._shift}');
    IF n <> ${padron[s].length} THEN RAISE EXCEPTION '${s}: % alumnos, se esperaban ${padron[s].length}', n; END IF;
    SELECT count(*) INTO n FROM semester_subjects WHERE semester_id = (SELECT s.id FROM semesters s WHERE s.campus_id = cid AND s.code = ${lit(sh.code)} AND s.shift = '${sh._shift}');
    IF n <> ${sh.offering.length} THEN RAISE EXCEPTION '${s}: % asignaturas ofertadas, se esperaban ${sh.offering.length} (¿algún subjectCode no existe o está inactivo en el catálogo?)', n; END IF;
    SELECT count(*), coalesce(sum(capacity),0) INTO n, seats FROM subject_groups g JOIN semester_subjects ss ON ss.id = g.semester_subject_id
      WHERE ss.semester_id = (SELECT s.id FROM semesters s WHERE s.campus_id = cid AND s.code = ${lit(sh.code)} AND s.shift = '${sh._shift}');
    IF n <> ${totalGroups(sh)} OR seats <> ${totalSeats(sh)} THEN RAISE EXCEPTION '${s}: % grupos / % lugares, se esperaban ${totalGroups(sh)} / ${totalSeats(sh)}', n, seats; END IF;`;

const sql = `-- ============================================================================
-- RESET + TURNOS — generado ${new Date().toISOString()} por build-turnos-sql.mjs
--
-- ⚠️  CONTIENE DATOS REALES DE ALUMNOS. NO COMMITEAR. NO COMPARTIR.
--
-- Qué hace (todo en UNA transacción; si algo falla no cambia nada):
--   1. Verifica precondiciones (campus, superadmin, catálogo, que NO haya
--      envíos desde ${guardAfter} — para no borrar el día real por accidente).
--   2. BORRA del campus ${cfg.campusCode}: asignaciones, preferencias, envíos,
--      grupos, oferta, padrón y semestres. NO toca: campuses, users, subjects
--      (catálogo), audit_log, _prisma_migrations.
--   3. Crea ${M.code}/matutino (${M.opensAt} → ${M.closesAt}) y
--      ${V.code}/vespertino (${V.opensAt} → ${V.closesAt}), LOS DOS activos
--      (uno por turno: links /matutino y /vespertino del portal).
--   4. Carga oferta, grupos y padrón: ${padron.MATUTINO.length} + ${padron.VESPERTINO.length} = ${padron.MATUTINO.length + padron.VESPERTINO.length} alumnos.
--   5. Verifica conteos; si no cuadran, ROLLBACK.
--
-- Correr con:  psql -v ON_ERROR_STOP=1 --single-transaction -f este_archivo.sql
-- ANTES: pg_dump de respaldo.
-- ============================================================================

\\set ON_ERROR_STOP on
BEGIN;

SET LOCAL lock_timeout = '10s';

-- ── 0. Usuarios del panel (alta o actualización por email) ─────────────────
${USERS.length ? USERS.map((u) => `INSERT INTO users (email, password_hash, full_name, role, campus_id, is_active, updated_at)
VALUES (${lit(u.email.toLowerCase())}, ${lit(u.passwordHash)}, ${lit(u.fullName)}, '${u.role}',
        ${u.role === 'superadmin' ? 'NULL' : `(SELECT id FROM campuses WHERE code = ${lit(u.campusCode)})`}, true, now())
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name,
  role = EXCLUDED.role, campus_id = EXCLUDED.campus_id, is_active = true, updated_at = now();`).join('\n') : '-- (sin usuarios en la config)'}

-- ── 1. Precondiciones ───────────────────────────────────────────────────────
DO $$
DECLARE cid int; n int;
BEGIN
  SELECT id INTO cid FROM campuses WHERE code = ${lit(cfg.campusCode)} AND is_active;
  IF cid IS NULL THEN RAISE EXCEPTION 'campus ${cfg.campusCode} no existe o está inactivo'; END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'superadmin' AND is_active) THEN
    RAISE EXCEPTION 'no hay superadmin activo (se usa como created_by de los semestres)';
  END IF;

  SELECT count(*) INTO n FROM form_submissions f JOIN semesters s ON s.id = f.semester_id
   WHERE s.campus_id = cid AND f.submitted_at >= ${lit(guardAfter)}::timestamptz;
  IF n > 0 THEN
    RAISE EXCEPTION 'ABORTADO: hay % envío(s) desde ${guardAfter}. Esto parece el día real; no se borra nada.', n;
  END IF;
${[...new Set([...M.offering, ...V.offering].filter((o) => !o.name).map((o) => o.subjectCode))].map((c) => `
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE code = ${lit(c)} AND is_active) THEN
    RAISE EXCEPTION 'la asignatura ${c} no existe o está inactiva en el catálogo';
  END IF;`).join('')}
END $$;

-- Estado ANTES (queda en la salida de psql)
SELECT 'ANTES' AS momento,
  (SELECT count(*) FROM semesters)              AS semestres,
  (SELECT count(*) FROM semester_students)      AS padron,
  (SELECT count(*) FROM semester_subjects)      AS oferta,
  (SELECT count(*) FROM subject_groups)         AS grupos,
  (SELECT count(*) FROM form_submissions)       AS envios,
  (SELECT count(*) FROM group_assignments)      AS asignaciones;

-- ── 2. Borrado (orden por FKs; group_assignments → subject_groups es RESTRICT)
DELETE FROM group_assignments ga USING form_submissions f, semesters s, campuses c
 WHERE ga.submission_id = f.id AND f.semester_id = s.id AND s.campus_id = c.id AND c.code = ${lit(cfg.campusCode)};
DELETE FROM submission_preferences sp USING semesters s, campuses c
 WHERE sp.semester_id = s.id AND s.campus_id = c.id AND c.code = ${lit(cfg.campusCode)};
DELETE FROM form_submissions f USING semesters s, campuses c
 WHERE f.semester_id = s.id AND s.campus_id = c.id AND c.code = ${lit(cfg.campusCode)};
DELETE FROM subject_groups g USING semester_subjects ss, semesters s, campuses c
 WHERE g.semester_subject_id = ss.id AND ss.semester_id = s.id AND s.campus_id = c.id AND c.code = ${lit(cfg.campusCode)};
DELETE FROM semester_subjects ss USING semesters s, campuses c
 WHERE ss.semester_id = s.id AND s.campus_id = c.id AND c.code = ${lit(cfg.campusCode)};
DELETE FROM semester_students st USING semesters s, campuses c
 WHERE st.semester_id = s.id AND s.campus_id = c.id AND c.code = ${lit(cfg.campusCode)};
DELETE FROM semesters s USING campuses c
 WHERE s.campus_id = c.id AND c.code = ${lit(cfg.campusCode)};

-- ── 2b. Catálogo: alta de las TAEs que falten. Si ya existe la clave NO se
--        pisa su nombre (puede haberlo corregido un admin); sólo se reactiva.
${catalogSql()}

-- ── 3–4. Turnos ─────────────────────────────────────────────────────────────
${shiftSql('MATUTINO', M, true)}

${shiftSql('VESPERTINO', V, true)}

-- ── 5. Verificación — si algo no cuadra, la transacción se aborta ───────────
DO $$
DECLARE cid int; n int; seats int;
BEGIN
  SELECT id INTO cid FROM campuses WHERE code = ${lit(cfg.campusCode)};
  SELECT count(*) INTO n FROM semesters WHERE campus_id = cid;
  IF n <> 2 THEN RAISE EXCEPTION 'se esperaban 2 semestres, hay %', n; END IF;
  SELECT count(*) INTO n FROM semesters WHERE campus_id = cid AND is_current;
  IF n <> 2 THEN RAISE EXCEPTION 'se esperaban 2 semestres activos (uno por turno), hay %', n; END IF;
${expect(M, 'MATUTINO')}
${expect(V, 'VESPERTINO')}
  SELECT count(*) INTO n FROM form_submissions f JOIN semesters s ON s.id = f.semester_id WHERE s.campus_id = cid;
  IF n <> 0 THEN RAISE EXCEPTION 'quedaron % envíos', n; END IF;
END $$;

-- Estado DESPUÉS
SELECT s.code, s.label, s.shift, s.is_current, s.window_mode, s.ranks_required,
       s.opens_at AT TIME ZONE 'America/Mexico_City' AS abre_local,
       s.closes_at AT TIME ZONE 'America/Mexico_City' AS cierra_local,
       (SELECT count(*) FROM semester_students st WHERE st.semester_id = s.id) AS alumnos,
       (SELECT count(*) FROM semester_subjects ss WHERE ss.semester_id = s.id) AS asignaturas,
       (SELECT count(*) FROM subject_groups g JOIN semester_subjects ss ON ss.id = g.semester_subject_id WHERE ss.semester_id = s.id) AS grupos,
       (SELECT coalesce(sum(g.capacity),0) FROM subject_groups g JOIN semester_subjects ss ON ss.id = g.semester_subject_id WHERE ss.semester_id = s.id) AS lugares
FROM semesters s JOIN campuses c ON c.id = s.campus_id
WHERE c.code = ${lit(cfg.campusCode)} ORDER BY s.opens_at;

COMMIT;
`;

writeFileSync(args.out, sql);
for (const s of SHIFTS) {
  const sh = cfg.shifts[s];
  const seats = totalSeats(sh);
  const warn = seats < padron[s].length ? `  ⚠️  menos lugares (${seats}) que alumnos (${padron[s].length}): habrá no ubicados` : '';
  console.log(`[TURNOS] ${s}: ${sh.code} ${sh.opensAt} → ${sh.closesAt} | ${padron[s].length} alumnos | ${sh.offering.length} asignaturas | ${totalGroups(sh)} grupos | ${seats} lugares${warn}`);
}
console.log(`[TURNOS] escrito ${args.out}  (⚠️ datos reales — no commitear)`);
