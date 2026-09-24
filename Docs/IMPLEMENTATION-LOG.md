# IMPLEMENTATION LOG — Fases 0 → 5

Registro de lo que se implementó en la pasada que cableó la API y el portal.
Antes de esto el repo tenía el esquema, la migración, `semesterWindow.js` y el
seed; los controllers/rutas/services y el frontend contra la API **no existían**.

> Para el **qué** del dominio: [`TAEV-DOMAIN.md`](./TAEV-DOMAIN.md).
> Para el **cómo** del esquema: [`DATABASE.md`](./DATABASE.md).
> Contratos de endpoints y los 7 desajustes originales: [`HANDOFF.md`](./HANDOFF.md).

---

## Resumen por fase

| Fase | Alcance | Estado | Cómo se verificó |
|---|---|---|---|
| 0 | Entorno Backend + tipado de `connection.ts` | ✅ | `npm test` 19/19, `verify_constraints.sql` 27/27 |
| 1 | API pública (`/api/taev/*`) | ✅ | curl de los 3 endpoints + todos los caminos de error |
| 2 | Portal público cableado a la API | ✅ | `tsc --noEmit` limpio, `astro build` 0 errores |
| 3 | Auth JWT + API Admin + Admin SPA (núcleo) | ✅ API / 🟡 SPA | curl de todos los endpoints admin; `astro build` 0 errores |
| 4 | Allocator + overrides manuales | ✅ | curl: fallthrough de rank, re-corrida idempotente, `GROUP_FULL` |
| 5 | Capa `models/` + endpoints paginados + Admin SPA (módulos esenciales) | ✅ | `npm test` 19/19, curl de altas/ediciones/bajas, `astro build` 0 errores |

**Sin prueba de navegador**: los dos frontends se validaron con typecheck +
build + curl exhaustivo de cada endpoint que consumen. Falta recorrer el flujo
real en un navegador.

---

## Fase 0 — Entorno

### `DATABASE_URL` en runtime — `config/databaseUrl.js` (nuevo)

`config/db.js` instanciaba `new PrismaClient()` a secas, que lee
`env("DATABASE_URL")` del `schema.prisma`. Nadie ponía esa variable (el `.env`
sólo tiene `DB_*` y `build-database-url.js` la inyecta **sólo** para el CLI de
Prisma), así que **el server no arrancaba**.

Solución: `config/databaseUrl.js` exporta `buildDatabaseUrl(env)` que arma la
URL desde las `DB_*` (una sola fuente de credenciales). La usan dos lugares:

- `config/db.js` → `new PrismaClient({ datasourceUrl })` para el runtime.
- `prisma/build-database-url.js` → refactorizado para importarla en vez de
  duplicar la lógica.

### `Backend/.env` (nuevo, no versionado)

Creado a partir de `.env.example` con dos ajustes locales:

- `DB_PORT=5433` — el 5432 de esta máquina lo ocupa otro contenedor Postgres.
  El contenedor de TAEV corre como `taev-db` mapeado a 5433.
- `ALLOWED_ORIGINS` incluye `4321..4324` — Astro cae al siguiente puerto libre
  cuando 4321/4322 están ocupados.
- `TAEV_SUBMIT_RATE_LIMIT_MAX=200` — subido para pruebas manuales.
  **En producción bajar a ~10** (ver HANDOFF §4).

### `Frontend/src/backend/connection.ts` — tipado

Los 4 errores de TS preexistentes resueltos. Ahora exporta:

- `ApiEnvelope<T>`, `request<T>(promise)`, `ApiError` (con `API_message` y
  `API_status`).
- Tipos del portal: `Offering`, `WindowState`, `TaevStatus`, `VerifyCodeResult`,
  `SubmitResult`, `PreferenceInput`.
- `endpoints.taev_status / taev_verifyCode / taev_submit`.

---

## Fase 1 — API pública

Archivos nuevos:

```
Backend/utils/apiError.js                    ApiError(status,message) + isExposable()
Backend/middlewares/rateLimit.middleware.js  taevSubmitLimiter (verify-code + submit)
Backend/services/taev.service.js             getStatus / verifyCode / submitPreferences
Backend/controllers/taev.controller.js       status / verifyCode / submit
Backend/routes/taev.js                       GET /status, POST /verify-code, POST /submit
```

`app.js`: `import taevRouter` + `app.use('/api/taev', taevRouter)` + el error
handler ahora respeta `err.status`/`err.expose` (para los errores que llegan por
`next(err)` desde los guards).

### Decisiones

- **Resolución de campus** (`resolveCampus` en el service): explícito por
  `?campus=` / `body.campus` → se usa; omitido + exactamente un campus con
  semestre `is_current` → ese; omitido + más de uno → `400 CAMPUS_REQUIRED`;
  omitido + ninguno con semestre activo pero un solo campus activo → ese (para
  poder devolver `semester: null`). Nunca adivina por el código del alumno.
- **La ventana sale entera de `resolveSemesterWindow()`** y en `submit` se
  **revalida dentro de `prisma.$transaction`**.
- **`form_submissions` + `submission_preferences` en la misma transacción.** La
  submission se crea con `connect` (no con escalares) porque `semester_id` es un
  escalar compartido por tres relaciones compuestas y Prisma no lo acepta como
  argumento en un create anidado; las preferencias van con `createMany`.
- **`P2002` → `409 ALREADY_SUBMITTED`** en el controller (doble click / dos
  pestañas).
- Mensajes de error `UPPER_SNAKE_CASE`, nunca `err.message` ni `err.stack` al
  cliente. Log con tag `[TAEV]`.

### Contratos (como quedaron)

`GET /api/taev/status?campus=prepa-2` → `{ data: { campus, semester|null,
window, offerings[] } }`. `window` trae además `mode`, `opensInMs`,
`closesInMs` (sale entero de `resolveSemesterWindow`).

`POST /api/taev/verify-code` `{ code, campus? }`:

| Situación | HTTP | message |
|---|---|---|
| ventana cerrada | 403 | el `reason` de la ventana |
| no son 9 dígitos | 400 | `INVALID_CODE_FORMAT` |
| no está en el padrón / inactivo | 404 | `CODE_NOT_FOUND` |
| ya envió | 409 | `ALREADY_SUBMITTED` |
| ok | 200 | `{ studentName\|null, semesterLabel, ranksRequired, offerings[] }` |

`POST /api/taev/submit` `{ code, campus?, preferences: [{semesterSubjectId,
rank}] }` → `201 { data: { semesterLabel, submittedAt, preferences:
[{rank,name}] }, message: "SUBMITTED" }`. Errores `403` (ventana),
`400 INVALID_PREFERENCES`, `404 CODE_NOT_FOUND`, `409 ALREADY_SUBMITTED`,
`429 RATE_LIMITED`.

