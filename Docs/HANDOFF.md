# HANDOFF — cablear la API con el portal público

Para el próximo agente (o persona) que agarre esto. El modelo de datos está
cerrado y verificado; lo que falta es la API y conectarla al portal que ya está
maquetado.

Este documento asume que ya leíste [`TAEV-DOMAIN.md`](./TAEV-DOMAIN.md) (el qué)
y [`DATABASE.md`](./DATABASE.md) (el cómo). **No empieces sin eso**: hay
decisiones acá que van a parecer arbitrarias si no sabés por qué se tomaron.

> ## ⚠️ ESTADO ACTUALIZADO — Fases 0 a 4 implementadas
>
> Este documento describía trabajo **pendiente**. La API pública, el portal
> cableado, la auth JWT + API Admin y el allocator **ya están implementados y
> verificados**. El registro completo de qué se hizo, cómo y qué queda está en
> [`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md) — **empezá por ahí**.
>
> Lo que sigue en este archivo se mantiene como referencia de los contratos
> (§4) y de por qué las cosas son como son. Los estados de abajo están
> actualizados; los "tu trabajo" ya no aplican salvo donde se indica 🟡/❌.

---

## 1. Dónde está parado el proyecto

| Pieza | Estado |
|---|---|
| `Backend/prisma/schema.prisma` | ✅ Modelado, validado, **fuente de verdad** |
| Migración inicial + constraints | ✅ Generada y probada contra PostgreSQL 16 |
| `Backend/utils/semesterWindow.js` | ✅ Implementado, 19 tests |
| `Backend/config/main.js` | ✅ `TAEV_CONFIG`, `AUTH_CONFIG`, `assertConfig()` |
| Seed de demo | ✅ `Database/seeds/001_demo_semester.sql` |
| **API pública** (`routes/taev.js`, `controllers/taev.controller.js`, `services/taev.service.js`) | ✅ Implementada, curl-verificada |
| **Portal cableado a la API** | ✅ Los 7 desajustes de §3 resueltos; `astro build` limpio |
| Auth (JWT) + API Admin | ✅ `middlewares/auth.*`, `routes/admin.js`, `services/admin.service.js`, `services/auth.service.js` |
| Panel Admin (SPA) | 🟡 Esenciales: login, dashboard + kill switch, semestres, padrón, catálogo, oferta y grupos, bitácora, envíos en vivo, asignaciones (colocar y mover). Faltan: padrón por CSV, reportes, usuarios |
| Capa `Backend/models/` | ✅ Toda query vive ahí — ni controllers ni services importan `prisma` |
| Allocator | ✅ `services/allocation.service.js` (de `DATABASE.md` §7.3) + overrides manuales |

Detalle completo: [`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md).

---

## 2. Arrancar en 5 minutos

```bash
# Postgres local. OJO: si el 5432 está ocupado por otro contenedor, mapeá a
# 5433 y poné DB_PORT=5433 en Backend/.env (así está hoy en esta máquina).
docker run -d --name taev-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=taev_udeg_prepa2 -p 5433:5432 postgres:16-alpine

cd Backend
npm install
cp .env.example .env               # editar DB_PORT si usaste 5433
npm run prisma:migrate:deploy     # aplica la migración ya versionada
npm run prisma:generate
npm test                          # 19 tests de la ventana, deben pasar

# Datos para trabajar: 1 semestre ABIERTO, 7 asignaturas, 21 grupos, 30 alumnos
docker exec -i taev-db psql -U postgres -d taev_udeg_prepa2 \
  < ../Database/seeds/001_demo_semester.sql

npm run dev                       # http://localhost:4000

# En otras terminales
cd Frontend && npm install && cp .env.example .env && npm run dev   # :4321
cd Admin    && npm install && cp .env.example .env && npm run dev   # :4322
```

`DATABASE_URL` la arma `config/databaseUrl.js` desde las `DB_*` — **no** hace
falta definirla a mano en el `.env` (ni para el runtime ni para el CLI de
Prisma).

