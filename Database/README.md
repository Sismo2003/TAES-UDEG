# Database

Artefactos auxiliares de la base de datos. La **fuente de verdad** del
esquema vive en `Backend/prisma/schema.prisma`, y las migraciones
versionadas en `Backend/prisma/migrations/`.

Este directorio existe para artefactos que no encajan en Prisma:

- **`schemas/`** — ERDs (diagrams PNG/SVG/DBML) para visualizar el modelo.
- **`seeds/`** — scripts de seed data (si se decide usar archivos `.sql` o
  `.json` además del seed de Prisma). Siempre datos inventados — este repo es
  **público**.
- **`scripts/`** — utilities de BD: snapshots, restore, queries de admin
  (tipo `pg_dump`/`psql`), y `generate-ddl.mjs` (ver `ddl/README.md`).
- **`ddl/`** — `schema.sql`: el DDL completo y **sin datos**, regenerado desde
  las migraciones de Prisma. Se mantiene en el repo para que la estructura de
  la base siempre esté visible sin exponer una sola fila real.

## Convención

Cuando agregues un artefacto nuevo:

1. Nombre con prefijo numérico si son archivos versionados: `001_init.sql`,
   `002_add_users.sql`, etc.
2. Comentario al inicio del archivo explicando el **por qué**, no el **qué**.
3. Si es un script que toca la BD, asume que **puede borrar datos** y
   documenta la guarda correspondiente.