---

## Fase 2 — Portal público

### `Frontend/src/stores/taevStore.ts` — reescrito

- `TaevScreen` ahora: `loading | closed | code | verifying | error | form |
  summary | done`.
- `rankings: Record<number, number | null>` — `semesterSubjectId → rank`
  (antes era por nombre de asignatura).
- `offerings`, `ranksRequired`, `semesterLabel`, `campusName` vienen de la API.
- `clockOffsetMs = serverTime - Date.now()` calculado en `init()`;
  `serverNow(offset)` para toda cuenta regresiva. **El cliente nunca decide si
  la ventana está abierta.**
- `init()` → `GET /status`; si `!window.isOpen` o `semester === null` →
  pantalla `closed`.
- `handleApiError()` ramifica por `API_status`/`API_message`: `403` →
  pantalla `closed` con el motivo real; `INVALID_PREFERENCES` → toast + vuelve
  al form; resto → pantalla `error`.
- Exporta `errorContent(kind)` (título + cuerpo por `message`) y
  `closedContent(reason)`.
- Selectores `selectedCount / canContinue / summaryList` reescritos sobre la
  nueva forma.
- **Borrado**: `mockVerifyCode`, `NAME_POOL`, el `setTimeout` de
  `confirmSubmit`, `TAEV_CLASSES / RANKS_REQUIRED / SEMESTER_LABEL`.

### Los 7 desajustes de HANDOFF §3

| # | Cómo quedó |
|---|---|
| 1 | `rankings` por `semesterSubjectId`; `offerings` de la API |
| 2 | `PreferencesStep` genera las opciones de rank a partir de `ranksRequired` |
| 3 | Pantallas `LoadingStep` y `ClosedStep` (con cuenta regresiva si `NOT_YET_OPEN`) |
| 4 | `ErrorStep` usa `errorContent(kind)` → título+cuerpo por caso |
| 5 | Offset de reloj contra `serverTime`, `serverNow()` en la cuenta regresiva |
| 6 | Saludo con fallback: `studentName ?? 'Registro de preferencias'` |
| 7 | `DoneStep`: "la coordinación publicará los grupos… guarda una captura" |

### Componentes

Nuevos: `taev/LoadingStep.tsx`, `taev/ClosedStep.tsx` (hook `useCountdown`).
Reescritos: `TaevPortal.tsx` (llama `init()` al montar, mapa de 8 pantallas,
monta `<Toaster/>` de sonner), `StepTags.tsx` (oculta los tags en
`loading`/`closed`), `PreferencesStep.tsx`, `SummaryStep.tsx`, `DoneStep.tsx`,
`ErrorStep.tsx`.

`taev.config.json` reducido a `{ campus, codeLength }` — todo lo demás viene de
la API.

**No tocado**: `Frontend/src/pages/index.astro` sigue con "Prepa 2 UDG"
hardcodeado en `<title>`/`description` (es por-despliegue, no bloquea).

---

## Fase 3 — Auth + Admin

### Backend

```
Backend/middlewares/auth.middleware.js       requireAuth (JWT + re-lee user de la BD), requireRole(...)
Backend/middlewares/campusScope.middleware.js assertCampusAccess(user, campusId), campusWhere(user)
Backend/utils/audit.js                        writeAudit(client, {...})
Backend/services/auth.service.js              login(email, password) → { token, user }
Backend/services/admin.service.js             semestres (create/update/window/current), padrón bulk,
                                              oferta, grupos (capacity_change auditado), overview
Backend/controllers/adminAuth.controller.js   login, me
Backend/controllers/admin.controller.js       resto de handlers admin
Backend/routes/admin.js                       todo /api/admin/* (login sin auth; el resto requireAuth)
```

`app.js`: `app.use('/api/admin', adminRouter)`.

Deps nuevas: `jsonwebtoken`, `bcryptjs`.

**Regla no negociable respetada**: el rol y el `campusId` se **re-leen de la BD
en cada request** (`auth.middleware.js`), nunca del payload del JWT. El token
sólo lleva `sub` (el id).

### Endpoints admin (todos con JWT salvo login)

| Método | Path | Notas |
|---|---|---|
| POST | `/api/admin/auth/login` | rate-limit propio (20/15min) |
| GET | `/api/admin/auth/me` | datos frescos del user |
| GET | `/api/admin/campuses` | scoped: superadmin ve todo, resto su campus |
| GET · POST | `/api/admin/semesters` | list scoped / create (deriva `closesAt` de `durationMinutes`) |
| GET · PATCH | `/api/admin/semesters/:id` | get / update |
| PATCH | `/api/admin/semesters/:id/window` | **kill switch**, audita `semester.window.<mode>` |
| PATCH | `/api/admin/semesters/:id/current` | apaga el `is_current` anterior en la misma tx |
| GET | `/api/admin/semesters/:id/overview` | dashboard: contadores + cupos por asignatura |
| GET · POST | `/api/admin/semesters/:id/students` · `/students/bulk` | list / carga masiva (upsert por `(semesterId,code)`) |
| POST · PATCH | `/api/admin/semesters/:id/subjects[/:offeringId]` | gestión de la oferta |
| POST · PATCH | `/api/admin/semesters/:id/groups[/:groupId]` | grupos; PATCH audita `groups.capacity_change` |
| POST | `/api/admin/semesters/:id/allocate` | dispara el allocator (Fase 4) |
| POST | `/api/admin/semesters/:id/assignments` | coloca a mano un alumno sin asignación |
| PATCH | `/api/admin/assignments/:id` | mueve una asignación existente |
| GET | `/api/admin/audit-log` | scoped por campus (join por semestre) |

Bajar el `capacity` de un grupo por debajo de su ocupación → `409
CAPACITY_BELOW_ASSIGNED` (lo atrapa el CHECK `subject_groups_assigned_count_valid`).

### Admin SPA — núcleo funcional (🟡 parcial)

```
Admin/src/backend/connection.ts   tipado + interceptor que adjunta el JWT (localStorage: taev.admin.token)
Admin/src/stores/authStore.ts     bootstrap / login / logout
Admin/src/stores/semesterStore.ts semestres, overview, setWindow, allocate
Admin/src/App.tsx                  guard: sin sesión → LoginPage; con sesión → shell + react-router
Admin/src/pages/LoginPage.tsx      formulario de login
Admin/src/pages/DashboardPage.tsx  overview + kill switch + botón "Ejecutar asignación"
Admin/src/pages/AuditPage.tsx      tabla de la bitácora
Admin/src/components/layout/Sidebar.tsx  nav + logout + nombre/rol del user
```

Borrado: `Admin/src/pages/UsersPage.tsx` (scaffold sin uso).
Los `.tsx` del scaffold usaban `class=` (JSX inválido); convertidos a
`className=` / `htmlFor=`.

