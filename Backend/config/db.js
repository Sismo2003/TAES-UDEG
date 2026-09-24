import { PrismaClient } from '@prisma/client';
import { NODE_ENV } from './main.js';
import { buildDatabaseUrl } from './databaseUrl.js';

// Singleton de PrismaClient — evita agotar el pool de conexiones en dev
// cuando nodemon reinicia el proceso.
const globalForPrisma = globalThis;

// La URL se arma desde las DB_* (una sola fuente de credenciales). No se
// depende de que exista `DATABASE_URL` en el .env.
const datasourceUrl = buildDatabaseUrl();

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    datasourceUrl,
    log: ['error', 'warn'],
  });

if (NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

/**
 * Abre una transacción y le pasa el cliente transaccional al callback.
 *
 * Existe para que un service pueda definir el LÍMITE de la transacción sin
 * importar `prisma`: la regla del proyecto es que sólo `models/` conoce al
 * cliente (ver `Backend/models/README.md`). El service orquesta:
 *
 *   await transaction(async (tx) => {
 *     const s = await semesterModel.findById(id, tx);
 *     await auditModel.write({ ... }, tx);
 *   });
 */
export function transaction(fn) {
  return prisma.$transaction(fn);
}
