# TAEV-UDEG-PREPA2

## Contexto del proyecto

Sistema de registro **TAEV** (Trayectorias de Aprendizaje Especializante y
Vinculación) para la UDEG. Los alumnos ordenan sus preferencias de asignatura
y el sistema los asigna a grupos con cupo **por orden de llegada**, dentro de
una ventana de 10–15 minutos.

Es una plataforma **multi-escuela**: `campuses` es la raíz del modelo. Hoy
opera sólo PREPA 2, pero cada campus corre su propio ciclo (ventana, padrón,
oferta, cupos y administradores independientes).

**Antes de escribir código, leer:**

- [`Docs/HANDOFF.md`](Docs/HANDOFF.md) — **primero esto si vas a implementar**:
  estado real, contratos de los endpoints, los desajustes conocidos entre el
  portal maquetado y la API, checklist de verificación.
- [`Docs/TAEV-DOMAIN.md`](Docs/TAEV-DOMAIN.md) — el **qué**: reglas de negocio,
  roles y su alcance, flujo, ventana de envío, cómo reparte el allocator.
- [`Docs/DATABASE.md`](Docs/DATABASE.md) — el **cómo**: tablas, constraints,
  autorización por campus, implementación del allocator, endpoints.
- [`Database/schemas/001_taev.dbml`](Database/schemas/001_taev.dbml) — ERD.

Este CLAUDE.md describe stack y convenciones, no el dominio.

### Estado de la implementación

Detalle completo de la última pasada: [`Docs/IMPLEMENTATION-LOG.md`](Docs/IMPLEMENTATION-LOG.md).
Qué sigue y en qué orden: [`Docs/ROADMAP.md`](Docs/ROADMAP.md).

| Pieza | Estado |
|---|---|
| Esquema (`Backend/prisma/schema.prisma`) | ✅ Modelado y validado |
| Migración inicial + constraints | ✅ Generada y probada contra PostgreSQL 16 |
| Lógica de la ventana (`Backend/utils/semesterWindow.js`) | ✅ Implementada, 19 tests |
| Tests del allocator (`Backend/services/allocation.service.test.js`) | ✅ 15 tests contra PostgreSQL real (fixture aislado, sin TRUNCATE) |
| Seed de demo (`Database/seeds/001_demo_semester.sql`) | ✅ Semestre abierto, 7 asignaturas, 21 grupos, 30 alumnos |
| API pública (`routes/taev.js`, `controllers/`, `services/taev.service.js`) | ✅ Implementada, curl-verificada |
| Frontend portal | ✅ Cableado a la API (los 7 desajustes de `HANDOFF.md` §3 resueltos) |
| Auth (JWT) + API Admin (`middlewares/auth.*`, `routes/admin.js`, `services/admin.*`) | ✅ Implementada — rol y campus re-validados contra la BD en cada request |
| Allocator (`services/allocation.service.js`) | ✅ Implementado (de `DATABASE.md` §7.3) + overrides manuales |
| Capa `Backend/models/` | ✅ Toda query vive acá; ningún controller ni service importa `prisma` |
| Despliegue (`deploy/`, `.github/workflows/ci-cd.yml`) | ✅ En producción — ver `Docs/DEPLOY.md` |
| Admin (SPA) | 🟡 Esenciales: semestres, padrón, catálogo, oferta/grupos, dashboard, bitácora, envíos en vivo, asignaciones. Pendientes: CSV, reportes, usuarios |

---

## Estructura del repositorio

```
/
├── Backend/          # API REST (Node + Express + Prisma + PostgreSQL)
│   └── models/       # toda query vive acá — ver models/README.md
├── Frontend/         # Sitio público (Astro + React + Tailwind v4)
├── Admin/            # Panel interno (Astro + React + Tailwind v4, SPA)
├── Docs/             # Documentación — empezar por TAEV-DOMAIN.md
├── Database/         # ERD (dbml), constraints SQL, test de regresión, seeds
├── deploy/           # compose de producción, rollout.sh, trigger de CI, vhost nginx
├── .github/workflows/ci-cd.yml  # checks → ghcr.io → rollout por Tailscale
├── .agents/skills/   # Convenciones que el agente debe seguir (ui, frontend, backend)
├── .gitignore
├── AGENTS.md         # contexto para agentes no-Claude
└── CLAUDE.md         # este archivo
```

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express 5 (ES modules) |
| ORM | Prisma 6 contra PostgreSQL 14+ |
| Frontend público | Astro 5 + React 19 (islas) + Tailwind CSS v4 |
| Admin | Astro 5 + React 19 (SPA con react-router) + Tailwind CSS v4 |
| Estado global | Zustand |
| Forms | react-hook-form + Yup |
| HTTP | Axios |
| Animación | Framer Motion (sitio público) |
| Iconos | lucide-react |
| Toasts | sonner |
| Auth | JWT (Bearer) para el panel admin, ver `Docs/DATABASE.md` §8 |
| Tests | `node:test` nativo, sin deps (`npm test` en `Backend/`) |
| SEO | **no se usa** — sitio público sin sitemap ni meta-tags avanzados |

