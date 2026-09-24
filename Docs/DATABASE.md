# TAEV — Diseño de Base de Datos

Documento técnico del esquema: **tablas, constraints, la ventana de envío, el
algoritmo de asignación y la superficie de endpoints** que el Backend
implementa contra PostgreSQL.

> **Fuente de verdad del esquema**: [`Backend/prisma/schema.prisma`](../Backend/prisma/schema.prisma)
> — ya modelado y validado. Si este documento y el schema discrepan, gana el schema.
>
> **Fuente de verdad del dominio**: [`Docs/TAEV-DOMAIN.md`](./TAEV-DOMAIN.md) — leer primero.
>
> **Constraints que Prisma no genera**: [`Database/schemas/002_constraints.sql`](../Database/schemas/002_constraints.sql)
>
> **ERD visual**: [`Database/schemas/001_taev.dbml`](../Database/schemas/001_taev.dbml) — abrir en https://dbml.dbdiagram.io/home

---

## 1. Principios de diseño

1. **Multi-escuela desde el día 1.** `campuses` es la raíz. Cada campus corre
   su propio ciclo: su ventana, su padrón, su oferta y sus cupos. Hoy hay una
   sola fila (`prepa-2`), pero la columna existe porque agregar un FK
   `NOT NULL` después, con datos reales, obliga a un backfill con downtime.
2. **Todo cuelga de `semesters`.** No hay fila de dominio huérfana. Padrón,
   oferta, grupos, envíos y asignaciones son siempre *de* un semestre — y por
   lo tanto de un campus.
3. **La integridad se enforcea en la base, no en el service.** Las FK
   compuestas hacen físicamente imposible cruzar semestres; los CHECK hacen
   imposible sobrepasar un cupo o guardar un código inválido. Un bug en el
   Backend produce un error, no datos corruptos.
4. **Server time es la verdad.** `submitted_at` lo pone PostgreSQL. El cliente
   nunca decide el orden.
5. **Inmutabilidad post-envío.** `form_submissions` y `submission_preferences`
   no se tocan después de creados. Los cambios del admin pasan por
   `group_assignments`.
6. **Un solo lugar por regla.** La ventana se resuelve en
   [`Backend/utils/semesterWindow.js`](../Backend/utils/semesterWindow.js) y en
   ningún otro lado. El cierre de la ventana se calcula en `deriveClosesAt()` y
   en ningún otro lado.
7. **Auditoría nativa.** `created_at` / `updated_at` en todas las tablas
   operadas por admin, y `audit_log` desde el día 1 — no es opcional.

---

## 2. Diagrama entidad-relación

```
                        ┌──────────────┐
                        │   campuses   │   prepa-2, prepa-3…
                        └──┬────────┬──┘
                           │        │
            ┌──────────────┘        └──────────────┐
            ▼                                      ▼
     ┌──────────────┐                      ┌───────────────┐
     │    users     │  crea / asigna       │   semesters   │
     │   (admins)   │─────────────────────▶│  2026A, 2026B │
     │  campus_id   │                      │  opens_at     │
     └──────┬───────┘                      │  closes_at    │
            │                              │  window_mode  │
            │ escribe                      │  is_current   │
            ▼                              └──┬─────────┬──┘
     ┌──────────────┐                         │         │
     │  audit_log   │                         │         │
     └──────────────┘                         │         │
                                              ▼         ▼
                          ┌────────────────────┐   ┌──────────────────────┐
                          │ semester_students  │   │  semester_subjects   │
                          │  code (9 dígitos)  │   │   LA OFERTA          │◀── subjects
                          └─────────┬──────────┘   └──────────┬───────────┘   (catálogo
                                    │                         │                compartido)
                                    │                         ▼
                                    │              ┌──────────────────────┐
                                    │              │   subject_groups     │
                                    │              │  capacity            │
                                    │              │  assigned_count      │
                                    │              └──────────┬───────────┘
                                    ▼                         │
                          ┌────────────────────┐              │
                          │  form_submissions  │              │
                          │   submitted_at     │              │
                          │   status           │              │
                          └────┬──────────┬────┘              │
                               │          │ 1:1               │
                          1:N  │          └──────┐            │
                               ▼                 ▼            ▼
              ┌────────────────────────┐   ┌──────────────────────┐
              │ submission_preferences │   │  group_assignments   │
              │   rank (1..N)          │   │   assigned_rank      │
              │   semester_subject_id  │   │   is_manual_override │
              └────────────────────────┘   └──────────────────────┘

Documentadas pero NO migradas (ver §4):
  subject_group_schedules · notifications
```

Las flechas que importan y no se ven bien en ASCII:

- `submission_preferences` apunta a **`semester_subjects`**, no a `subjects`.
- `subject_groups` apunta a **`semester_subjects`**, no a `subjects`.
- `form_submissions → semester_students` y las dos FK de
  `submission_preferences` son **compuestas**, con `semester_id` incluido.

Esas tres decisiones son las que hacen imposible mezclar semestres o campus.

---

## 3. Multi-campus: alcance y autorización

### 3.1 Qué separa un campus de otro

Todo lo operativo:

| Recurso | ¿Se comparte entre campus? |
|---|---|
| `subjects` (catálogo) | **Sí** — "Robótica" es la misma fila en toda la red |
| `semester_subjects` (oferta) | No — cada escuela elige qué ofrece |
| `subject_groups` + cupos | No |
| `semester_students` (padrón) | No |
| Ventana de envío | No — cada campus abre cuando quiere |
| Semestre activo | No — uno por campus |