**Construido**: login, dashboard (contadores, oferta/cupos, kill switch,
asignación), bitácora.
**NO construido (la API existe y está probada)**: alta/edición de semestre,
carga de padrón CSV, editores de oferta y grupos, UI para mover asignaciones a
mano, gestión de usuarios.

---

## Fase 4 — Allocator

`Backend/services/allocation.service.js` (nuevo), implementación de
`DATABASE.md §7.3`:

- `runAllocation(user, semesterId, ip)` — advisory lock transaccional por
  semestre (`pg_advisory_xact_lock(key, semesterId)`), toma
  `status IN ('pending','unplaced')` en orden `submittedAt ASC, id ASC`,
  reparte **en memoria** (rank 1→N, lleno no abandona), `createMany` de
  `group_assignments`, actualiza `status`, **recalcula `assigned_count` desde
  `COUNT(*)` real** (si viola el CHECK, aborta toda la tx), escribe
  `allocation.run` en `audit_log`.
- `overrideAssignment(user, assignmentId, targetGroupId, notes, ip)` — mismo
  advisory lock, valida que el grupo destino sea del mismo semestre, activo y
  con lugar; `is_manual_override = true`, `assigned_by_id = user.id`; si el
  alumno estaba `unplaced` pasa a `allocated` en la misma tx; recalcula
  `assigned_count`; audita `assignment.override`.
- `placeSubmission(user, submissionId, targetGroupId, notes, ip)` — coloca a
  mano un alumno sin asignación (extiende la superficie documentada, que sólo
  contemplaba mover una existente).

Verificado con curl: 3 grupos de Robótica con cupo 1 → primeros 3 alumnos a
Robótica A/B/C (rank 1), 4º alumno cae a Ética (rank 2), 0 `unplaced`;
re-corrida devuelve `placed: 0`; override a grupo lleno → `409 GROUP_FULL`.

---

## Fase 5 — Capa `models/` y módulos esenciales del panel

### 5.1 Por qué se refactorizó

Los controllers escribían sus propias queries (`prisma.semester.findMany(...)`
dentro del handler HTTP). Funcionaba, pero deja la forma de cada consulta —
columnas expuestas, `where`, `orderBy`, índice que va a usar — desparramada por
los handlers, donde nadie la encuentra cuando hay que cambiarla o auditarla.

Se introdujo **`Backend/models/`** como única capa que habla con Prisma:

```
routes/       →  qué URL existe y qué guards corre
controllers/  →  sanitiza el input (utils/queryParams.js), arma el envelope
services/     →  decide: autoriza por campus, valida el dominio, transacciona, audita
models/       →  la query
```

Reglas (detalle en `Backend/models/README.md`):

- Ningún controller ni service importa `prisma`. Para transaccionar, el service
  usa `transaction()` de `config/db.js` y le pasa el `tx` a los modelos —
  **todas** las funciones de modelo aceptan `client = prisma` como último
  parámetro.
- Los modelos reciben **filtros de dominio**, no fragmentos de `where`:
  `listScoped(campusId)` con `null` = toda la red, en vez de que el llamador
  arme el objeto. Por eso `campusWhere()` se reemplazó por `scopeCampusId()`.
- Los modelos **no autorizan**: devuelven filas o `null`. Quien decide si es un
  404 o un 403 es el service, que es el que conoce al usuario.
- El SQL crudo (advisory lock y recálculo de `assigned_count`) se movió de
  `allocation.service.js` a `models/group.model.js`.
- `utils/audit.js` se eliminó: es `models/audit.model.js` (`write(entry, client)`).

Nueve modelos: `campus`, `user`, `semester`, `student`, `subject`, `offering`,
`group`, `submission`, `assignment`, `audit`.

### 5.2 Endpoints nuevos

Padrón individual (`POST`/`PATCH`/`DELETE` de `semesters/:id/students`),
catálogo de asignaturas (`GET`/`POST`/`PATCH` de `subjects`, más
`subjects/options`), y `GET semesters/:id/subjects` para la oferta con sus
grupos. Tabla completa en [`DATABASE.md` §8](./DATABASE.md).

Los listados que consume una tabla del panel (padrón, catálogo, bitácora) son
**paginados server-side** con la misma forma:

```jsonc
{ "data": { "rows": [...], "total": 1234, "page": 1, "pageSize": 25 } }
```

`page`, `pageSize`, `search`, `sort` y los filtros booleanos los sanitiza
`utils/queryParams.js`: fuera de rango cae al default en vez de tirar error, y
`sort` sólo acepta las columnas que el endpoint declara.

Detalle de dominio: la **baja del padrón** es un borrado real sólo si el alumno
no envió; si ya envió, se desactiva. Borrarlo arrastraría su `form_submission`
en cascada y con ella el orden de llegada del resto.

### 5.3 Admin SPA — lo construido

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Dashboard | `/` | ventana + kill switch, contadores, cupos, disparar asignación |
| Semestres | `/semestres` | crear/editar el evento (apertura + duración + preferencias), marcar el activo, elegir el semestre en contexto |
| Padrón | `/padron` | registro de códigos: alta, edición, baja, búsqueda, filtros por estado y por "ya envió", paginación |
| Asignaturas | `/asignaturas` | catálogo maestro: alta, edición, archivar |
| Oferta y grupos | `/oferta` | qué ofrece el semestre y con cuánto cupo; alta de grupos, cambio de cupo, activar/desactivar |
| Bitácora | `/bitacora` | paginada, con búsqueda y filtro por entidad |
| Ajustes | `/ajustes` | sesión, semestre en contexto, módulos pendientes |

Piezas transversales:

- **`components/ui/DataTable.tsx`** — una sola tabla para todo el panel:
  búsqueda con debounce, filtros, headers ordenables, paginación server-side y
  colapso a tarjetas abajo de `md`. No filtra ni ordena en el cliente: el que
  sabe hacerlo con miles de filas es PostgreSQL.
- **`hooks/useTableQuery.ts`** — estado de la tabla. Cambiar búsqueda, orden o
  tamaño siempre vuelve a la página 1 (si no, se busca algo y la tabla sale
  vacía porque quedó parada en la página 7).
- Primitivos `Button`, `Badge`, `Modal`, `ConfirmDialog`, `formStyles`, y
  tokens semánticos nuevos en `global.css` (`--color-danger`, `--color-success`,
  `--color-warning`, `--color-ink-subtle`).
- El **semestre en contexto** vive en el store y se persiste en localStorage: se
  elige una vez en el chrome y lo usan todas las pantallas.
- Los roles `viewer` no ven ninguna acción de escritura (`canWrite`).