---

## Producción

| Dominio | Qué |
|---|---|
| `https://prepa2.grid.nimbuscloud.mx` | Portal de alumnos + `/api/taev/*` |
| `https://admin.prepa2.grid.nimbuscloud.mx` | Panel admin + `/api/*` |

Push a `main` → CI → despliegue automático. Arquitectura, secretos, rollback y
operación: [`Docs/DEPLOY.md`](Docs/DEPLOY.md).

---

## Puertos locales por defecto

| Servicio | Puerto |
|---|---|
| Backend (API) | `4000` |
| Frontend público | `4321` |
| Admin | `4322` |
| PostgreSQL | `5432` |

---

## Comandos rápidos

```bash
# Backend
cd Backend
cp .env.example .env       # editar credenciales
npm install
docker run -d --name taev-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=taev_udeg_prepa2 -p 5432:5432 postgres:16-alpine
npm run prisma:migrate:deploy   # aplica la migración inicial (ya versionada)
npm run prisma:generate
npm test                        # lógica de la ventana de envío
npm run dev                     # http://localhost:4000

# Frontend
cd Frontend
npm install
cp .env.example .env
npm run dev                # http://localhost:4321

# Admin
cd Admin
npm install
cp .env.example .env
npm run dev                # http://localhost:4322
```

---

## Convenciones clave (resumen)

- **Backend**: ES modules, envelope `{ data, message }`, logs con tag `[MODULO]`,
  Prisma es la fuente de verdad del esquema. Detalle completo en
  `.agents/skills/backend/SKILL.md`.
- **Capas del Backend (regla dura)**: `routes → controllers → services → models`.
  El controller **sanitiza** el input (`utils/queryParams.js`) y arma la
  respuesta; el service **decide** (autoriza por campus, valida el dominio,
  transacciona, audita); el modelo **tiene la query**. Ningún controller ni
  service importa `prisma` — ni para un CRUD simple. Para transaccionar, el
  service usa `transaction()` de `config/db.js` y le pasa el `tx` a los
  modelos. Convenciones en `Backend/models/README.md`.
- **Listados paginados**: siempre `{ data: { rows, total, page, pageSize } }`.
  Una sola forma para todas las tablas del panel.
- **Frontend**: rutas Astro + islas React, estado en Zustand, API client
  centralizado en `src/backend/connection.ts`. Detalle en
  `.agents/skills/frontend/SKILL.md`.
- **Admin**: SPA única (`<App client:only="react" />`) con `react-router-dom`
  para navegación interna.
- **UI**: tokens semánticos en `@theme` de `global.css`, primitivos
  reusables (Button, Modal, Badge) en `components/ui/`. Detalle en
  `.agents/skills/ui/SKILL.md`.
- **Auth**: implementada según `Docs/DATABASE.md` §8. JWT con
  `JWT_SECRET` ≥ 32 chars en producción (el server no arranca si no se cumple),
  rol **y campus** re-validados contra la BD en cada request.
- **Alcance por campus**: todo endpoint del panel verifica que el recurso
  pertenezca al campus del usuario (`assertCampusAccess`). El CHECK de la BD
  garantiza que todo admin tenga campus; el middleware lo hace cumplir. Hacen
  falta los dos.
- **No SEO**: no sitemap, no prerender para motores, no meta-tags avanzados.

---

## Base de datos — regla obligatoria para cualquier agente

`Backend/prisma/schema.prisma` es la fuente de verdad del esquema.

**Cada vez que un agente modifique la base de datos** (agregar/quitar
columna, tabla nueva, cambiar tipo, índice, etc.):

1. Editar `Backend/prisma/schema.prisma`.
2. Generar la migración **sin aplicarla**:
   `npm run prisma:migrate:dev -- --create-only --name <nombre_descriptivo>`
3. **Leer el `migration.sql` generado antes de aplicarlo.** Si contiene
   `DROP`, `TRUNCATE`, `DELETE` o un cambio destructivo sobre datos
   existentes, parar y usar expand/contract. Esto no es opcional:
   `prisma migrate deploy` corre ese mismo SQL en producción y no tiene
   rollback automático.
4. **Si el cambio necesita un CHECK o un índice parcial**, agregarlo a mano al
   final del `migration.sql` **y** a `Database/schemas/002_constraints.sql`.
   Prisma **no genera** CHECK constraints ni índices parciales: si te olvidás,
   el esquema queda sin sus garantías (códigos inválidos, cupos sobrepasables,
   dos semestres activos por campus).