El catálogo se mantiene compartido a propósito: así un reporte cruzado
("cuántos eligieron Robótica en toda la red") es un `GROUP BY subject_id` en
vez de un match por nombre entre tablas separadas. Que PREPA 2 ofrezca
Robótica y PREPA 3 no, se expresa en `semester_subjects` — que es exactamente
para lo que esa tabla existe.

Si algún día una escuela necesita una asignatura sin sentido en las demás, se
agrega `subjects.campus_id Int?` (NULL = compartida). Es aditivo.

### 3.2 Alcance de los usuarios

`users.campus_id` acota al admin a su escuela. `NULL` significa alcance global.

El CHECK `users_campus_scope` sólo permite `NULL` a los `superadmin`:

```sql
CHECK (role = 'superadmin' OR campus_id IS NOT NULL)
```

Sin esa regla, un `admin` creado sin campus sería silenciosamente omnipotente,
y el bug aparecería recién cuando alguien de PREPA 2 abriera la ventana de
PREPA 3.

### 3.3 El esquema define el alcance; el middleware lo hace cumplir

**Esto es la mitad no negociable del trabajo.** El CHECK garantiza que todo
admin tenga un campus, pero no impide que un request pida un recurso ajeno.
Eso lo tiene que hacer el Backend en **cada** endpoint del panel:

```js
// middlewares/campusScope.middleware.js
//
// Regla única: un recurso es accesible si pertenece al campus del usuario,
// o si el usuario es un superadmin global (campus_id NULL).
//
// El rol y el campus se re-leen de la BD en cada request (convención del
// proyecto: nunca confiar en el payload del JWT).
export function assertCampusAccess(user, campusIdDelRecurso) {
  if (user.role === 'superadmin' && user.campusId === null) return;
  if (user.campusId === campusIdDelRecurso) return;

  const err = new Error('CAMPUS_FORBIDDEN');
  err.status = 403;
  throw err;
}
```

Y toda consulta de listado se filtra por campus desde el principio — no se
traen filas ajenas para descartarlas después:

```js
const where = user.campusId === null ? {} : { campusId: user.campusId };
const semestres = await prisma.semester.findMany({ where });
```

Para recursos que no tienen `campus_id` propio (un grupo, un envío), el campus
se resuelve subiendo por la relación:

```js
const grupo = await prisma.subjectGroup.findUnique({
  where: { id },
  select: { semesterSubject: { select: { semester: { select: { campusId: true } } } } },
});
assertCampusAccess(req.user, grupo.semesterSubject.semester.campusId);
```

### 3.4 Cómo sabe el portal público a qué campus entra el alumno

El alumno teclea 9 dígitos y nada más. El campus se resuelve así:

1. **Explícito por URL** — `/registro/prepa-2` o `?campus=prepa-2`. Es el
   camino determinista y el que hay que usar cuando haya más de una escuela.
2. **Automático** — si se omite y **exactamente un** campus activo tiene
   semestre `is_current`, se usa ese. Es el caso de hoy (sólo PREPA 2), así
   que el portal funciona sin fricción.
3. **Ambiguo** — si se omite y hay más de un campus con semestre activo, la
   API responde `400 CAMPUS_REQUIRED`. **Nunca adivina.**

No se resuelve por el código del alumno: los códigos son únicos por padrón, no
entre campus, y apoyarse en que no colisionen es una bomba de tiempo.

---

## 4. Tablas

Convenciones:
- PK `id`: `Int autoincrement` (`SERIAL`).
- Timestamps: **`timestamptz(6)` siempre**, nunca `timestamp`.
- Soft-delete: columna `is_active`. No se borra, se desactiva.
- Nombres: tablas y columnas en `snake_case`; modelos Prisma en `PascalCase`
  con `@@map` / `@map`.

### 4.1 `campuses`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `code` | `varchar(32) UNIQUE` | url-safe: `prepa-2`. Se usa tal cual en la URL del portal |
| `name` | `varchar(160)` | display: `Preparatoria No. 2` |
| `is_active` | `bool` | default `true` |
| `created_at`, `updated_at` | `timestamptz` | |

CHECK: `code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` — un admin no puede crear
`"PREPA 2"` y romper el enlace público.

### 4.2 `users`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `email` | `varchar(160) UNIQUE` | login |
| `password_hash` | `varchar(255)` | bcrypt/argon2, nunca plain |
| `full_name` | `varchar(160)` | |
| `role` | `enum(superadmin, admin, viewer)` | default `admin` |
| `campus_id` | `FK campuses.id NULL` | NULL = global (sólo superadmin) |
| `is_active` | `bool` | default `true` |
| `created_at`, `updated_at` | `timestamptz` | |

### 4.3 `semesters` (raíz operativa)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `campus_id` | `FK campuses.id NOT NULL` | la escuela dueña del ciclo |
| `code` | `varchar(16)` | `"2026A"` — **único por campus** |
| `label` | `varchar(64)` | `"2026-A"` — lo que ve el alumno al terminar |
| `is_current` | `bool` | default `false` — a qué semestre apunta el portal |
| `opens_at` | `timestamptz` | inicio de la ventana |
| `closes_at` | `timestamptz` | fin de la ventana — **columna real, no derivada** |
| `window_mode` | `enum(scheduled, force_open, force_closed)` | default `scheduled` |
| `ranks_required` | `int` | default `3` — configurable por semestre |
| `notes` | `text` | |
| `created_by_id` | `FK users.id NOT NULL` | |
| `created_at`, `updated_at` | `timestamptz` | |

