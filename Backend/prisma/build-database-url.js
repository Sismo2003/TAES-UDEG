/**
 * build-database-url.js — construye DATABASE_URL a partir de las variables
 * DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/DB_SSL que ya existen en .env.
 *
 * Por qué: Prisma CLI (db pull, migrate deploy, etc.) necesita DATABASE_URL
 * en el entorno. En vez de mantener una segunda copia de las credenciales
 * (una como DB_* y otra como URL) en cada .env/.env.template/secret de CI,
 * esta única función arma la URL en el momento en que se invoca el CLI.
 *
 * Uso: node prisma/build-database-url.js && npx prisma <cmd>
 * (o, más simple, los scripts de package.json ya lo encadenan con `&&`).
 */
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { buildDatabaseUrl } from '../config/databaseUrl.js';

// quiet: sin esto dotenv imprime su banner en stdout, y el modo "imprime la URL"
// de abajo se vuelve inusable (el banner queda pegado a la URL al capturarla con
// $(...), que fue justo cómo se coló la password en un log).
dotenv.config({ quiet: true });

const { DB_HOST, DB_PORT, DB_NAME, DB_USER } = process.env;
const url = buildDatabaseUrl();

const args = process.argv.slice(2);

// ─────────────────────────────────────────────────────────────────────────────
// GUARDA ANTI-DESTRUCCIÓN
//
// `migrate dev`, `migrate reset` y `db push` PUEDEN BORRAR LA BASE ENTERA:
// ante cualquier drift entre el esquema real y las migraciones del repo, Prisma
// ofrece (y con --force-reset ejecuta sin preguntar) un DROP + recreación.
//
// El rollout de producción usa `migrate deploy`, que es no-destructivo y no pasa
// por aquí. Lo que esta guarda impide es el accidente humano: correr un comando
// de desarrollo con un .env que apunte a producción.
//
// Regla: los comandos destructivos solo se permiten contra un host local. Para
// un caso legítimo contra un host remoto hay que pasar PRISMA_ALLOW_REMOTE=1 de
// forma explícita en esa invocación.
// ─────────────────────────────────────────────────────────────────────────────
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const DESTRUCTIVE = [
  ['migrate', 'dev'],
  ['migrate', 'reset'],
  ['db', 'push'],
];

const isDestructive = DESTRUCTIVE.some(
  ([a, b]) => args[0] === a && args[1] === b
);
const isLocalHost = LOCAL_HOSTS.has(String(DB_HOST).toLowerCase());

if (args.length > 0) {
  // Siempre visible: contra qué base se va a correr. Nunca la password.
  console.error(
    `[prisma] ${args.join(' ')} → ${DB_USER}@${DB_HOST}:${DB_PORT || 5432}/${DB_NAME}`
  );
}

if (isDestructive && !isLocalHost) {
  if (process.env.PRISMA_ALLOW_REMOTE === '1') {
    console.error(
      `[prisma] AVISO: '${args[0]} ${args[1]}' contra el host REMOTO ${DB_HOST} ` +
        `permitido por PRISMA_ALLOW_REMOTE=1. Puede destruir datos.`
    );
  } else {
    throw new Error(
      `[prisma] BLOQUEADO: '${args[0]} ${args[1]}' es destructivo y ${DB_HOST} no es un host local.\n` +
        `  Base objetivo: ${DB_NAME} en ${DB_HOST}:${DB_PORT || 5432}\n` +
        `  Este comando puede borrar la base entera. Para producción usa 'migrate deploy',\n` +
        `  que solo aplica migraciones pendientes y nunca resetea.\n` +
        `  Si de verdad lo necesitas contra un host remoto: PRISMA_ALLOW_REMOTE=1 npm run ...`
    );
  }
}

if (args.length === 0) {
  // Modo "imprime la URL" (útil para depurar o para exportarla a mano).
  console.log(url);
} else {
  // Modo "ejecuta prisma con la URL inyectada" — evita imprimir la URL
  // (contiene la password) en logs de CI.
  execFileSync('npx', ['prisma', ...args], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