El **sidebar muestra el mapa completo**, con los módulos pendientes visibles
pero apagados (`pronto`): importar CSV, envíos, asignaciones, reportes,
usuarios. Sus rutas no están registradas — entrar por URL cae en el 404.

### 5.4 Inventario de archivos

**Backend — nuevos**

```
models/README.md            las convenciones de la capa
models/campus.model.js      models/user.model.js       models/semester.model.js
models/student.model.js     models/subject.model.js    models/offering.model.js
models/group.model.js       models/submission.model.js models/assignment.model.js
models/audit.model.js
utils/queryParams.js        parsePagination · parseSearch · parseSort ·
                            parseOptionalBool · parseEnum · parseId
```

**Backend — reescritos**

| Archivo | Qué cambió |
|---|---|
| `controllers/admin.controller.js` | sin `prisma`; sanitiza y delega. Endpoints nuevos de padrón, catálogo y oferta |
| `services/admin.service.js` | sin `prisma`; usa `transaction()` + modelos. Suma `createStudent`, `updateStudent`, `deleteStudent`, `listStudents`, el catálogo y `listAuditLog` |
| `services/allocation.service.js` | sin `prisma`; el SQL crudo se fue a `group.model.js`. Se extrajo `assertTargetUsable()` (la revalidación del grupo destino estaba duplicada en dos funciones) |
| `services/taev.service.js` | sin `prisma`; el portal público usa los mismos modelos |
| `services/auth.service.js` | usa `user.model.js` |
| `middlewares/auth.middleware.js` | usa `user.model.js` |
| `middlewares/campusScope.middleware.js` | `campusWhere()` → `scopeCampusId()` + `isGlobalScope()` |
| `config/db.js` | suma `transaction(fn)` para que los services no importen `prisma` |
| `routes/admin.js` | rutas nuevas de subjects, students y offerings |

**Backend — eliminado**: `utils/audit.js` (ahora `models/audit.model.js`).

**Admin — nuevos**

```
components/ui/       DataTable.tsx · Modal.tsx · ConfirmDialog.tsx · Button.tsx
                     Badge.tsx · PageHeader.tsx (+ Card) · formStyles.ts
components/forms/    StudentFormModal.tsx · SubjectFormModal.tsx · SemesterFormModal.tsx
components/layout/   AppLayout.tsx · SemesterSwitcher.tsx
hooks/               useTableQuery.ts · useDebouncedValue.ts
lib/                 cn.ts · dates.ts
pages/               SemestersPage.tsx · StudentsPage.tsx · SubjectsPage.tsx
                     OfferingsPage.tsx
```

**Admin — reescritos**: `App.tsx` (rutas en español), `backend/connection.ts`
(toda la superficie tipada + `errorMessage()` que traduce las sentencias
`UPPER_SNAKE_CASE` en un solo lugar), `stores/semesterStore.ts` (semestre
persistido), `stores/authStore.ts` (+`canWrite`), `components/layout/Sidebar.tsx`,
`pages/DashboardPage.tsx`, `pages/AuditPage.tsx`, `pages/SettingsPage.tsx`,
`pages/LoginPage.tsx`, `styles/global.css` (tokens de estado).

**Docs**: `Backend/models/README.md`, `Docs/ROADMAP.md`, y actualizaciones en
`CLAUDE.md`, `AGENTS.md`, `.agents/skills/backend/SKILL.md`, `DATABASE.md` §8,
`HANDOFF.md` §1.

---

## Verificación ejecutada

- `cd Backend && npm test` → **19/19**.
- `verify_constraints.sql` contra base desechable → **27/27 OK**.
- `cd Frontend && npm run build` (astro check + build) → **0 errores, 0 warnings**.
- `cd Admin && npm run build` → **0 errores** (warnings benignos: Astro avisa
  que hay `.tsx` en `src/pages/`, que es la convención del scaffold para el SPA).
- curl de los 3 endpoints públicos + todos sus caminos de error.
- curl de login, `/me`, sin token (401), semesters, campuses, overview,
  window (y su reflejo en `/api/taev/status`), audit-log, bulk students,
  oferta, grupos.
- curl del allocator: fallthrough de rank, idempotencia, override, `GROUP_FULL`.

Tras las pruebas se limpiaron todos los datos de prueba y se restauró el seed
(semestre `2026A` abierto, 30 alumnos, cupos en 10).

---

### Verificación de la Fase 5

- `cd Backend && npm test` → **19/19** (la ventana no cambió).
- curl contra la base de demo: padrón paginado con búsqueda y filtros, alta,
  edición, baja, código inválido (`INVALID_CODE_FORMAT`), duplicado
  (`CODE_ALREADY_IN_ROSTER`), catálogo, `subjects/options`, ofertar, crear
  grupo, desactivar oferta, overview, bitácora paginada.
- Portal público tras el refactor: `/api/taev/status` y `verify-code` (camino
  feliz y `CODE_NOT_FOUND`).
- `cd Admin && npm run build` → **0 errores** de `astro check`.
- Se borraron las filas de prueba y sus entradas de bitácora.

> ⚠️ La contraseña del usuario `admin@prepa2.local` en la base local **no es**
> la del seed (`taev-demo-2026`): alguien la cambió. Para las pruebas se firmó
> un JWT local con el `JWT_SECRET` del `.env` en vez de tocar el hash.

---

## Pendientes

1. **Prueba de navegador** de los dos frontends (flujo completo del alumno;
   login + kill switch + asignación en el admin).
2. **Admin SPA**: los módulos que quedaron apagados en el sidebar — importar
   padrón por CSV, asignaciones (mover de grupo / colocar a mano), reportes,
   usuarios. (Envíos ✅ — ver Fase 7.1 más abajo.)
3. `TAEV_SUBMIT_RATE_LIMIT_MAX` → bajar a ~10 para producción.
4. `Frontend/src/pages/index.astro` — sacar "Prepa 2 UDG" hardcodeado a config
   o a la API si se despliega multi-campus.
5. `npm audit` en Backend reporta 3 vulnerabilidades **preexistentes** en la
   cadena de `prisma` (devDependency) — no se tocaron.
6. Tests automatizados de los endpoints (hoy sólo `semesterWindow` tiene tests;
   la verificación de la API fue manual con curl).

---

## Cómo levantar todo

```bash
# Postgres local (ya corriendo como taev-db en :5433)
docker start taev-db   # si estaba apagado

cd Backend && npm run dev      # :4000
cd Frontend && npm run dev     # :4321 (o siguiente libre)
cd Admin && npm run dev        # :4322

# Credenciales admin de demo (del seed):
#   admin@prepa2.local / taev-demo-2026
# Códigos de alumno de prueba: 218327451 … 218327480
```

---

## Ajustes posteriores — 2026-08-28 (Frontend, fuera de las fases 0→5)