Constraints:
- `UNIQUE (campus_id, code)`
- `CHECK (closes_at > opens_at)`
- `CHECK (ranks_required BETWEEN 1 AND 10)`
- `CREATE UNIQUE INDEX ... ON semesters (campus_id) WHERE is_current`
  — **un semestre activo por escuela**.

**Por qué `closes_at` y no `duration_minutes`:** guardar la duración obliga a
recalcular `opens_at + duration` en cada lectura, lo que impide usar índice y
deja la definición del fin de la ventana repartida por el código. La API sigue
aceptando `durationMinutes` como comodidad del admin y deriva `closesAt` con
`deriveClosesAt()` — un solo lugar hace esa cuenta.

### 4.4 `subjects` (catálogo compartido)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `code` | `varchar(32) UNIQUE` | `"TAEV-ROB"` |
| `name` | `varchar(120)` | `"Robótica"` |
| `description` | `text` | |
| `is_active` | `bool` | default `true` |
| `created_at`, `updated_at` | `timestamptz` | |

### 4.5 `semester_subjects` (la oferta)

Qué asignaturas existen en qué semestre. **Punto de anclaje de todo lo que
depende de una asignatura.**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `semester_id` | `FK semesters.id NOT NULL` | |
| `subject_id` | `FK subjects.id NOT NULL` | |
| `display_order` | `int` | default `0` — orden en el formulario |
| `is_active` | `bool` | default `true` |
| `created_at`, `updated_at` | `timestamptz` | |

Constraints:
- `UNIQUE (semester_id, subject_id)` — una asignatura se ofrece una vez por semestre.
- `UNIQUE (id, semester_id)` — redundante como llave, pero necesaria como
  **destino de las FK compuestas**. Es lo que impide cruzar semestres.

### 4.6 `semester_students` (padrón)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `semester_id` | `FK semesters.id NOT NULL` | |
| `code` | `varchar(9) NOT NULL` | **exactamente 9 dígitos** |
| `full_name` | `varchar(160) NULL` | opcional — CSV / SIIAU |
| `email` | `varchar(160) NULL` | opcional |
| `career` | `varchar(120) NULL` | opcional |
| `student_semester_label` | `varchar(32) NULL` | semestre que cursa el alumno |
| `is_active` | `bool` | default `true` |
| `created_at`, `updated_at` | `timestamptz` | |

Constraints:
- `UNIQUE (semester_id, code)` — un código por semestre; entre semestres puede repetirse.
- `UNIQUE (id, semester_id)` — destino de la FK compuesta de `form_submissions`.
- `CHECK (code ~ '^[0-9]{9}$')`.
- `INDEX (code)` — búsqueda al teclear.

**`varchar(9)`, no `char(9)`:** `CHAR` rellena con espacios a la derecha, y
`'218327451 ' <> '218327451'` rompería el acceso del alumno en silencio.

### 4.7 `subject_groups`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `semester_subject_id` | `FK semester_subjects.id NOT NULL` | apunta a la **oferta** |
| `label` | `varchar(32)` | `"A"`, `"B"`, `"1"` |
| `capacity` | `int` | cupo máximo |
| `assigned_count` | `int` | default `0` — ocupación materializada |
| `display_order` | `int` | default `0` — orden en que se llenan |
| `is_active` | `bool` | default `true` |
| `created_at`, `updated_at` | `timestamptz` | |

Constraints:
- `UNIQUE (semester_subject_id, label)`
- `CHECK (capacity > 0)`
- `CHECK (assigned_count >= 0 AND assigned_count <= capacity)`

**`assigned_count` no es sólo una optimización.** Ese segundo CHECK convierte a
PostgreSQL en el árbitro final: aunque el service tenga un bug, aunque dos
admins disparen la asignación a la vez, un grupo **no puede** terminar con más
alumnos que su cupo — la transacción aborta.

Efecto secundario deliberado: bajar `capacity` por debajo de la ocupación
actual falla. El admin tiene que sacar alumnos primero. La alternativa es un
grupo sobrevendido en silencio.

### 4.8 `form_submissions` (inmutable)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `semester_id` | `FK semesters.id NOT NULL` | |
| `semester_student_id` | `int NOT NULL` | FK **compuesta** con `semester_id` |
| `submitted_at` | `timestamptz` | default `now()` — **server time** |
| `ip` | `inet NULL` | auditoría |
| `user_agent` | `text NULL` | auditoría |
| `status` | `enum(pending, allocated, unplaced)` | default `pending` |
| `resolved_at` | `timestamptz NULL` | cuándo corrió la asignación |

Constraints:
- `FOREIGN KEY (semester_student_id, semester_id) REFERENCES semester_students(id, semester_id)`
  — el envío y el alumno **no pueden** estar en semestres distintos.
- `UNIQUE (semester_student_id, semester_id)` — un envío por alumno.
- `UNIQUE (id, semester_id)` — destino de la FK compuesta de las preferencias.
- `INDEX (semester_id, submitted_at, id)` — el índice del allocator. `id` al
  final es el **desempate determinista** para dos envíos con el mismo
  timestamp: sin él, dos corridas del allocator podrían dar resultados
  distintos.

