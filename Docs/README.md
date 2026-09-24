# Docs

Documentación del proyecto y del stack. Aquí vive todo lo que no es código pero
alguien necesita leer para entender cómo está armado esto.

## Índice

### 👉 Si vas a escribir código ahora

- [`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md) — **empezá acá**. Registro
  de las Fases 0–5 ya implementadas (API pública, portal cableado, auth + API
  Admin, allocator, capa `models/` + módulos esenciales del panel): qué se
  hizo, cómo se verificó y cómo levantar todo.
- [`ROADMAP.md`](./ROADMAP.md) — **qué sigue**. Fases 6 a 11 con su alcance,
  las decisiones abiertas de cada una, el criterio de "hecho" y por qué van en
  ese orden.
- [`HANDOFF.md`](./HANDOFF.md) — referencia de los contratos de los endpoints
  públicos (§4) y de por qué las decisiones son como son. La tabla de estado y
  el orden de trabajo están actualizados; los 7 desajustes originales (§3) ya
  están resueltos.

### Dominio y producto

- [`TAEV-DOMAIN.md`](./TAEV-DOMAIN.md) — **leer primero**. Qué es TAEV, el
  alcance multi-escuela, los roles y su alcance, el flujo end-to-end, la
  ventana de envío y su kill switch, cómo reparte el motor de asignación, y las
  reglas de negocio que rigen el sistema.
- [`DATABASE.md`](./DATABASE.md) — diseño técnico: tablas, constraints,
  autorización por campus, la implementación del allocator, la superficie de
  endpoints, y las trampas de Prisma ya resueltas.

### Stack y arquitectura

- [`STACK-SETUP.md`](./STACK-SETUP.md) — qué se creó cuando se inicializó el
  stack, decisiones tomadas, comandos para arrancar.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — cómo se conectan Backend, Frontend,
  Admin y Postgres. Reglas de comunicación entre capas.

### Esquema y base de datos

| Archivo | Qué es |
|---|---|
| [`../Backend/prisma/schema.prisma`](../Backend/prisma/schema.prisma) | **Fuente de verdad del esquema** |
| [`../Backend/prisma/migrations/`](../Backend/prisma/migrations/) | Migraciones versionadas |
| [`../Database/schemas/001_taev.dbml`](../Database/schemas/001_taev.dbml) | ERD — pegar en https://dbml.dbdiagram.io/home |
| [`../Database/schemas/002_constraints.sql`](../Database/schemas/002_constraints.sql) | CHECKs e índices parciales que Prisma no genera |
| [`../Database/scripts/verify_constraints.sql`](../Database/scripts/verify_constraints.sql) | Test de regresión del esquema |
| [`../Database/seeds/001_demo_semester.sql`](../Database/seeds/001_demo_semester.sql) | Seed de demo: semestre abierto, 7 asignaturas, 21 grupos, 30 alumnos |

### Código con reglas de negocio incrustadas

- [`../Backend/utils/semesterWindow.js`](../Backend/utils/semesterWindow.js) —
  la única función que decide si el formulario acepta envíos. Cubierta por
  `npm test` en `Backend/`.

### Convenciones para agentes

- [`../.agents/skills/`](../.agents/skills/) — backend, frontend, ui.
- [`../AGENTS.md`](../AGENTS.md) · [`../CLAUDE.md`](../CLAUDE.md)

Cuando agregues documentos nuevos, sumalos a este índice.
