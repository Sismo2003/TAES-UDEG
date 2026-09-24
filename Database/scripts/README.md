# Scripts

Utilities de base de datos: verificaciones, backups, restores, queries de admin.

Cualquier script que ejecute `DROP`/`TRUNCATE`/`DELETE` debe pedir
confirmación explícita antes de correr — no se automatiza nada destructivo.

## Archivos

- [`verify_constraints.sql`](./verify_constraints.sql) — **test de regresión del
  esquema**. Verifica que la base *rechaza* las 27 violaciones que debe
  rechazar: códigos que no son de 9 dígitos, dos semestres activos en el mismo
  campus, admin sin escuela, sobrecupo, doble envío, preferencias que cruzan
  semestres.

  Corre **sólo contra una base desechable** — inserta datos de prueba. Las
  instrucciones completas están en el encabezado del archivo. Correrlo cada vez
  que se toque `schema.prisma` o `002_constraints.sql`.