**No tiene `assigned_group_id`.** Esa columna era un cache de
`group_assignments.group_id` que nadie sincronizaba en los overrides manuales:
divergencia garantizada. El resultado se lee por la relación 1:1.

### 4.9 `submission_preferences`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `submission_id` | `int NOT NULL` | FK compuesta con `semester_id` |
| `semester_id` | `int NOT NULL` | denormalizado: es el pegamento de las dos FK |
| `semester_subject_id` | `int NOT NULL` | FK compuesta con `semester_id` |
| `rank` | `smallint NOT NULL` | 1..`ranks_required` |

Constraints:
- `FOREIGN KEY (submission_id, semester_id) REFERENCES form_submissions(id, semester_id)`
- `FOREIGN KEY (semester_subject_id, semester_id) REFERENCES semester_subjects(id, semester_id)`
- `UNIQUE (submission_id, rank)` — no puede haber dos rank=1.
- `UNIQUE (submission_id, semester_subject_id)` — no puede rankear lo mismo dos veces.
- `CHECK (rank >= 1)` — el techo lo valida el service contra
  `semesters.ranks_required`. Un CHECK fijo `BETWEEN 1 AND 3` haría que
  `ranks_required` fuera mentira.

Las dos FK compuestas hacen **físicamente imposible** que una preferencia
apunte a la oferta de otro semestre o de otro campus. Está verificado en
[`Database/scripts/verify_constraints.sql`](../Database/scripts/verify_constraints.sql).

### 4.10 `group_assignments` (resultado)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | |
| `submission_id` | `FK form_submissions.id UNIQUE` | 0 o 1 asignación por alumno |
| `group_id` | `FK subject_groups.id NOT NULL` | |
| `assigned_rank` | `smallint NULL` | qué preferencia se usó. **`NULL` ⇒ el admin lo colocó fuera de sus preferencias** (CHECK: `IS NULL OR >= 1`; el `0` está prohibido) |
| `assigned_at` | `timestamptz` | default `now()` |
| `assigned_by_id` | `FK users.id **NOT NULL**` | quién |
| `is_manual_override` | `bool` | default `false` |
| `notes` | `text` | obligatorio en los movimientos manuales (el service rechaza vacío con `NOTE_REQUIRED`) |

**`assigned_by_id` siempre está lleno.** Antes se documentaba "NULL =
automático" mientras el pseudocódigo insertaba el id del admin en cada corrida
— nunca iba a ser NULL. Ahora la semántica es clara: este campo es *quién hizo
la acción* (el admin que disparó la corrida o el que movió al alumno), y
`is_manual_override` distingue automático de manual.

### 4.11 `audit_log`

Bitácora append-only. **Día 1, no opcional.**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `int PK` | Int y no BigInt — ver abajo |
| `user_id` | `FK users.id NULL` | `ON DELETE SET NULL` |
| `action` | `varchar(64)` | `semester.window.force_closed`, `allocation.run`… |
| `entity_type` | `varchar(64) NULL` | |
| `entity_id` | `int NULL` | |
| `payload` | `jsonb NULL` | diff before/after |
| `ip` | `inet NULL` | |
| `created_at` | `timestamptz` | default `now()` |

**`Int` y no `BigInt`:** el `BigInt` de Prisma no sobrevive a `JSON.stringify`
y rompe `res.json()` con un `TypeError` en runtime. 2.1 mil millones de filas
sobran para una bitácora de esto.

Acciones que **deben** escribir aquí sin excepción:
`semester.create`, `semester.update`, `semester.window.*` (todo cambio de
`window_mode`), `semester.set_current`, `semester.clear_current` (quitar el
semestre activo), `students.bulk_upload`, `groups.capacity_change`,
`allocation.run`, `assignment.override`.

---

## 5. Extensiones documentadas y NO migradas

`subject_group_schedules` (día/hora/salón/profesor) y `notifications` (cola de
correos post-asignación) están en el DBML pero **no** en `schema.prisma`. Crear
tablas que nadie escribe sólo agrega superficie que mantener; el modelo las
aguanta sin cambios destructivos cuando hagan falta.

`campuses` **sí** se migró día 1, aunque hoy tenga una fila: es un FK
`NOT NULL` en `semesters` y agregarlo después obliga a un backfill.

---

## 6. La ventana de envío

### 6.1 Por qué no es un booleano

El diseño original era `NOW() ∈ ventana OR is_open = true`. Ese `OR` tiene un
agujero fatal: con `is_open = false` **dentro** de la ventana programada, el
formulario sigue abierto. El admin no podía cerrar antes de tiempo — justo la
acción que más se necesita cuando algo sale mal en una ventana de 15 minutos en
vivo: se filtró el enlace, se subió el padrón equivocado, se abrió sin querer.

Un booleano no puede expresar tres intenciones. `window_mode` es un enum con
**precedencia absoluta**, no un término más de un OR:

| Modo | Resultado | Para qué |
|---|---|---|
| `force_closed` | **Cerrado siempre**, sin mirar el reloj | **Kill switch** |
| `force_open` | **Abierto siempre**, sin mirar el reloj | Reabrir para rezagados |
| `scheduled` | Manda el reloj: `[opens_at, closes_at)` | Operación normal |