5. Aplicarla en local con `npm run prisma:migrate:dev`.
6. Correr `Database/scripts/verify_constraints.sql` contra una base desechable
   y `npm test` en `Backend/`.
7. Regenerar el DDL limpio (sin datos) que vive en el repo:
   `node Database/scripts/generate-ddl.mjs`. Actualiza
   `Database/ddl/schema.sql` a partir de las migraciones — ver
   `Database/ddl/README.md`.
8. Commitear la carpeta de migración, el `schema.prisma` actualizado y el
   `Database/ddl/schema.sql` regenerado, todo junto.

**Nunca correr `prisma migrate dev`, `migrate reset` ni `db push` contra
producción** — pueden borrar la base entera. `build-database-url.js` los
bloquea si `DB_HOST` no es local. Producción se toca solo con
`migrate deploy`, que es aditivo.

### Trampas del esquema ya resueltas — no las deshagas

- **Todo campo temporal lleva `@db.Timestamptz(6)`.** El `DateTime` de Prisma
  mapea a `timestamp(3)` *sin zona*, y todo el sistema depende de un instante
  exacto ("22 de agosto, 10:00").
- **`audit_log.id` es `Int`, no `BigInt`.** El `BigInt` de Prisma rompe
  `JSON.stringify` y por lo tanto `res.json()`.
- **`semester_students.code` es `VarChar(9)`, no `Char(9)`.** `CHAR` rellena con
  espacios y rompe la igualdad en silencio.
- **Los grupos y las preferencias apuntan a `semester_subjects`**, no a
  `subjects`. Es lo que impide crear un grupo de una asignatura que el semestre
  no oferta.

---

## graphify

Este proyecto tiene un knowledge graph en `graphify-out/`. Cada vez que
agregues código o docs, regenera el grafo para mantenerlo útil:

```bash
graphify update .            # incremental
graphify .                   # build completo
graphify query "<pregunta>"  # consulta sobre el código
```

Reglas:
- Para preguntas sobre el código, primero correr `graphify query "<pregunta>"`
  cuando exista `graphify-out/graph.json`. Devuelve un subgrafo acotado,
  mucho más pequeño que GRAPH_REPORT.md o `grep` crudo.
- Usar `graphify path "A" "B"` para relaciones entre dos conceptos.
- Usar `graphify explain "<concepto>"` para explicación focalizada.
- Leer `graphify-out/GRAPH_REPORT.md` solo para revisión arquitectónica amplia.
- Después de modificar código, correr `graphify update .` (AST-only, sin
  costo de API).

---

## Reglas duras

1. **Despliegue sólo por CI/CD** (`Docs/DEPLOY.md`). Producción corre en
   contenedores en el servidor `grid` detrás de `nginx-proxy`; las imágenes se
   construyen **en GitHub Actions**, nunca en el servidor. Sin live demos.
   Nunca tocar `deploy/.env` / `Backend/.env` del servidor desde el repo.
2. **Sin SEO** en el Frontend.
3. **Auth: no inventar.** Está especificada en `Docs/DATABASE.md` §8;
   implementarla siguiendo eso, no improvisar otro esquema.
4. **Sin CAPTCHA todavía.** Si se necesita, evaluar opciones.
5. **Ninguna query fuera de `Backend/models/`.** Ni Prisma ni SQL crudo en
   controllers o services — la consulta se escribe en el modelo y se llama
   desde arriba. Las dos únicas excepciones de SQL crudo están en
   `models/group.model.js` y documentadas: el advisory lock del allocator y el
   recálculo de `assigned_count` (`Docs/DATABASE.md` §7.3). Siempre
   parametrizado, nunca concatenando.
6. **Sin TypeScript en Backend** (es `.js` con ES modules, igual que la
   convención del proyecto de referencia). Frontend y Admin sí son
   TypeScript estricto.
7. **El código del alumno es de 9 dígitos exactos.** Si tocás esa regla, tenés
   que tocarla en las cuatro capas a la vez: `taev.config.json`, el store del
   Frontend, `TAEV_STUDENT_CODE_LENGTH` y el CHECK de la BD.
8. **Repo público — nunca un dato real de alumno.** Ni un padrón exportado
   (CSV/XLSX de la escuela), ni un dump de la BD real, ni credenciales. Los
   seeds y fixtures son siempre inventados (`Database/seeds/`). Si necesitás
   importar un padrón real para pruebas locales, guardalo fuera del repo — el
   `.gitignore` raíz ya bloquea `**/upload/*`, `**/uploads/*` y `**/*.xlsx`
   como red de seguridad, pero no confíes solo en eso: revisá antes de
   commitear. El esquema de la BD sin datos vive versionado en
   `Database/ddl/schema.sql`, no hace falta un dump real para verlo.
