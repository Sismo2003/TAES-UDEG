import dotenv from 'dotenv';
dotenv.config();

// CONSTANTES GLOBALES

const rawOrigins = process.env.ALLOWED_ORIGINS;
const defaultOrigins = ['http://localhost:4321', 'http://localhost:4322'];
const origins = (rawOrigins ? rawOrigins.split(',') : defaultOrigins)
  .map((o) => o.trim())
  .filter((o) => o && o !== '*');

const env = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT) || 4000;

const db = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: process.env.DB_SSL === 'true',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL DOMINIO TAEV
//
// Todo lo ajustable vive acá, leído de env con defaults sanos. Nada de números
// mágicos desparramados por los controllers.
//
// Ojo con la división de responsabilidades: `ranksRequired` y la duración de la
// ventana son DEFAULTS para crear un semestre nuevo. Una vez creado, el valor
// real vive en la fila del semestre (`semesters.ranks_required`, `opens_at`,
// `closes_at`) y es ese el que mandan las validaciones. Cambiar el .env no
// altera un semestre ya creado — y así debe ser.
// ─────────────────────────────────────────────────────────────────────────────

const num = (raw, fallback) => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const taev = {
  /** Longitud exacta del código de alumno UDEG. Estrictamente 9 dígitos. */
  studentCodeLength: num(process.env.TAEV_STUDENT_CODE_LENGTH, 9),
  /** Default de preferencias a ordenar al crear un semestre. */
  defaultRanksRequired: num(process.env.TAEV_DEFAULT_RANKS_REQUIRED, 3),
  /** Default de duración de la ventana, en minutos, al crear un semestre. */
  defaultWindowMinutes: num(process.env.TAEV_DEFAULT_WINDOW_MINUTES, 15),
  /**
   * Namespace del advisory lock de PostgreSQL que serializa las corridas del
   * allocator. Se usa como `pg_advisory_xact_lock(clave, semester_id)`: dos
   * admins dando click a "asignar" al mismo tiempo se encolan en vez de
   * pelearse por los cupos.
   */
  allocationLockKey: num(process.env.TAEV_ALLOCATION_LOCK_KEY, 728301),
  /** Envíos permitidos por IP en la ventana del rate limiter del portal. */
  submitRateLimitMax: num(process.env.TAEV_SUBMIT_RATE_LIMIT_MAX, 10),
  submitRateLimitWindowMs: num(process.env.TAEV_SUBMIT_RATE_LIMIT_WINDOW_MS, 60_000),
};

/** Regex derivada de la longitud configurada — un solo lugar la define. */
taev.studentCodePattern = new RegExp(`^\\d{${taev.studentCodeLength}}$`);

const auth = {
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
};

/**
 * Validación fail-fast de la configuración. La llama `server.js` ANTES de
 * escuchar: es preferible no arrancar a arrancar mal configurado y descubrirlo
 * durante la ventana de 15 minutos.
 *
 * @throws {Error} con todos los problemas juntos, no de a uno.
 */
function assertConfig() {
  const problemas = [];

  if (!Number.isInteger(taev.studentCodeLength) || taev.studentCodeLength < 1) {
    problemas.push('TAEV_STUDENT_CODE_LENGTH debe ser un entero positivo.');
  }
  if (!Number.isInteger(taev.defaultRanksRequired) || taev.defaultRanksRequired < 1 || taev.defaultRanksRequired > 10) {
    problemas.push('TAEV_DEFAULT_RANKS_REQUIRED debe ser un entero entre 1 y 10.');
  }
  if (!Number.isInteger(taev.defaultWindowMinutes) || taev.defaultWindowMinutes < 1) {
    problemas.push('TAEV_DEFAULT_WINDOW_MINUTES debe ser un entero positivo.');
  }
  if (env === 'production') {
    if (auth.jwtSecret.length < 32) {
      problemas.push('JWT_SECRET debe tener al menos 32 caracteres en producción.');
    }
    if (origins.length === 0) {
      problemas.push('ALLOWED_ORIGINS no puede quedar vacío en producción.');
    }
  }

  if (problemas.length > 0) {
    throw new Error(`Configuración inválida:\n  - ${problemas.join('\n  - ')}`);
  }
}

export {
  origins as ALLOWED_ORIGINS,
  env as NODE_ENV,
  port as PORT,
  db as DB_CONFIG,
  taev as TAEV_CONFIG,
  auth as AUTH_CONFIG,
  assertConfig,
};
