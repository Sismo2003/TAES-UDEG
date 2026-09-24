# Seeds

Datos iniciales y de demo para la base de datos.

## Archivos

- [`001_demo_semester.sql`](./001_demo_semester.sql) — **seed de desarrollo**.
  Deja la base en un estado donde el portal público funciona de punta a punta:
  campus `prepa-2`, un admin, un semestre `2026A` **abierto**, 7 asignaturas
  ofertadas, 21 grupos (3 por asignatura, cupo 10) y 30 códigos de alumno
  (`218327451` … `218327480`).

  ```bash
  docker exec -i taev-db psql -U postgres -d taev_udeg_prepa2 \
    < Database/seeds/001_demo_semester.sql
  ```

  Es **idempotente**: correrlo dos veces no duplica nada.

  Trae en su encabezado los `UPDATE` listos para poner la ventana en cada uno de
  sus estados (todavía no abre, ya cerró, kill switch, abierta a la fuerza) y
  para bajar los cupos y forzar el camino `unplaced`.

  25 de los 30 alumnos tienen `full_name` en **NULL a propósito**: el padrón
  real llega incompleto seguido, y el Frontend tiene que manejar ese caso.

> ⚠️ **Sólo para local.** Contiene un hash de contraseña conocido y códigos de
> alumno inventados. Nunca correrlo contra producción.

## El campus inicial no está acá

`campuses` con la fila `prepa-2` se siembra dentro de la **migración inicial**,
no en este directorio: `semesters.campus_id` es `NOT NULL`, así que sin esa fila
no se puede crear ningún semestre y cualquier entorno recién migrado quedaría
inutilizable.

## Convención

Los seeds del stack se hacen normalmente vía Prisma. Estos son `.sql` porque
cargan datos de demo que dependen de constraints y de `ON CONFLICT`, y porque
así se pueden correr contra una base desechable sin levantar el Backend.