Dos retoques puntuales de UI en el portal público, pedidos por separado y sin
relación con el cableado de API de las fases anteriores.

### 1. Eliminado el motivo "blueprint" (cruces de esquina)

`Card` y los `Button` con la prop `corners` dibujaban 4 marcas en forma de cruz
en las esquinas (componente `Corners`, clase `.blueprint`), pensadas como
identidad visual del portal. Se pidió quitarlas.

Archivos tocados:

```
Frontend/src/components/ui/Corners.tsx        borrado
Frontend/src/components/ui/Card.tsx           quitado <Corners /> y la clase blueprint
Frontend/src/components/ui/Button.tsx         quitada la prop `corners`, su lógica y <Corners />
Frontend/src/components/taev/CodeStep.tsx     quitado corners del <Button>
Frontend/src/components/taev/ErrorStep.tsx    quitado corners del <Button>
Frontend/src/components/taev/ClosedStep.tsx   quitado corners del <Button>
Frontend/src/components/taev/SummaryStep.tsx  quitado corners del <Button>
Frontend/src/components/taev/PreferencesStep.tsx  quitado corners del <Button>
Frontend/src/styles/global.css                borradas las reglas .blueprint / .corner
```

Verificación: `npx astro check` → 0 errores, 0 warnings. `grep -rn "blueprint\|Corners"`
sobre `Frontend/src` y `Admin/src` no devuelve nada.

### 2. `PreferencesStep` — ancho fijo del select + salto de línea en nombres largos

Antes, el `<select>` de rango (`Sin preferencia` / `1 · Más preferida` / …) no
tenía ancho fijo: se ajustaba al texto de la opción elegida, así que cada fila
tenía un select de ancho distinto. Se pidió: ancho fijo para todos los
selects, y que el nombre de la asignatura ocupe el espacio restante haciendo
salto de línea si no cabe — con **todas las filas a la misma altura**, igual
a la del texto más largo que llegó a partirse.

Cambios en `Frontend/src/components/taev/PreferencesStep.tsx`:

- El `<select>` ahora tiene ancho fijo de 224px vía `style={{ width: SELECT_WIDTH }}`
  + `shrink-0`, en vez de una clase Tailwind de ancho.
  **Por qué `style` inline y no una clase `w-56`:** `selectClass` (compartido
  con los inputs) trae `w-full`. Al probarlo con Playwright, `w-56` **no** le
  ganaba en cascada a `w-full` — el select se estiraba al 100 % del ancho de
  la fila y el nombre de la asignatura quedaba en 0px (de ahí un salto de
  línea letra por letra). El orden de las utilidades de ancho que genera
  Tailwind v4 no es fiable para pisar `w-full` con una clase numérica; un
  `style` inline sí gana siempre, sin depender de ese orden. Si se vuelve a
  tocar el ancho del select, mantenerlo por `style`, no por clase.
- El nombre de la asignatura es `flex-1 min-w-0 break-words`: ocupa el resto
  del ancho de la fila y hace salto de línea en vez de desbordar.
- Un `useLayoutEffect` mide, vía refs, la altura natural de cada `<span>` de
  nombre (nunca se ve afectada por la altura forzada de la fila, así que la
  medición es estable), toma la más alta, le suma el padding vertical de la
  fila y aplica ese valor como `minHeight` a todas las filas. Se vuelve a
  medir en `resize`.

Verificación: `npx astro check` → 0 errores. Se instaló Playwright de forma
temporal (fuera del repo, en `~/.claude/jobs/.../tmp/pw`, no quedó como
dependencia) para levantar `npm run dev` y correr un script headless con
`/api/taev/status` y `/api/taev/verify-code` mockeados (7 asignaturas,
incluida una con nombre muy largo). Resultado, en 480px (mobile) y 900px
(desktop):
- Los 7 `<select>` miden exactamente 224px, **incluso** tras elegir la opción
  más larga (`"7 · Menos preferida"`).
- El nombre largo hace salto de línea (hasta 3 líneas en el caso extremo
  probado).
- Todas las filas quedan a la misma altura, igual a la de la fila más alta.
- Sin errores de consola del navegador.

---

## Ajustes posteriores — 2026-08-28 (Admin: página Semestres + padrón)

Pedidos en una sesión de soporte que arrancó con un semestre recién creado
(`2026-MATUTINO`) que "no abría" para los alumnos. El diagnóstico y los cambios
que salieron de ahí.

### 0. Diagnóstico — por qué `2026-MATUTINO` no abría (sin cambios de código)

Se revisó la BD local (`taev-db`, puerto 5433) y `utils/semesterWindow.js`.
Causas encontradas, en orden:

1. **El semestre nunca se marcó como actual** (`is_current = false`). El portal
   público sólo mira el semestre con `is_current = true` del campus
   (`semesterModel.findCurrentByCampus`); ese seguía siendo `2026A` (el del
   seed). El badge "programado" que muestra la tabla es el `window_mode`, no
   tiene relación con ser el semestre activo.
2. La ventana programada (11:39–11:54 hora de México) estaba por cerrar.
3. `ranks_required = 6` con sólo 2 asignaturas ofertadas: `assertPreferencesShape`
   exige exactamente 6 preferencias distintas, así que el envío siempre
   fallaría. **Sigue pendiente** — es decisión del admin bajar el número o
   ampliar la oferta.
4. El padrón de ese semestre tiene 1 alumno.

No se tocó la BD: la prueba del endpoint nuevo (abajo) se hizo y se revirtió.

### 1. `STATUS_LABEL.pending`: "pendiente" → "enviado"

`Admin/src/pages/StudentsPage.tsx`. En la tabla del padrón, la columna **Envío**
mostraba "pendiente" para un envío en estado `pending`. Se cambió a **"enviado"**
para que se lea directo que el alumno ya mandó el formulario (el allocator
todavía no lo procesó, pero eso es detalle interno). El badge sigue en tono
ámbar. Único lugar donde vivía la etiqueta; el enum de la BD no cambia.

### 2. Endpoint nuevo — "cerrar la plataforma" (quitar el semestre activo)

Antes sólo se podía *cambiar* de semestre activo (`PATCH …/current`), nunca
dejar el campus sin ninguno. Se agregó `DELETE /api/admin/semesters/:id/current`.

```
Backend/routes/admin.js            + router.delete('/semesters/:id/current', writer, c.clearCurrent)
Backend/controllers/admin.controller.js  + clearCurrent  → envelope { data, message: 'SEMESTER_CLEAR_CURRENT' }
Backend/services/admin.service.js  + clearCurrentSemester(user, semesterId, ip)
```

`clearCurrentSemester`: `loadSemesterScoped` (alcance por campus) → si el
semestre no es el activo, `409 SEMESTER_NOT_CURRENT` → transacción:
`semesterModel.updateById(id, { isCurrent: false })` + `auditModel.write`
con acción `semester.clear_current`.