El intervalo es **semiabierto**: en el milisegundo exacto de `closes_at` ya
está cerrado. Un intervalo cerrado deja una rendija donde dos lecturas del
mismo instante pueden discrepar.

### 6.2 Un solo lugar decide

[`Backend/utils/semesterWindow.js`](../Backend/utils/semesterWindow.js) es
función pura, sin dependencias, y **nadie más** calcula esto:

```js
import { resolveSemesterWindow } from '../utils/semesterWindow.js';

const estado = resolveSemesterWindow(semestre, new Date());
// → { isOpen, reason, mode, opensAt, closesAt, serverTime, opensInMs, closesInMs }
```

Está cubierta por 19 tests (`npm test` en `Backend/`), incluidos los bordes que
importan: el instante exacto de apertura, el instante exacto de cierre, y el
kill switch a mitad de la ventana.

### 6.3 Las tres reglas operativas

1. **Re-validar en el submit, dentro de la transacción.** El chequeo hecho al
   verificar el código no vale para el envío: un alumno que pasó la
   verificación a las 10:14:59 no puede enviar a las 10:20. La ventana se
   vuelve a evaluar en el mismo `$transaction` que inserta.
2. **Devolver `serverTime` al cliente.** En una ventana de 15 minutos, un
   navegador 3 minutos adelantado es un alumno que cree que llegó tarde. El
   Frontend calcula su desfase contra `serverTime` y muestra la cuenta
   regresiva corregida — pero **nunca** decide con su propio reloj.
3. **Auditar cada cambio de modo.** Todo `window_mode` que cambia escribe en
   `audit_log`. Cuando alguien pregunte "¿por qué cerró a las 10:07?", la
   respuesta tiene que estar en la base.

### 6.4 Razones machine-readable

El Frontend ramifica por `reason`, no por la prosa:

`NO_ACTIVE_SEMESTER` · `FORCED_CLOSED` · `FORCED_OPEN` · `OPEN_SCHEDULED` ·
`NOT_YET_OPEN` · `CLOSED_SCHEDULED`

---

## 7. Algoritmo de asignación

### 7.1 Especificación

**Entrada**: `semesterId`, `adminUserId`.

**Salida**: filas en `group_assignments`, `form_submissions.status` en
`allocated` / `unplaced`, `subject_groups.assigned_count` actualizado, y una
fila en `audit_log`.

**Propiedades**:

- **Orden**: `submitted_at ASC, id ASC`. El desempate por `id` no es un detalle
  — sin él, dos envíos con el mismo timestamp pueden ordenarse distinto entre
  corridas y el resultado deja de ser reproducible.
- **Preferencia**: rank 1 → 2 → … → `ranks_required`. Si el rank 1 está lleno
  **se sigue con el 2**, no se abandona al alumno.
- **Dentro de una asignatura**: `display_order ASC, id ASC`.
- **Sólo oferta activa**: `semester_subjects.is_active` **y**
  `subject_groups.is_active`. Ambos, no uno.
- **Idempotente y re-ejecutable**: los `allocated` no se tocan; los `unplaced`
  **sí se reconsideran**.
- **Serializada**: un advisory lock por semestre.

### 7.2 Re-correr reconsidera a los no colocados

El diseño anterior filtraba `status = 'pending'` y se declaraba idempotente.
Pero después de la primera corrida nadie queda en `pending`: quedan `allocated`
o `unplaced`. O sea que el escenario obvio del admin — *"abrí un grupo más,
volvé a correr"* — no reconsideraba a nadie.

Ahora el allocator toma `status IN ('pending', 'unplaced')`. Un alumno sin
lugar vuelve a competir en su posición cronológica original, que es lo justo.

### 7.3 Implementación

Se resuelve **en memoria**, no con un loop de SQL. Un `COUNT(*)` por grupo
candidato × N ranks × miles de alumnos, dentro de una transacción que sostiene
locks, es lento justo cuando más importa. Los cupos de un semestre caben de
sobra en RAM.

