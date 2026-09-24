#!/usr/bin/env node
/**
 * generate-ddl.mjs — arma un DDL único y limpio (sin una sola fila de datos)
 * a partir de las migraciones de Prisma, para que el repo (PÚBLICO) siempre
 * tenga a mano el esquema real de la base sin necesitar levantar Postgres
 * ni exponer nada de lo que hay adentro.
 *
 * Fuente de verdad real: Backend/prisma/schema.prisma y sus migraciones.
 * Este archivo es DERIVADO — no se edita a mano, se regenera.
 *
 * Uso:
 *   node Database/scripts/generate-ddl.mjs
 *
 * Cuándo correrlo: cada vez que se aplique una migración nueva (ver el
 * flujo de la sección "Base de datos" en CLAUDE.md), antes de commitear.
 *
 * Qué hace:
 *   1. Lee Backend/prisma/migrations/<timestamp>_<nombre>/migration.sql en
 *      orden cronológico (el nombre de carpeta ya es un timestamp).
 *   2. Descarta cualquier statement DML (INSERT/UPDATE/DELETE/COPY/MERGE),
 *      junto con el comentario que lo precede — el resultado es DDL puro.
 *   3. Concatena todo en Database/ddl/schema.sql con un separador por
 *      migración.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'Backend', 'prisma', 'migrations');
const OUT_DIR = join(__dirname, '..', 'ddl');
const OUT_FILE = join(OUT_DIR, 'schema.sql');

const DML_KEYWORDS = /^(insert|update|delete|copy|merge)\b/i;

// Separa el archivo en statements por ";" al final de línea. Cada chunk
// incluye los comentarios/blancos que lo preceden, así que si el statement
// es DML se descarta también su comentario ("SEED MÍNIMO", etc).
function stripDataStatements(sql) {
  const rawParts = sql.split(/;\s*\n/);
  const lastIndex = rawParts.length - 1;
  const kept = [];

  rawParts.forEach((part, i) => {
    if (i === lastIndex) {
      // Cola después del último ";" del archivo — normalmente solo blancos.
      if (part.trim()) kept.push(part);
      return;
    }

    const bare = part.replace(/--.*$/gm, '').trim();
    if (bare && DML_KEYWORDS.test(bare)) return; // fuera: statement + su comentario

    kept.push(`${part};`);
  });

  return kept.join('\n');
}

function main() {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (dirs.length === 0) {
    console.error(`[DDL] no encontré migraciones en ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const header = `-- =============================================================================
-- DDL LIMPIO — TAEV-UDEG-PREPA2
--
-- GENERADO. No editar a mano — se regenera con:
--   node Database/scripts/generate-ddl.mjs
--
-- Fuente: Backend/prisma/migrations/. Es DDL puro (CREATE/ALTER/CHECK/índices):
-- el generador descarta todo INSERT/UPDATE/DELETE, así que este archivo NUNCA
-- contiene un alumno, un admin ni una fila real. Es seguro para un repo público.
--
-- Regenerar cada vez que se agregue una migración nueva, antes de commitear.
-- =============================================================================

`;

  let body = '';
  for (const dir of dirs) {
    const file = join(MIGRATIONS_DIR, dir, 'migration.sql');
    const sql = readFileSync(file, 'utf8');
    const clean = stripDataStatements(sql).trim();
    body += `-- ─────────────────────────────────────────────────────────────────────────────\n-- Migración: ${dir}\n-- ─────────────────────────────────────────────────────────────────────────────\n\n${clean}\n\n`;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, header + body.trimEnd() + '\n');
  console.log(`[DDL] escrito ${OUT_FILE} (${dirs.length} migraciones, 0 filas de datos)`);
}

main();