**Por qué es distinto del kill switch:** `force_closed` cierra pero el semestre
sigue a la vista y el portal dice "cerrado por la coordinación". Sin semestre
activo, `resolveSemesterWindow(null)` devuelve `NO_ACTIVE_SEMESTER` y el portal
dice "el registro no está disponible". El índice único parcial
`semesters_single_current_per_campus` ya permitía cero filas con
`is_current = true`; no hizo falta tocar el esquema.

Los envíos ya registrados no se tocan (sólo se apaga el flag del semestre).

### 3. `Admin/src/pages/SemestersPage.tsx` — KPIs, botón y columna

**a. Franja "Portal de alumnos" (estado en vivo).** Card de una línea arriba de
la tabla: badge ABIERTO / CERRADO / AÚN NO ABRE / YA CERRÓ + una frase de
detalle. Helper local `portalState(activeSemester, now)` que replica la
**misma precedencia** que `resolveSemesterWindow` del backend
(`force_closed` → `force_open` → horario `[opensAt, closesAt)`). Usa el reloj
del navegador y un `setInterval` de 30 s; el estado autoritativo con hora de
servidor sigue siendo el del Dashboard.

**b. Leyenda plegable "Qué hace cada acción y cómo afecta al portal".** Un
`<details>` cerrado por defecto (para no acaparar el layout) con una lista
compacta: cada acción del panel — **Seleccionar**, **Editar**, **Activar**,
**Cerrar plataforma** — con qué hace y su efecto concreto en el portal del
alumno (coloreado por severidad). Pie que aclara que abrir/cerrar la ventana
en vivo sin cambiar de semestre es el kill switch del Dashboard.

**c. Botón "Cerrar plataforma".** En el header (visible sólo si hay semestre
activo), en la fila del semestre activo y en la card móvil. Abre un
`ConfirmDialog` que nombra el semestre y avisa que ningún alumno podrá entrar
hasta reactivar uno. Llama a la acción nueva del store `clearCurrent(id)`.

```
Admin/src/backend/connection.ts   + endpoints.semester_clearCurrent(id)  (DELETE)
                                  + MESSAGES.SEMESTER_NOT_CURRENT
Admin/src/stores/semesterStore.ts + clearCurrent(id): DELETE, toast, recarga semestres + overview
```

**d. Columna "Ventana" → "Horario de la ventana".** Antes mostraba sólo la
hora de apertura + la duración en minutos. Ahora muestra `Abre <fecha/hora>` /
`Cierra <fecha/hora>` / `<N> min` — la hora exacta de cierre pedida. Igual en
la card móvil (`Abre …` / `Cierra … · N min`).

**e. Renombre del botón de contexto.** "Trabajar acá" / "En contexto" →
**"Seleccionar" / "Seleccionado"**. La etiqueta anterior no decía qué hacía la
acción (poner el semestre en foco para Padrón / Oferta / Asignación).

### Verificación

- `Backend/`: `node --check` de los 3 archivos, `npm test` 19/19.
- Endpoint curl end-to-end (JWT firmado con el `JWT_SECRET` local):
  `DELETE …/1/current` → 200 y `GET /api/taev/status` pasa a
  `semester: null`, `window.reason: NO_ACTIVE_SEMESTER`; segundo `DELETE` →
  `409 SEMESTER_NOT_CURRENT`. Estado de la BD restaurado (`2026A` vuelve a
  `is_current = true`).
- `Admin/`: `tsc --noEmit` limpio, `npm run build` (astro) 0 errores.
- `graphify update .` corrido tras cada tanda de cambios.
- **Sin prueba de navegador** en esta pasada.

---

## Ajustes posteriores — 2026-08-28 (Admin: terminología de la UI)

Cambios sólo de texto visible en el panel (`localhost:4322`). Sin tocar
endpoints, esquema ni la lógica de la ventana. Los valores machine-readable
del backend (`WINDOW_REASON`, `windowMode`, rutas) quedan intactos: sólo
cambió cómo se muestran.

### 1. "Padrón" → "Estudiantes" en todo el texto visible

La palabra "Padrón" no le decía nada a la coordinación. Se reemplazó por
"Estudiantes" en cada string que ve el admin; los comentarios de código y la
ruta URL `/padron` se dejaron igual (cambiar la ruta rompería enlaces
guardados y no aporta).

```
Admin/src/components/layout/Sidebar.tsx        ítem de menú  "Padrón" → "Estudiantes"
Admin/src/pages/StudentsPage.tsx               título de página, subtítulo del estado
                                               vacío, toasts de alta/baja, título y
                                               cuerpo del ConfirmDialog de quitar
Admin/src/pages/DashboardPage.tsx              KPI "Padrón" → "Estudiantes"
Admin/src/components/forms/StudentFormModal.tsx  "Agregar alumno al padrón" → "Agregar estudiante"
Admin/src/pages/SemestersPage.tsx              3 textos descriptivos (leyenda de acciones,
                                               efecto de "Activar", subtítulo de la página)
Admin/src/pages/SettingsPage.tsx               pendiente "Importar padrón por CSV" → "…estudiantes…"
Admin/src/backend/connection.ts                MESSAGES.CODE_ALREADY_IN_ROSTER
```

### 2. Dashboard — KPI "Pendientes" → "Sin asignar"

`DashboardPage.tsx`, fila de contadores. Sigue mostrando `counts.pending`;
sólo cambió la etiqueta.

### 3. Dashboard — el motivo de la ventana ahora es una etiqueta legible

La franja "Ventana de envío" mostraba el código crudo:
`motivo OPEN_SCHEDULED` dentro de un `<code>`. Ahora muestra
`motivo Abierto por horario`.

```
Admin/src/backend/connection.ts   + type WindowReason (unión de los 6 valores,
                                    igual que en Frontend/src/backend/connection.ts)
                                    WindowState.reason: string → WindowReason
Admin/src/pages/DashboardPage.tsx  + WINDOW_REASON_LABEL: Record<WindowReason, string>
                                    render: <code>{win.reason}</code> → {WINDOW_REASON_LABEL[win.reason]}
```

| `reason` (backend, sin cambios) | etiqueta mostrada |
|---|---|
| `OPEN_SCHEDULED` | Abierto por horario |
| `FORCED_OPEN` | Abierto forzadamente |
| `FORCED_CLOSED` | Cerrado forzadamente |
| `CLOSED_SCHEDULED` | Cerrado por horario |
| `NOT_YET_OPEN` | Aún no abre |
| `NO_ACTIVE_SEMESTER` | Sin semestre activo |

### Verificación

- `Admin/`: `tsc --noEmit` limpio tras cada tanda.
- **Sin prueba de navegador.**

---