```js
// services/allocation.service.js
import { prisma } from '../config/db.js';
import { TAEV_CONFIG } from '../config/main.js';

export async function runAllocation(semesterId, adminUserId) {
  return prisma.$transaction(async (tx) => {
    // 1. Serializar las corridas. Dos admins dando click a "asignar" al mismo
    //    tiempo se encolan en vez de pelearse por los cupos. Es más simple y
    //    más predecible que SERIALIZABLE + reintentos por error 40001.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(${TAEV_CONFIG.allocationLockKey}::int, ${semesterId}::int)`;

    const semestre = await tx.semester.findUniqueOrThrow({ where: { id: semesterId } });

    // 2. Envíos a colocar, en orden cronológico estricto.
    const envios = await tx.formSubmission.findMany({
      where: { semesterId, status: { in: ['pending', 'unplaced'] } },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        preferences: {
          orderBy: { rank: 'asc' },
          select: { rank: true, semesterSubjectId: true },
        },
      },
    });

    // 3. Grupos activos de asignaturas activas, con su ocupación real.
    const grupos = await tx.subjectGroup.findMany({
      where: {
        isActive: true,
        semesterSubject: { semesterId, isActive: true },
      },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, semesterSubjectId: true, capacity: true, assignedCount: true },
    });

    // Índice en memoria: oferta → sus grupos, en orden de llenado.
    const porOferta = new Map();
    for (const g of grupos) {
      if (!porOferta.has(g.semesterSubjectId)) porOferta.set(g.semesterSubjectId, []);
      porOferta.get(g.semesterSubjectId).push({ ...g, libres: g.capacity - g.assignedCount });
    }

    // 4. Repartir.
    const nuevasAsignaciones = [];
    const colocados = [];
    const sinLugar = [];

    for (const envio of envios) {
      let ubicado = null;

      for (const pref of envio.preferences) {          // ya vienen por rank ASC
        const candidatos = porOferta.get(pref.semesterSubjectId) ?? [];
        const grupo = candidatos.find((g) => g.libres > 0);
        if (grupo) {
          grupo.libres -= 1;                            // reservar en memoria
          ubicado = { grupo, rank: pref.rank };
          break;                                        // colocado: no se ven más ranks
        }
        // lleno → SIGUE con el rank siguiente. Nunca se abandona acá.
      }

      if (ubicado) {
        nuevasAsignaciones.push({
          submissionId: envio.id,
          groupId: ubicado.grupo.id,
          assignedRank: ubicado.rank,
          assignedById: adminUserId,
          isManualOverride: false,
        });
        colocados.push(envio.id);
      } else {
        sinLugar.push(envio.id);
      }
    }

    // 5. Escribir. Los unplaced que ahora sí entraron pueden tener una fila
    //    vieja: no la hay, porque unplaced nunca genera group_assignments.
    if (nuevasAsignaciones.length > 0) {
      await tx.groupAssignment.createMany({ data: nuevasAsignaciones });
    }

    const ahora = new Date();
    if (colocados.length > 0) {
      await tx.formSubmission.updateMany({
        where: { id: { in: colocados } },
        data: { status: 'allocated', resolvedAt: ahora },
      });
    }
    if (sinLugar.length > 0) {
      await tx.formSubmission.updateMany({
        where: { id: { in: sinLugar } },
        data: { status: 'unplaced', resolvedAt: ahora },
      });
    }

    // 6. Recalcular assigned_count DESDE la realidad, no incrementando en JS.
    //    Si esto viola el CHECK assigned_count <= capacity, la transacción
    //    entera aborta y no queda nada a medias.
    await tx.$executeRaw`
      UPDATE subject_groups sg
         SET assigned_count = sub.total
        FROM (
          SELECT g.id, COUNT(ga.id)::int AS total
            FROM subject_groups g
            LEFT JOIN group_assignments ga ON ga.group_id = g.id
            JOIN semester_subjects ss ON ss.id = g.semester_subject_id
           WHERE ss.semester_id = ${semesterId}
           GROUP BY g.id
        ) sub
       WHERE sg.id = sub.id
         AND sg.assigned_count IS DISTINCT FROM sub.total`;

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'allocation.run',
        entityType: 'semester',
        entityId: semesterId,
        payload: {
          colocados: colocados.length,
          sinLugar: sinLugar.length,
          ranksRequired: semestre.ranksRequired,
        },
      },
    });

    return { colocados: colocados.length, sinLugar: sinLugar.length };
  });
}
```

Por qué el advisory lock y no `SERIALIZABLE`: el allocator corre una vez,
disparado a mano por un admin. El riesgo real no es alumno-contra-alumno, es
**dos admins dando click a la vez**. El lock los encola de forma predecible;
`SERIALIZABLE` los haría fallar con error 40001 y obligaría a implementar
reintentos para nada.

### 7.4 Overrides manuales

`PATCH /api/admin/assignments/:id` mueve a un alumno a otro grupo **del mismo
semestre**. Reglas:

- Toma el **mismo advisory lock** que el allocator. Si no, un override
  concurrente con una corrida vuelve a abrir la puerta al sobrecupo.
- Actualiza `group_assignments` con `is_manual_override = true` y
  `assigned_by_id = admin.id`.
- Si el alumno estaba `unplaced`, su `status` pasa a `allocated` en la misma
  transacción. **Esto era un bug del diseño anterior**: el conteo de ocupación
  filtraba por `status = 'allocated'`, así que un alumno movido a mano sin
  actualizar su estado no contaba contra el cupo y el grupo se sobrellenaba.
- Recalcula `assigned_count` de los dos grupos afectados. El CHECK aborta la
  transacción si el destino no tenía lugar.
- Escribe `audit_log` con `action = 'assignment.override'`.
- **Exige `notes` con contenido** (`400 NOTE_REQUIRED`). Una excepción sin el
  motivo escrito no es auditable seis meses después.
- Si el grupo destino **no** es ninguna de las preferencias del alumno,
  `assigned_rank` queda en `NULL` — no en `0`. El `0` violaba el CHECK
  `assigned_rank >= 1` y abortaba toda la transacción, que era justo el caso
  más común de la pantalla de Asignaciones: colocar a un `unplaced` donde haya
  lugar. Ver la migración `20260828224217_assigned_rank_nullable_for_overrides`.

`POST /api/admin/semesters/:id/assignments` hace lo mismo para un alumno que
todavía **no tiene** asignación (extiende la superficie documentada acá, que
sólo contemplaba mover una existente): mismas reglas, más `409 ALREADY_ASSIGNED`
si el alumno ya tenía grupo.

---

## 8. Endpoints

Envelope del proyecto: `{ data, message }`. `data` es `true`, un objeto o un
array en éxito; `false` en fallo.

### Portal público (sin auth, rate-limited)

| Método | Path | Función |
|---|---|---|
| `GET` | `/api/taev/status` | Estado de la ventana + `serverTime` + `ranksRequired` + asignaturas ofrecidas. Acepta `?campus=prepa-2` |
| `POST` | `/api/taev/verify-code` | `code` → ¿puede continuar? |
| `POST` | `/api/taev/submit` | Crea `form_submissions` + preferencias en una transacción |

`verify-code` **no devuelve un booleano**: tiene que distinguir cuatro casos, y
el Frontend ramifica por el `message` machine-readable.

| Situación | HTTP | `message` |
|---|---|---|
| Ventana cerrada | `403` | el `reason` de §6.4 |
| Código con formato inválido | `400` | `INVALID_CODE_FORMAT` |
| No está en el padrón | `404` | `CODE_NOT_FOUND` |
| Está pero ya envió | `409` | `ALREADY_SUBMITTED` |
| Puede continuar | `200` | `data: { studentName, semesterLabel, subjects[] }` |

`submit` además:
- Re-valida la ventana **dentro** de la transacción (§6.3).
- Valida que las preferencias sean exactamente `ranks_required`, sin ranks ni
  asignaturas repetidas, y que todas pertenezcan a la oferta activa del
  semestre.
- Mapea la violación de unicidad de Prisma (`P2002`) a `409 ALREADY_SUBMITTED`,
  no a un `500`. Es el caso real de doble click o dos pestañas.

### Panel admin (JWT + `assertCampusAccess` en todos)

| Método | Path | Función |
|---|---|---|
| `POST` | `/api/admin/auth/login` | login (JWT) |
| `GET` | `/api/admin/auth/me` | identidad fresca del token |
| `GET` | `/api/admin/campuses` | listar campus (superadmin global; los demás ven el suyo) |
| `GET` | `/api/admin/subjects` | catálogo maestro — **paginado**, `?search=&isActive=&sort=` |
| `GET` | `/api/admin/subjects/options` | catálogo sin paginar (id/code/name) para selectores |
| `POST` · `PATCH` | `/api/admin/subjects[/:id]` | alta y edición en el catálogo |
| `POST` · `GET` · `PATCH` | `/api/admin/semesters[/:id]` | CRUD de semestres |
| `PATCH` | `/api/admin/semesters/:id/window` | cambiar `window_mode` — **el kill switch** |
| `PATCH` | `/api/admin/semesters/:id/current` | marcar como semestre activo del campus |
| `DELETE` | `/api/admin/semesters/:id/current` | quitar el semestre activo — el campus queda sin ninguno y el portal cierra (`NO_ACTIVE_SEMESTER`); `409` si el semestre no era el activo |
| `GET` | `/api/admin/semesters/:id/students` | padrón — **paginado**, `?page=&pageSize=&search=&isActive=&hasSubmission=&sort=` |
| `POST` | `/api/admin/semesters/:id/students` | alta individual en el padrón |
| `PATCH` · `DELETE` | `/api/admin/semesters/:id/students/:studentId` | editar / dar de baja |
| `POST` | `/api/admin/semesters/:id/students/bulk` | subir padrón (CSV) |
| `GET` | `/api/admin/semesters/:id/submissions` | envíos recibidos — **paginado**, orden `submitted_at DESC`, `?page=&pageSize=&search=&status=` (la pantalla "Envíos en vivo") |
| `GET` · `POST` · `PATCH` | `/api/admin/semesters/:id/subjects[/:offeringId]` | la oferta del semestre |
| `POST` · `PATCH` | `/api/admin/semesters/:id/groups[/:groupId]` | grupos y cupos |
| `POST` | `/api/admin/semesters/:id/allocate` | disparar la asignación |
| `GET` | `/api/admin/semesters/:id/overview` | dashboard: cupos restantes, contadores |
| `POST` | `/api/admin/semesters/:id/assignments` | colocar a mano a un alumno sin lugar |
| `PATCH` | `/api/admin/assignments/:id` | mover un alumno a mano |
| `GET` | `/api/admin/audit-log` | bitácora — **paginada**, `?search=&action=&entityType=` |

**Baja del padrón (`DELETE`)**: si el alumno ya envió su formulario NO se borra
— se desactiva (`is_active = false`). Borrarlo arrastraría su `form_submission`
en cascada y con ella el orden de llegada del resto.

#### Forma de los listados paginados

Todo listado paginado devuelve la MISMA forma, para que el panel tenga una sola
tabla y no una por endpoint:

```jsonc
{ "data": { "rows": [ /* … */ ], "total": 1234, "page": 1, "pageSize": 25 } }
```

`page`, `pageSize`, `search` y `sort` los sanitiza `Backend/utils/queryParams.js`
antes de llegar al modelo: valores fuera de rango caen al default en vez de
tirar un error, y `sort` sólo acepta las columnas que el endpoint declara (no se
interpola nunca lo que mande el cliente).

---

## 9. Migración, constraints y verificación

### 9.1 Estado actual

La migración inicial ya está generada y **verificada contra PostgreSQL 16**:

```
Backend/prisma/migrations/20260827000000_init_taev/migration.sql
```

Contiene el DDL de Prisma, los constraints de
[`002_constraints.sql`](../Database/schemas/002_constraints.sql) pegados al
final, y el seed del campus `prepa-2` (necesario porque `semesters.campus_id`
es `NOT NULL`). No tiene ni un `DROP`, `TRUNCATE` ni `DELETE`.

Para aplicarla en local:

```bash
cd Backend
npm run prisma:migrate:deploy   # aplica sin regenerar
npm run prisma:generate

