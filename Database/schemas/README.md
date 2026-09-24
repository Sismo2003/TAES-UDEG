# Schemas

Modelos y garantías de la base de datos que no viven en Prisma.

La **fuente de verdad** del esquema sigue siendo
[`Backend/prisma/schema.prisma`](../../Backend/prisma/schema.prisma).

## Archivos

| Archivo | Qué es |
|---|---|
| [`001_taev.dbml`](./001_taev.dbml) | ERD del dominio completo. Una **vista**, no la fuente de verdad. Visualizar en https://dbml.dbdiagram.io/home → *Import from DBML* |
| [`002_constraints.sql`](./002_constraints.sql) | Los CHECK constraints y el índice parcial que **Prisma no sabe generar**. Copia de referencia del bloque que va pegado al final de la migración inicial |

## Por qué existe `002_constraints.sql`

Prisma Migrate no expresa CHECK constraints ni índices parciales. Sin ese
bloque el esquema queda estructuralmente correcto pero **sin ninguna de sus
garantías**: códigos de alumno de cualquier longitud, cupos sobrepasables, dos
semestres activos en el mismo campus, admins sin escuela.

Ese SQL ya está aplicado dentro de
`Backend/prisma/migrations/20260827000000_init_taev/migration.sql`. El archivo
de acá existe para que las reglas se vean versionadas y revisables sin abrir la
carpeta de migraciones, y para poder repegarlas si alguna vez se regenera la
migración inicial.

**La trampa**: si regeneras la migración desde cero, Prisma no re-emite nada de
esto. Hay que volver a pegarlo a mano.

## Cómo actualizar

1. Editar `Backend/prisma/schema.prisma` (la fuente de verdad).
2. Generar la migración sin aplicarla:
   `npm run prisma:migrate:dev -- --create-only --name <nombre>`.
3. **Leer el `migration.sql`.** Si tiene `DROP`, `TRUNCATE`, `DELETE` o un
   cambio de tipo sobre una columna con datos: parar y usar expand/contract.
4. Si el cambio necesita un CHECK o un índice parcial, agregarlo al final del
   `migration.sql` **y** a `002_constraints.sql`. Los dos.
5. Reflejar el cambio en `001_taev.dbml` y re-validar pegándolo en dbdiagram.io.
6. Correr el test de regresión
   [`../scripts/verify_constraints.sql`](../scripts/verify_constraints.sql)
   contra una base desechable.
7. Actualizar [`Docs/DATABASE.md`](../../Docs/DATABASE.md) si la decisión
   afecta comportamiento.