## Fase 7.1 — Módulo "Envíos" (pantalla en vivo) + sidebar colapsable — 2026-08-28

Sesión de una pasada. Dos entregables independientes:

1. **Módulo "Envíos"** — listado de formularios recibidos, pensado para
   **proyectarse durante la ventana**. Sólo lectura; mover asignaciones sigue
   pendiente (Fase 7.2).
2. **Sidebar colapsable en escritorio** — retoque de layout, sin relación con
   lo anterior.

### Backend

| Archivo | Cambio |
|---|---|
| `models/submission.model.js` | `listPaginated({ semesterId, status?, search?, skip, take })` — orden `submitted_at DESC, id DESC` (inverso al allocator: el último en llegar arriba), mismo índice `(semester_id, submitted_at, id)`. Devuelve `{ rows, total }` con `code`, `fullName`, `submittedAt`, `status`, `preferences[{rank,name}]` y `assignment` embebidos. `search` filtra por `student.code` / `student.fullName` |
| `services/admin.service.js` | `listSubmissions(user, semesterId, filters)` — `loadSemesterScoped` (alcance por campus) y delega al modelo |
| `controllers/admin.controller.js` | `listSubmissions` — sanitiza con `parsePagination` / `parseSearch` / `parseEnum(status, ['pending','allocated','unplaced'])` |
| `routes/admin.js` | `GET /api/admin/semesters/:id/submissions` (sin `writer`: un `viewer` puede leer) |

Los KPIs (padrón / enviaron / faltan) y la ventana con `serverTime` salen de
`GET /semesters/:id/overview`, que ya existía — no se agregó endpoint para eso.

### Admin SPA

- `pages/SubmissionsPage.tsx` (nuevo), ruta `/envios` registrada en `App.tsx`,
  ítem del sidebar activado, quitado de los pendientes de `SettingsPage`.
- `backend/connection.ts`: `SubmissionRow`, `SubmissionPreferenceView`,
  `endpoints.submissions_list`.
- **Switch "En vivo"**: encendido → auto-refresco de tabla + overview cada 30 s,
  **sólo con la pestaña visible** (`document.hidden` corta el tick; al volver a
  la pestaña refresca). Arranca encendido si la ventana ya está abierta al
  entrar.
- **Cuenta regresiva** con hora de servidor: `serverOffset = serverTime −
  Date.now()` se recalcula en cada `overview`; un ticker de 1 s sólo mueve el
  display. Colorea ámbar ≤5 min, rojo ≤1 min. Apagado el switch, se congela en
  "Terminado".
- **Tabla sin encabezados, paginada** (15/pág.), `código · nombre · 1ª
  preferencia`. La fila nueva entra con `.taev-row-in` (keyframe en
  `global.css`, respeta `prefers-reduced-motion`); durante el fetch la lista se
  atenúa en vez de vaciarse.
- **Modo en vivo = vista de proyección**: oculta el encabezado
  ("Envíos en vivo / código") y el botón *Actualizar*, muestra un **QR al portal
  del alumno** (`qrcode.react`, `PUBLIC_PORTAL_URL`, default
  `http://localhost:4321`). La tabla tiene **alto fijo** (`calc(100dvh-13rem)`,
  `lg:14rem`) para cubrir el viewport, y el switch para salir queda debajo con
  `mt-[45vh]` — sólo se llega haciendo scroll, así la proyección no muestra el
  interruptor. Apagado, aparece la barra de búsqueda (submit con Enter).
- Dep nueva en `Admin/`: `qrcode.react` (^4.2.0, sin deps propias).
  Var nueva: `PUBLIC_PORTAL_URL` en `.env` / `.env.example`.

### Sidebar colapsable (escritorio)

`components/layout/AppLayout.tsx`: la hamburguesa de la barra superior, que
antes era sólo móvil (`lg:hidden`), ahora tiene una gemela `hidden lg:inline-flex`
que **oculta/muestra el sidebar en escritorio**. Con el sidebar oculto el
contenido toma todo el ancho (el área ya era `flex-1 min-w-0`, no hizo falta
tocarla) y aparece el título "TAEV · Panel" en la barra. La preferencia se
persiste en `localStorage` (`taev.admin.sidebar-collapsed`), envuelta en
try/catch. Iconos `PanelLeftClose` / `PanelLeftOpen` de lucide. En móvil el
mismo botón sigue abriendo el cajón.

### Inventario de archivos

**Backend — reescritos** (sólo se agregó, nada se quitó):

```
models/submission.model.js       + listPaginated / buildLiveWhere / shapeLiveRow / LIVE_ROW_SELECT
services/admin.service.js         + listSubmissions   (sección "── Envíos ──")
controllers/admin.controller.js   + listSubmissions + SUBMISSION_STATUSES
routes/admin.js                   + GET /semesters/:id/submissions
```

**Admin — nuevos**

```
src/pages/SubmissionsPage.tsx     la pantalla completa (modo en vivo / modo revisión)
```

**Admin — reescritos**

```
src/App.tsx                       + import y <Route path="/envios">
src/components/layout/Sidebar.tsx  ítem "Envíos": se quitó `disabled: true`
src/components/layout/AppLayout.tsx  sidebar colapsable en escritorio + persistencia
src/pages/SettingsPage.tsx        se quitó "Envíos" de PENDING
src/backend/connection.ts         + SubmissionRow, SubmissionPreferenceView, endpoints.submissions_list
src/styles/global.css             + @keyframes taev-row-in (+ guarda prefers-reduced-motion)
.env / .env.example               + PUBLIC_PORTAL_URL
package.json                      + qrcode.react ^4.2.0
```

**Docs actualizados**

```
Docs/IMPLEMENTATION-LOG.md   esta sección
Docs/ROADMAP.md              Fase 7.1 marcada ✅; tabla de estado de la Fase 5
Docs/HANDOFF.md §1           fila "Panel Admin (SPA)"
Docs/DATABASE.md §8          fila del endpoint nuevo
CLAUDE.md                    fila "Admin (SPA)" de la tabla de estado
```

### Verificación

- `Backend/`: `node --check` de los 4 archivos, `npm test` 19/19. Endpoint por
  curl (JWT local firmado con el `JWT_SECRET` del `.env`): orden inverso
  correcto (`id 10→9→8`), `search=2183` filtra, `status=bogus` se ignora,
  envelope `{ rows, total, page, pageSize }`.
- `Admin/`: `tsc --noEmit` limpio, `npm run build` (astro check + build) 0
  errores.
- `graphify update .` corrido.
- **Sin prueba de navegador.**

---

## Fase 7.2 — Módulo "Asignaciones" (colocar y mover a mano) — 2026-08-28