# Datos para trabajar: semestre abierto, 7 asignaturas, 21 grupos, 30 alumnos
docker exec -i taev-db psql -U postgres -d taev_udeg_prepa2 \
  < ../Database/seeds/001_demo_semester.sql
```

El seed ([`Database/seeds/001_demo_semester.sql`](../Database/seeds/001_demo_semester.sql))
es idempotente y trae en su encabezado los `UPDATE` para poner la ventana en
cada uno de sus estados. Sólo para local.

### 9.2 La trampa número uno

**Prisma no genera CHECK constraints ni índices parciales.** Si algún día
regeneras la migración inicial desde cero, Prisma **no** re-emite nada de
`002_constraints.sql` — hay que volver a pegarlo a mano. Sin ese bloque el
esquema queda estructuralmente correcto pero sin ninguna de sus garantías:
códigos de cualquier longitud, cupos sobrepasables, dos semestres activos.

### 9.3 Otras dos trampas ya resueltas

- **`DateTime` de Prisma mapea a `timestamp(3)` SIN zona.** Todo campo
  temporal lleva `@db.Timestamptz(6)` explícito. En un sistema que depende de
  "el 22 de agosto a las 10:00 exactas", esto no es cosmético.
- **`BigInt` de Prisma rompe `res.json()`.** Por eso `audit_log.id` es `Int`.

### 9.4 Test de regresión del esquema

[`Database/scripts/verify_constraints.sql`](../Database/scripts/verify_constraints.sql)
verifica que la base **rechaza** las 27 violaciones que debe rechazar: códigos
de 8 y 10 dígitos, dos semestres activos en el mismo campus, admin sin campus,
sobrecupo, doble envío, preferencias que cruzan semestres. Correrlo cada vez
que se toque el esquema; las instrucciones están en el encabezado del archivo.

### 9.5 Convención para cambios futuros

1. Editar `Backend/prisma/schema.prisma`.
2. `npm run prisma:migrate:dev -- --create-only --name <nombre_descriptivo>`.
3. **Leer el `migration.sql`.** Si tiene `DROP`, `TRUNCATE`, `DELETE` o un
   cambio de tipo sobre una columna con datos: parar y usar expand/contract.
4. Si el cambio necesita un CHECK o un índice parcial, agregarlo a mano al
   final del archivo **y** a `002_constraints.sql`.
5. Aplicar en local, correr `verify_constraints.sql` y `npm test`.
6. Commitear la carpeta de migración junto con el schema.

---

## 10. Decisiones cerradas

Ya no hay decisiones abiertas en el modelo. Éstas quedaron fijas:

| # | Tema | Decisión |
|---|---|---|
| 1 | Sin cupo en ninguna preferencia | `status = 'unplaced'`. Sin waitlist automática; el admin coloca a mano y queda trazado |
| 2 | ¿Envío modificable? | **No.** `form_submissions` es inmutable |
| 3 | Override manual post-asignación | **Sí**, con `is_manual_override` + `assigned_by_id` + `audit_log` |
| 4 | Datos del alumno en el padrón | `full_name`, `email`, `career` todos opcionales |
| 5 | Multi-campus | **Día 1.** `campuses` migrada, `semesters.campus_id NOT NULL` |
| 6 | Notificaciones | No día 1. Documentada en el DBML, no migrada |
| 7 | Horario por grupo | No día 1. Documentada en el DBML, no migrada |
| 8 | Auditoría | **Día 1**, no opcional |
| 9 | Longitud del código | **Exactamente 9 dígitos**, con CHECK |
| 10 | Estado `partial` | **Eliminado.** No se declara un valor de enum que ningún camino produce: en PostgreSQL no se puede quitar después |
| 11 | Folio de comprobante | **Eliminado.** El alumno ve el `label` del semestre |

---

## 11. Referencias cruzadas

- **Para implementar la API**: [`Docs/HANDOFF.md`](./HANDOFF.md) — contratos
  exactos de los endpoints, desajustes del Frontend, orden de trabajo.
- Dominio y reglas de negocio: [`Docs/TAEV-DOMAIN.md`](./TAEV-DOMAIN.md)
- Seed de demo: [`Database/seeds/001_demo_semester.sql`](../Database/seeds/001_demo_semester.sql)
- Esquema (fuente de verdad): [`Backend/prisma/schema.prisma`](../Backend/prisma/schema.prisma)
- Constraints: [`Database/schemas/002_constraints.sql`](../Database/schemas/002_constraints.sql)
- Test de regresión: [`Database/scripts/verify_constraints.sql`](../Database/scripts/verify_constraints.sql)
- ERD: [`Database/schemas/001_taev.dbml`](../Database/schemas/001_taev.dbml)
- Ventana de envío: [`Backend/utils/semesterWindow.js`](../Backend/utils/semesterWindow.js)
- Stack: [`Docs/STACK-SETUP.md`](./STACK-SETUP.md) · Arquitectura: [`Docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