El seed deja la ventana **abierta desde hace 5 minutos y por 2 horas**, así que
podés probar el camino feliz de inmediato. Códigos válidos: `218327451` a
`218327480`. Los primeros 5 tienen nombre; **el resto tiene `full_name` en
NULL a propósito** (ver desajuste #6).

Para probar los otros estados de la ventana hay `UPDATE`s listos en el
encabezado del seed.

---

## 3. Los 7 desajustes entre el front actual y la API real

> **✅ Resueltos.** Esta sección se mantiene como referencia de qué había que
> arreglar y por qué. El mapeo de cómo quedó cada uno está en
> [`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md) § Fase 2.

Esto es lo importante. El portal estaba maquetado contra un mock que **mentía en
formas específicas**. Cablear sin resolver esto compila y falla en producción.

### #1 — `rankings` está indexado por NOMBRE, la API necesita IDs

`Frontend/src/stores/taevStore.ts` guarda:

```ts
rankings: Record<string, string>   // { "Robótica": "1", "Ética": "2" }
```

Pero `POST /api/taev/submit` necesita `semesterSubjectId` (un entero). El nombre
de la asignatura **no identifica nada**: `subjects.name` no es único, y lo que
importa es la *oferta del semestre*, no el catálogo.

Hay que cambiar la forma del store:

```ts
type Offering = { semesterSubjectId: number; name: string; displayOrder: number };

offerings: Offering[];                        // viene de la API
rankings: Record<number, number | null>;      // semesterSubjectId → rank
```

Y `TAEV_CLASSES` (el array de strings de `taev.config.json`) **desaparece** del
flujo real: la lista viene del backend. El JSON queda sólo como fallback de
maqueta.

Impacta: `taevStore.ts`, `PreferencesStep.tsx`, `SummaryStep.tsx`,
`DoneStep.tsx`, y los helpers `selectedCount` / `canContinue` / `summaryList`.

### #2 — `PreferencesStep` tiene el "3" hardcodeado

`ranksRequired` es **configurable por semestre** (`semesters.ranks_required`).
El componente actual tiene:

```tsx
<option value="1">1 · Más preferida</option>
<option value="2">2</option>
<option value="3">3 · Menos preferida</option>
...
<span>Seleccionadas: {count} de 3</span>
```

y el texto *"asignando **1** a la que más prefieres y **3** a la que menos"*.
Todo eso tiene que generarse a partir del `ranksRequired` que devuelve la API.
Si un semestre pide 5 preferencias, hoy el portal se rompe en silencio: el
alumno sólo puede elegir 3 y `submit` va a rebotar.

### #3 — No existe pantalla de "ventana cerrada"

Las pantallas son:

```ts
type TaevScreen = 'code' | 'verifying' | 'error' | 'form' | 'summary' | 'done';
```

El flujo arranca directo en `code`, asumiendo que siempre se puede registrar.
Falta:

- **`loading`** — mientras se consulta `GET /api/taev/status` al montar.
- **`closed`** — la ventana no acepta envíos. Con submensaje según el motivo
  (todavía no abre / ya cerró / cerrada por la coordinación) y, si todavía no
  abre, **cuenta regresiva**.

`StepTags.tsx` tiene `STEP_INDEX: Record<TaevScreen, number>`, así que
TypeScript te va a obligar a mapear las nuevas — bien. Decidí si esas pantallas
muestran los tags o no (sugerencia: `closed` y `loading` no los muestran).

### #4 — `ErrorStep` tiene un título fijo equivocado

```tsx
<div className="text-lg font-heading font-semibold">Código no encontrado</div>
```

Ese título es correcto para **uno** de los casos. La API distingue cuatro, y
"Código no encontrado" es directamente falso para `ALREADY_SUBMITTED` (el
código sí se encontró; el problema es otro). Hay que mapear
`message` → `{ título, cuerpo }`.

### #5 — El reloj del cliente no es confiable

En una ventana de 15 minutos, un navegador 3 minutos adelantado es un alumno que
cree que llegó tarde y no lo intenta.

`GET /api/taev/status` devuelve `serverTime`. Calculá el offset una vez al
montar y usalo para toda cuenta regresiva:

```ts
const offsetMs = new Date(res.window.serverTime).getTime() - Date.now();
const ahoraServidor = () => new Date(Date.now() + offsetMs);
```

**El cliente nunca decide si la ventana está abierta.** Sólo muestra. La
autoridad es el servidor, y se revalida en el submit (ver §5).

### #6 — `studentName` puede venir NULL

`semester_students.full_name` es opcional: el padrón real llega incompleto más
seguido de lo que uno quisiera, y el seed reproduce eso a propósito (25 de los
30 alumnos no tienen nombre).

`PreferencesStep` hace `Hola, {studentName}` → con NULL queda `"Hola, "`.
Definí el fallback (sugerencia: mostrar el código, `Hola, 218327451`, o cambiar
el saludo cuando no hay nombre).

### #7 — `DoneStep` promete un correo que el sistema no manda

```tsx
Recibirás la confirmación de tu grupo asignado por correo institucional.
```

**No hay notificaciones.** La tabla `notifications` está documentada en el DBML
pero deliberadamente no migrada, y no hay worker. Además `semester_students.email`
es opcional y el seed lo deja en NULL.

Cambiá ese texto por lo que realmente va a pasar (que la coordinación publica
los resultados), o implementá notificaciones — pero no dejes la promesa.

### Bonus: `connection.ts` no tipa nada

`Frontend/src/backend/connection.ts` tiene 4 errores de TypeScript preexistentes
(`npx tsc --noEmit`):

```
src/backend/connection.ts(21,31): Parameter 'promise' implicitly has an 'any' type.
src/backend/connection.ts(27,29): Property 'response' does not exist on type '{}'.
src/backend/connection.ts(27,56): 'err' is of type 'unknown'.
src/backend/connection.ts(28,5): 'err' is of type 'unknown'.
```

Es el archivo que vas a extender con cada endpoint, así que arreglalo **antes**
de agregarle nada. Algo así:

```ts
import axios, { AxiosError, type AxiosResponse } from 'axios';

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export async function request<T>(promise: Promise<AxiosResponse<ApiEnvelope<T>>>): Promise<ApiEnvelope<T>> {
  try {
    const res = await promise;
    return res.data;
  } catch (err) {
    const axErr = err as AxiosError<{ message?: string }>;
    const apiMessage = axErr.response?.data?.message ?? axErr.message;
    (axErr as AxiosError & { API_message?: string }).API_message = apiMessage;
    throw axErr;
  }
}
```

`Admin/src/backend/connection.ts` tiene el mismo problema — arreglalo igual
cuando llegues al panel.

---

## 4. Contratos de los tres endpoints públicos

Envelope del proyecto: `{ data, message }`. En fallo, `data: false` y `message`
es una sentencia **`UPPER_SNAKE_CASE`** que el Frontend matchea (no se muestra
literal al alumno).

### `GET /api/taev/status?campus=prepa-2`

Lo primero que llama el portal al montar. `campus` es opcional: si se omite y
hay **exactamente un** campus con semestre activo, se resuelve solo (el caso de
hoy). Si hay más de uno, `400 CAMPUS_REQUIRED`. **Nunca adivinar.**

```jsonc
// 200
{
  "data": {
    "campus":   { "code": "prepa-2", "name": "Preparatoria No. 2" },
    "semester": { "code": "2026A", "label": "2026-A", "ranksRequired": 3 },
    "window": {
      "isOpen": true,
      "reason": "OPEN_SCHEDULED",
      "opensAt":    "2026-08-22T16:00:00.000Z",
      "closesAt":   "2026-08-22T16:15:00.000Z",
      "serverTime": "2026-08-22T16:03:12.441Z"
    },
    "offerings": [
      { "semesterSubjectId": 12, "name": "Diseño", "displayOrder": 0 },
      { "semesterSubjectId": 13, "name": "Arte",   "displayOrder": 1 }
    ]
  }
}
```

Si no hay semestre activo: `200` con `semester: null`, `offerings: []` y
`window.reason: "NO_ACTIVE_SEMESTER"`. Devolver 200 y no 404 mantiene simple al
cliente: un solo camino de render para "no se puede registrar ahora".

`window` sale **entero** de `resolveSemesterWindow()`. No lo recalcules.

`offerings` sólo trae `semester_subjects.is_active = true`, ordenadas por
`displayOrder, id`.

### `POST /api/taev/verify-code`

```jsonc
// request
{ "code": "218327451", "campus": "prepa-2" }
```

| Situación | HTTP | `message` |
|---|---|---|
| Ventana cerrada | `403` | el `reason` de la ventana (`FORCED_CLOSED`, `NOT_YET_OPEN`, `CLOSED_SCHEDULED`…) |
| No son 9 dígitos | `400` | `INVALID_CODE_FORMAT` |
| No está en el padrón (o `is_active = false`) | `404` | `CODE_NOT_FOUND` |
| Está, pero ya envió | `409` | `ALREADY_SUBMITTED` |
| Puede continuar | `200` | ver abajo |

```jsonc
// 200
{
  "data": {
    "studentName": "Fernanda Torres Aguilar",   // puede ser null — ver desajuste #6
    "semesterLabel": "2026-A",
    "ranksRequired": 3,
    "offerings": [ /* igual que en status */ ]
  }
}
```

**No devuelvas un booleano.** Cada situación necesita un mensaje distinto para
el alumno, y `CODE_NOT_FOUND` vs `ALREADY_SUBMITTED` son experiencias
completamente diferentes.

### `POST /api/taev/submit`

```jsonc
// request
{
  "code": "218327451",
  "campus": "prepa-2",
  "preferences": [
    { "semesterSubjectId": 12, "rank": 1 },
    { "semesterSubjectId": 15, "rank": 2 },
    { "semesterSubjectId": 13, "rank": 3 }
  ]
}
```

```jsonc
// 201
{
  "data": {
    "semesterLabel": "2026-A",
    "submittedAt": "2026-08-22T16:03:47.882Z",
    "preferences": [
      { "rank": 1, "name": "Diseño" },
      { "rank": 2, "name": "Ética" },
      { "rank": 3, "name": "Arte" }
    ]
  },
  "message": "SUBMITTED"
}
```

Validaciones, **todas dentro de la misma transacción**:

1. La ventana sigue abierta. **Se revalida acá**, no alcanza con el chequeo del
   verify: un alumno que pasó a las 10:14:59 no puede enviar a las 10:20.
2. El código existe, está activo y no tiene envío previo.
3. `preferences.length === semester.ranksRequired` exacto.
4. Los ranks son exactamente `1..ranksRequired`, sin repetir.
5. Los `semesterSubjectId` son distintos entre sí y **pertenecen a la oferta
   activa de ese semestre**. (La BD también lo impide, pero un `400` claro es
   mejor que un `500` por violación de FK.)
6. `ip` y `userAgent` se guardan para auditoría (`req.ip` ya es confiable:
   `app.set('trust proxy', 1)` está puesto en `app.js`).

Errores: `403` (ventana), `400 INVALID_PREFERENCES`, `404 CODE_NOT_FOUND`,
`409 ALREADY_SUBMITTED`, `429`.

**Mapeá el `P2002` de Prisma a `409 ALREADY_SUBMITTED`, no a `500`.** Es el caso
real de doble click o dos pestañas abiertas, y el `UNIQUE` de la base es lo que
lo atrapa.

### Rate limiting

El limiter global de `app.js` (300 req/15 min) es demasiado laxo para esto.
`verify-code` y `submit` necesitan el suyo, en
`middlewares/rateLimit.middleware.js`, con los valores ya configurados:
`TAEV_CONFIG.submitRateLimitMax` y `submitRateLimitWindowMs`.

Ojo con el contexto: **cientos de alumnos entran en la misma ventana de 15
minutos, muchos desde la misma red de la escuela** (misma IP saliente). Un
limiter por IP demasiado estricto bloquea a una clase entera. Los defaults
(10 envíos / minuto por IP) están pensados para eso, pero verificalo contra el
caso real antes de la primera corrida en vivo.

---

## 5. Reglas que no podés romper

Estas ya están decididas y verificadas. Cambiarlas rompe garantías del modelo.

1. **La ventana se resuelve en un solo lugar.** `resolveSemesterWindow()`. No
   escribas una segunda comparación de fechas en un controller.
2. **La ventana se revalida dentro de la transacción del submit.**
3. **El código son 9 dígitos exactos.** Si alguna vez cambia, hay que tocarlo en
   cuatro lugares a la vez: `taev.config.json`, el store del Frontend,
   `TAEV_STUDENT_CODE_LENGTH` y el CHECK de la BD (con migración).
4. **Filtrá siempre `is_active`** — en el padrón, en la oferta y en los grupos.
5. **Toda escritura a `group_assignments` actualiza `assigned_count` en la misma
   transacción.** El CHECK de la BD aborta si te pasás del cupo, pero el
   contador tiene que quedar consistente.
6. **Nunca `prisma migrate dev`, `migrate reset` ni `db push` contra
   producción.** `build-database-url.js` los bloquea si `DB_HOST` no es local.
7. **Si agregás un CHECK o un índice parcial**, va al `migration.sql` **y** a
   `Database/schemas/002_constraints.sql`. Prisma no los genera.
8. **Errores al cliente sin `err.message` ni `err.stack`.** Log con tag de
   módulo (`[TAEV]`, `[ALLOCATION]`), respuesta genérica.

---

## 6. Orden de trabajo — estado

**Fase 0 — destrabar** — ✅ Hecho. `connection.ts` tipado, stack levantado,
`config/databaseUrl.js` agregado (el server no arrancaba sin `DATABASE_URL`).

**Fase 1 — API pública** — ✅ Hecho. `routes/taev.js` +
`controllers/taev.controller.js` + `services/taev.service.js` +
`middlewares/rateLimit.middleware.js`. Verificada con curl.

**Fase 2 — cablear el portal** — ✅ Hecho. Los 7 desajustes de §3 resueltos;
`mockVerifyCode` / `NAME_POOL` / `setTimeout` borrados.

**Fase 3 — auth + panel Admin** — ✅ API / 🟡 SPA. Backend completo
(`middlewares/auth.*`, `campusScope.*`, `routes/admin.js`, `services/auth.*`,
`services/admin.*`). SPA: núcleo funcional (login, dashboard, kill switch,
asignación, bitácora); faltan los editores.

**Fase 4 — allocator** — ✅ Hecho. `services/allocation.service.js` +
`overrideAssignment` + `placeSubmission`. Verificado con curl.

Ver [`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md) para el detalle y los
pendientes.

---

## 7. Checklist antes de decir "listo"

Backend — ✅ verificado en esta pasada:

- [x] `npm test` en verde (34/34: 19 de la ventana + 15 del allocator).
- [x] `Database/scripts/verify_constraints.sql` en verde contra base desechable
      (27 asserts).
- [x] Código de 8/10 dígitos por `curl` → `400 INVALID_CODE_FORMAT`.
- [x] Código fuera del padrón → `404 CODE_NOT_FOUND`.
- [x] Doble envío → `409 ALREADY_SUBMITTED` (no `500`); mapeo de `P2002`.
- [x] `semesterSubjectId` de otra oferta → `400 INVALID_PREFERENCES`.
- [x] Ventana `force_closed` → `verify-code` y `submit` devuelven `403` con el
      `reason`; `/status` refleja el cierre.
- [x] Ningún endpoint filtra `err.message`/`err.stack` al cliente.
- [x] `graphify update .` corrido.

Frontend — ✅ typecheck/build, ⬜ falta prueba de navegador:

- [x] `npx tsc --noEmit` limpio; `astro build` 0 errores.
- [x] Fallback de saludo si `studentName` es null (código `218327460`).
- [x] `ranksRequired` dinámico (el form genera las opciones de rank de la API).
- [ ] Recorrer en navegador: ventana cerrada no llega al form; cuenta regresiva
      correcta con el reloj del SO adelantado; doble pestaña → `409`.

Admin SPA — 🟡:

- [x] Login, guard de sesión, dashboard con overview, kill switch, asignación.
- [ ] Editores: alta de semestre, oferta, grupos y mover asignaciones ✅; falta padrón por CSV.

---

## 8. Trampas conocidas

- **`DateTime` de Prisma mapea a `timestamp(3)` sin zona.** Todo campo temporal
  ya lleva `@db.Timestamptz(6)`. Si agregás uno, no te lo olvides.
- **`BigInt` de Prisma rompe `res.json()`.** Por eso `audit_log.id` es `Int`.
- **Regenerar la migración inicial borra todos los CHECKs.** Prisma no los
  re-emite. Están en `002_constraints.sql` para repegar.
- **`assigned_count <= capacity` impide bajar el cupo** por debajo de la
  ocupación actual. Es intencional: el admin tiene que mover alumnos primero.
  Devolvé un `409` explicativo, no un `500`.
- **Los grupos y las preferencias apuntan a `semester_subjects`, no a
  `subjects`.** Si escribís una query con `subject_id` directo, probablemente te
  estás salteando el alcance del semestre.
- **`Frontend/src/pages/index.astro` tiene "Prepa 2 UDG" hardcodeado** en el
  título y la descripción. Con multi-campus eso es por despliegue — sale de
  `taev.config.json` o de la API.
- **El `_comment` de `taev.config.json`** es un campo real del JSON, no un
  comentario. Si validás ese archivo con un schema, contemplalo.

---

## 9. Referencias

| Necesitás… | Andá a… |
|---|---|
| Qué se implementó, cómo y qué falta | [`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md) |
| Entender el negocio | [`TAEV-DOMAIN.md`](./TAEV-DOMAIN.md) |
| Tablas, constraints, autorización | [`DATABASE.md`](./DATABASE.md) |
| El allocator, ya escrito | [`DATABASE.md`](./DATABASE.md) §7.3 |
| Auth y alcance por campus | [`DATABASE.md`](./DATABASE.md) §3.3 y §8 |
| Convenciones del Backend | [`../.agents/skills/backend/SKILL.md`](../.agents/skills/backend/SKILL.md) |
| Convenciones del Frontend / UI | [`../.agents/skills/frontend/SKILL.md`](../.agents/skills/frontend/SKILL.md) · [`ui/SKILL.md`](../.agents/skills/ui/SKILL.md) |
| El ERD | [`../Database/schemas/001_taev.dbml`](../Database/schemas/001_taev.dbml) |
| Datos para probar | [`../Database/seeds/001_demo_semester.sql`](../Database/seeds/001_demo_semester.sql) |