Cierra la Fase 7 del ROADMAP. El backend del allocator y de los overrides ya
existía desde la Fase 4; lo que faltaba era la pantalla donde el coordinador
opera el *después* de la corrida. En el camino apareció un bug que hacía que
esa operación fuera imposible.

### El bug que bloqueaba la feature

`overrideAssignment` y `placeSubmission` guardaban `assignedRank:
matchingPref?.rank ?? 0`. El `?? 0` se dispara exactamente en el caso central
de esta pantalla —colocar a un `unplaced` en una asignatura que **no** pidió,
porque todas las suyas estaban llenas— y `0` viola el CHECK
`group_assignments_rank_positive (assigned_rank >= 1)`: la transacción entera
abortaba y el admin recibía un `500 INTERNAL_ERROR` sin explicación.

No había arreglo sin tocar el esquema (`0` viola el CHECK, `NULL` violaba el
`NOT NULL`), y la alternativa —prohibir colocar fuera de preferencia— contradice
`TAEV-DOMAIN.md §8`, que define esa capacidad como la herramienta del
coordinador para los que quedaron fuera.

**Migración `20260828224217_assigned_rank_nullable_for_overrides`** (aditiva, no
destructiva: nunca falla sobre filas existentes):

```sql
ALTER TABLE "group_assignments" ALTER COLUMN "assigned_rank" DROP NOT NULL;
ALTER TABLE "group_assignments" DROP CONSTRAINT "group_assignments_rank_positive";
ALTER TABLE "group_assignments"
  ADD CONSTRAINT "group_assignments_rank_positive"
  CHECK ("assigned_rank" IS NULL OR "assigned_rank" >= 1);
```

`NULL` ⇒ "colocado fuera de sus preferencias". El `0` sigue prohibido: era un
valor mágico, no un dato. El CHECK se copió también a
`Database/schemas/002_constraints.sql`, como manda `CLAUDE.md`.

### Decisiones

- **El motivo de fallo (`llena` / `inactiva`) se computa en el cliente**, no en
  un endpoint nuevo. El allocator no lo guarda —sólo deja `unplaced`—, así que
  igual habría que derivarlo; y derivarlo del estado *actual* de la oferta es
  más útil que del estado al momento de la corrida: si alguien liberó un
  asiento, el badge dice `con lugar ahora` y el admin lo coloca en su
  preferencia. El único cambio de backend fue agregar `semesterSubjectId` a
  cada preferencia del payload (una columna que la fila ya traía).
- **La nota es obligatoria en el service, no sólo en el modal.** Endurece un
  contrato ya curl-verificado (`400 NOTE_REQUIRED`), pero la bitácora sin el
  motivo no sirve para auditar, y un cliente futuro o un `curl` se saltearían
  la validación del formulario.
- **El selector esconde los grupos llenos e inactivos.** El backend igual los
  rechaza, pero `GROUP_FULL` no debería ser el flujo normal: si el admin puede
  elegir un grupo, el sistema le mintió sobre lo que había.
- **Las preferencias del alumno van primero en el selector.** Colocarlo fuera
  de lo que pidió es legítimo, pero es la excepción; el orden de la lista es la
  recomendación implícita de la pantalla.
- **Los tests no hacen `TRUNCATE`.** El harness crea un campus desechable por
  test y lo borra: se pueden correr contra la base de desarrollo sin perder el
  semestre demo de la otra ventana.

### Archivos

**Backend**

```
prisma/schema.prisma                          assignedRank Int? (+ comentario)
prisma/migrations/20260828224217_.../         DROP NOT NULL + CHECK relajado a mano
services/allocation.service.js                + assertNote(); ?? null en override y place
models/submission.model.js                    + filtros groupId/semesterSubjectId;
                                              + preferences[].semesterSubjectId
                                              + assignment.id/groupId/semesterSubjectId
controllers/admin.controller.js               listSubmissions sanitiza los dos filtros (parseId)
test/helpers/fixture.js                       NUEVO — fixture aislado por campus, sin TRUNCATE
services/allocation.service.test.js           NUEVO — 15 tests contra PostgreSQL real
```

`services/admin.service.js` no cambió: `listSubmissions` ya pasaba los filtros
de largo al modelo.

**Admin**

```
src/pages/AssignmentsPage.tsx                 NUEVO — ruta /asignaciones
src/components/forms/PlaceAssignmentModal.tsx NUEVO — colocar y mover
src/lib/assignmentReason.ts                   NUEVO — llena / inactiva / con lugar ahora
src/App.tsx                                   + import y <Route path="/asignaciones">
src/components/layout/Sidebar.tsx             ítem "Asignaciones": se quitó `disabled: true`
src/backend/connection.ts                     + SubmissionAssignmentView, SubmissionQuery,
                                              AssignmentMutationResult, assignment_move,
                                              assignment_place, 5 MESSAGES nuevos
```

**Docs**

```
Docs/IMPLEMENTATION-LOG.md   esta sección
Docs/ROADMAP.md              7.2 ✅; tabla de estado; matriz de tests de la Fase 10
Docs/DATABASE.md             §4.10 y §7.4 — assigned_rank nullable, NOTE_REQUIRED
Docs/HANDOFF.md §1           fila "Panel Admin (SPA)"
Database/schemas/002_constraints.sql          CHECK actualizado
CLAUDE.md                    fila "Admin (SPA)" de la tabla de estado
```

### Verificación

- `npm test` en `Backend/`: **34/34** (19 de `semesterWindow` + 15 nuevos de
  `allocation.service`). Cubren orden de llegada estricto, fallthrough 1→2→3,
  `unplaced` sin grupo inventado, re-corrida idempotente, oferta/grupos
  apagados, contador vs. filas reales, `assignedRank` null fuera de preferencia,
  rank conservado dentro de preferencia, `GROUP_FULL`, `GROUP_INACTIVE`,
  `ALREADY_ASSIGNED`, `NOTE_REQUIRED`, bitácora con `fromGroup`/`toGroup`, y
  alcance por campus.
- `Admin/`: `astro check` **0 errores, 0 warnings** (40 archivos);
  `npm run build` completo.
- **Curl contra la base local** (JWT firmado con el `JWT_SECRET` del `.env`),
  sobre un semestre con 1 `unplaced` real y toda la oferta llena:
  `NOTE_REQUIRED` sin nota y con nota en blanco (400); `GROUP_FULL` al grupo
  lleno (409); subir cupo → colocar fuera de preferencia → **201** con
  `assigned_rank = NULL` (antes: 500); mover a su 2ª preferencia → 200 con
  `assigned_rank = 2`; filtro `?groupId=` y `?semesterSubjectId=` devolviendo
  los alumnos del grupo. Consultas #1 y #3 de `002_constraints.sql` (deriva del
  contador y estados incoherentes) en **cero filas** después de cada operación.
- **Sin prueba de navegador.**
