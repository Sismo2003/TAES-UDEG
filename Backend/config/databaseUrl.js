/**
 * databaseUrl.js — arma la `DATABASE_URL` de PostgreSQL a partir de las
 * variables DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/DB_SSL.
 *
 * Fuente única: ni el `.env` ni el CI mantienen una URL aparte de las DB_*.
 * La usan dos lugares:
 *   - `config/db.js`         para instanciar PrismaClient en runtime.
 *   - `prisma/build-database-url.js` para inyectarla al Prisma CLI.
 */
export function buildDatabaseUrl(env = process.env) {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = env;

  for (const [key, val] of Object.entries({ DB_HOST, DB_NAME, DB_USER })) {
    if (!val) throw new Error(`[db] Falta ${key} en el entorno.`);
  }

  const sslSegment = DB_SSL === 'true' ? '?sslmode=require' : '';
  return (
    `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD ?? '')}` +
    `@${DB_HOST}:${DB_PORT || 5432}/${DB_NAME}${sslSegment}`
  );
}
