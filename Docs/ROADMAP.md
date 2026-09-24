# ROADMAP — de acá al evento real

Qué falta, en qué orden y por qué ese orden. Lo ya implementado está en
[`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md) (Fases 0–5).

**El criterio que ordena todo esto**: TAEV es un evento de 10–15 minutos que
pasa una vez por semestre y no se puede repetir. Una funcionalidad que falta se
puede suplir a mano; una que falla durante la ventana no. Por eso el
endurecimiento (Fase 10) va antes que los reportes y la gestión de usuarios,
aunque suene menos vistoso.

---

## Estado al cerrar la Fase 5

| Capa | Estado |
|---|---|
| Esquema + migración + constraints | ✅ |
| API pública (`/api/taev/*`) | ✅ |
| API admin (`/api/admin/*`) | ✅ |
| Allocator + overrides | ✅ |
| Capa `Backend/models/` | ✅ toda query vive ahí |
| Portal público | ✅ cableado |
| Panel: dashboard, semestres, padrón, catálogo, oferta/grupos, bitácora, envíos en vivo, asignaciones | ✅ |
| Panel: CSV, reportes, usuarios | ❌ visibles y apagados en el sidebar |
| Tests automatizados | 🟡 `semesterWindow.js` (19) + `allocation.service.js` (15) |

**Hoy se puede armar un evento completo desde el panel y operar el después** —
crear el semestre, cargar códigos uno por uno, armar la oferta con sus cupos,
abrir/cerrar la ventana, correr la asignación y acomodar a mano a los que
quedaron sin lugar — pero todavía no cargar un padrón real por CSV ni exportar
las listas finales.

---

## Orden recomendado

```
6. CSV del padrón      ← sin esto no hay evento real (cargar 2000 códigos a mano no existe)
7. Envíos + asignaciones ← sin esto no se opera el después del evento
10. Endurecimiento      ← antes que nada cosmético: es lo que decide si el día sale bien
8. Reportes             ← lo que la escuela pide una semana después
9. Usuarios             ← hoy se suple insertando una fila a mano
11. Extensiones          ← sólo si las piden
```

Las fases 6 y 7 son independientes entre sí; 10 conviene arrancarla en paralelo
porque su parte cara (la suite de tests) es incremental.

---

## Fase 6 — Importar padrón por CSV

**Por qué primero.** Es el único paso del armado que hoy no tiene camino
viable: control escolar entrega un archivo de cientos o miles de códigos y el
panel sólo tiene alta individual. El botón ya está en la UI, deshabilitado.

**El backend ya está hecho**: `POST /api/admin/semesters/:id/students/bulk` es
idempotente por `(semesterId, code)`, valida el formato con la regex de config,
rechaza duplicados dentro del lote y devuelve `{ total, created, updated }`.
Tope actual: 20.000 filas.

### Alcance

1. Modal de importación en `Padrón`: soltar/elegir archivo, detectar
   separador (`,` o `;` — Excel en español exporta con `;`), leer encabezados.
2. **Mapeo de columnas**: el archivo real nunca viene con nuestros nombres. Un
   selector por campo (`código` → qué columna, `nombre` → qué columna, etc.),
   con auto-detección por nombre de encabezado.
3. **Validación antes de escribir**: formato de 9 dígitos fila por fila,
   duplicados dentro del archivo, filas vacías. Se muestran los errores con su
   número de fila y no se manda nada hasta que el admin confirme.
4. **Preview**: cuántos son nuevos y cuántos ya están en el padrón (esto último
   requiere `dryRun`, ver abajo).
5. Envío **por lotes de ~500 filas** con barra de progreso, para que un archivo
   grande no viaje en un solo request de varios MB ni choque contra el límite
   de `express.json({ limit: '100kb' })`.

### Decisión abierta — parseo en el cliente o subida del archivo

**Recomendación: parsear en el cliente.** No agrega `multer` ni manejo de
archivos temporales al backend, el endpoint bulk ya acepta JSON, y un archivo
con errores nunca sale del navegador. El costo es que el parser vive en el
front (`papaparse`, ~7 kB, o unas 40 líneas propias si el CSV es simple).

Si más adelante se quiere un histórico de qué archivo se subió, ahí sí conviene
`multer` + guardar el original.

### Cambios necesarios

| Dónde | Qué |
|---|---|
| `Backend/services/admin.service.js` | `dryRun` en `bulkUploadStudents`: valida y cuenta contra el padrón existente sin escribir ni auditar |
| `Backend/models/student.model.js` | `findCodesInSemester(semesterId, codes)` — un `IN` para saber cuáles ya existen |
| `Admin/src/lib/csv.ts` | parseo + detección de separador |
| `Admin/src/components/forms/ImportRosterModal.tsx` | el flujo completo |
| `Admin/src/pages/StudentsPage.tsx` | habilitar el botón (hoy `disabled`) |

### Hecho cuando

- Un CSV de 1.000 filas con 3 códigos inválidos muestra las 3 filas con su
  número y **no escribe nada** hasta confirmar.
- Reimportar el mismo archivo reporta `0 creados / 1000 actualizados`.
- La bitácora tiene una entrada `students.bulk_upload` por importación.

---

## Fase 7 — Envíos y asignaciones

**Por qué.** Terminada la corrida del allocator, la pregunta operativa es
siempre la misma: *¿quiénes quedaron sin lugar y dónde los meto?* Hoy eso sólo
se responde por SQL.

### 7.1 Envíos (lectura) — ✅ Hecho (2026-08-28, ver IMPLEMENTATION-LOG Fase 7.1)

Listado paginado del semestre, **del más reciente al más antiguo**, pensado
para proyectarse durante la ventana: switch "En vivo" con auto-refresco de 30 s
sólo con la pestaña visible, cuenta regresiva con hora de servidor, tabla sin
encabezados (`código · nombre · 1ª preferencia`), y en modo en vivo un QR al
portal del alumno con el switch de salida fuera del viewport.

Implementado en:

| Dónde | Qué |
|---|---|
| `Backend/models/submission.model.js` | `listPaginated({ semesterId, status, search, skip, take })` — orden `submitted_at DESC, id DESC`, con preferencias y asignación embebidas |
| `Backend/services/admin.service.js` | `listSubmissions(user, semesterId, filters)` con `loadSemesterScoped` |
| `Backend/controllers/admin.controller.js` + `routes/admin.js` | `GET /semesters/:id/submissions` |
| `Admin/src/pages/SubmissionsPage.tsx` | ruta `/envios`; KPIs de `overview`, QR con `qrcode.react` |

### 7.2 Asignaciones (escritura) — ✅ Hecho (2026-08-28, ver IMPLEMENTATION-LOG Fase 7.2)

Pantalla `/asignaciones`: la cola de `unplaced` con el motivo de fallo de cada
preferencia, colocación y movimiento con nota obligatoria, y filtro por
asignatura/grupo para responder *"¿quiénes quedaron en Robótica A?"*.

Implementado en:

| Dónde | Qué |
|---|---|
| `Backend/prisma/migrations/20260828224217_assigned_rank_nullable_for_overrides/` | `assigned_rank` nullable + CHECK `IS NULL OR >= 1` |
| `Backend/services/allocation.service.js` | `assertNote()` (`NOTE_REQUIRED`); `assignedRank: matchingPref?.rank ?? null` |
| `Backend/models/submission.model.js` | filtros `groupId` / `semesterSubjectId`; `preferences[].semesterSubjectId` y `assignment.id/groupId/semesterSubjectId` en el payload |
| `Admin/src/pages/AssignmentsPage.tsx` | ruta `/asignaciones`; KPIs, filtros, "Ejecutar asignación" |
| `Admin/src/components/forms/PlaceAssignmentModal.tsx` | colocar/mover: sólo grupos con cupo, preferencias primero, nota obligatoria |
| `Admin/src/lib/assignmentReason.ts` | `llena` / `inactiva` / `con lugar ahora` cruzando la preferencia contra `overview.offerings` |
| `Backend/services/allocation.service.test.js` + `test/helpers/fixture.js` | 15 tests contra PostgreSQL real |

### Hecho cuando

- ✅ Se puede recorrer la lista de `unplaced` y colocarlos uno por uno sin salir
  de la pantalla.
- ✅ Cada movimiento aparece en la bitácora como `assignment.override` con el
  grupo de origen y el de destino.

**Encontrado y corregido en el camino:** `overrideAssignment` y
`placeSubmission` guardaban `assigned_rank = 0` cuando el destino no era
ninguna de las preferencias del alumno — que es *el* caso de esta pantalla — y
eso violaba el CHECK `assigned_rank >= 1`: la transacción abortaba y el admin
recibía un 500 opaco. Ahora la columna es nullable y `NULL` significa
"colocado fuera de sus preferencias", que además es dato mostrable en la tabla.

---

## Fase 10 — Endurecimiento para el día del evento

> Va tercera, no última. Es la única fase cuyo fracaso no se puede arreglar
> después.

### 10.1 El riesgo concreto que hay que resolver ya

`TAEV_SUBMIT_RATE_LIMIT_MAX` está en **10 envíos por minuto por IP**. Si toda
la prepa envía desde la red de la escuela, salen todos por **una sola IP
pública** y el limiter corta a partir del alumno 11. El sistema entero se
frena por una defensa contra abuso que en este escenario apunta al lugar
equivocado.

Opciones, en orden de preferencia:

1. **Whitelist de las IPs de la escuela** (`skip` del limiter) y dejar el
   límite estricto para el resto de internet. Requiere que la escuela diga cuál
   es su IP de salida — pedirlo con tiempo.
2. Subir el límite y agregar un límite por `code` además de por IP: un alumno
   envía una vez, y la unicidad de la BD ya lo garantiza.
3. Desactivar el limiter en la ventana y confiar en el resto de las defensas
   (no recomendado: deja el endpoint abierto).

**Decisión pendiente. Hay que tomarla antes del primer evento real.**

### 10.2 Tests automatizados de endpoints

Hoy sólo `semesterWindow.js` tiene tests (19). Lo que falta cubrir, en orden de
riesgo:

| Qué | Por qué duele si falla |
|---|---|
| ✅ Allocator: orden de llegada estricto | Es *la* promesa del sistema |
| ✅ Allocator: fallthrough de preferencia 1→2→3 | Un alumno queda sin lugar teniendo su 2ª libre |
| ✅ Allocator: re-corrida idempotente | Correr dos veces duplica asignaciones |
| ✅ Cupo: no se puede sobrepasar con un override | Un grupo con 31 alumnos y 30 sillas |
| ❌ Cupo: dos overrides **concurrentes** por el último asiento | Necesita dos conexiones peleando por el advisory lock |
| ❌ Ventana revalidada dentro de la transacción | Envíos después del cierre |
| ✅ Alcance por campus (allocator y overrides) | Un admin de PREPA 2 tocando PREPA 3 |

Con `node:test` contra PostgreSQL real. Lo marcado ✅ se hizo en la Fase 7.2
(`Backend/services/allocation.service.test.js`, 15 tests). El harness
(`Backend/test/helpers/fixture.js`) **no hace `TRUNCATE`**: cada test crea su
propio campus desechable y lo borra al terminar, así que se puede correr contra
la base de desarrollo sin perder el semestre demo. Sin dependencias nuevas — es
la convención del repo.

### 10.3 Ensayo de carga

Simular el padrón completo enviando dentro de la misma ventana. Qué mirar:

- Que `submitted_at` ordene bien con empates (el desempate por `id` ya está en
  el índice).
- Cuánto tarda una corrida del allocator con N envíos reales.
- Que el pool de conexiones de Prisma aguante la concurrencia.

### 10.4 Checklist del día

Un documento corto y operativo: a qué hora se marca el semestre como activo, a
qué hora se abre, quién tiene el kill switch a mano, qué se mira mientras corre
la ventana, y en qué orden se cierra y se asigna.

---

## Fase 8 — Reportes y exportables

Lo que la escuela pide después:

1. **Lista por grupo** — para el profesor: quiénes están en Robótica grupo A.
2. **Lista por alumno** — para control escolar: código, nombre, asignatura y
   grupo asignados.
3. **Resumen de ocupación** — cuántos lugares quedaron libres por asignatura.

**Formato: CSV generado en el servidor** (`text/csv` + `Content-Disposition`).
Un XLSX en el cliente agrega una dependencia pesada y la escuela abre el CSV
en Excel igual. Si piden XLSX de verdad, se evalúa ahí.

Las queries van a `models/` como todo lo demás — probablemente en un
`report.model.js` con los joins agregados.

---

## Fase 9 — Usuarios y roles

Hoy un admin nuevo se crea insertando una fila con un hash de
`Backend/scripts/hash-string.js`. Funciona, pero no escala a varias escuelas.

Alcance: alta, edición, desactivar, reset de contraseña. Los guards ya existen
(`requireRole`, `assertCampusAccess`) y el CHECK `users_campus_scope` garantiza
que un admin/viewer siempre tenga campus.

**Las dos reglas que hay que hacer cumplir en el service**, porque el esquema
no las expresa:

- Un `admin` no puede crear un `superadmin` ni cambiarle el rol a nadie hacia
  arriba.
- Un `admin` no puede mover a un usuario a otro campus. Sólo el superadmin
  global.

---

## Fase 11 — Extensiones documentadas y NO migradas

Están en [`001_taev.dbml`](../Database/schemas/001_taev.dbml) y deliberadamente
fuera del esquema (`DATABASE.md` §5). El modelo las aguanta sin cambios
destructivos:

- `subject_group_schedules` — horario, salón y profesor por grupo. Se vuelve
  necesario cuando el reporte por grupo tenga que decir *cuándo y dónde*.
- `notifications` — cola de correos post-asignación. Requiere decidir el
  proveedor de envío, que hoy no existe en el stack.

**No se crean hasta que alguien las escriba.** Una tabla que nadie llena sólo
agrega superficie que mantener.

---

## Pendientes transversales (no son una fase)

| Qué | Detalle |
|---|---|
| **Prueba de navegador** | Ninguno de los dos frontends se recorrió en un navegador real. Se validaron con typecheck + build + curl de cada endpoint que consumen. |
| **Password de demo desalineada** | El hash de `admin@prepa2.local` en la base local **no** corresponde a `taev-demo-2026`. O se resetea con `scripts/hash-string.js`, o se actualiza el dato en los docs. |
| `npm audit` | 3 vulnerabilidades preexistentes en la cadena de `prisma` (devDependency). No se tocaron. |
| Warnings del build del Admin | Astro avisa que hay `.tsx` en `src/pages/` (9 warnings por build). Se resuelve moviendo las páginas React a `src/views/`; es cosmético y no se hizo para no tocar la estructura del scaffold. |
| `index.astro` del Frontend | "Prepa 2 UDG" hardcodeado. Hay que sacarlo a config o a la API antes de operar multi-campus. |

---

## Referencias

- [`IMPLEMENTATION-LOG.md`](./IMPLEMENTATION-LOG.md) — qué se hizo en las Fases 0–5.
- [`TAEV-DOMAIN.md`](./TAEV-DOMAIN.md) — las reglas de negocio que ninguna fase puede romper.
- [`DATABASE.md`](./DATABASE.md) — esquema, allocator (§7), endpoints (§8).
- [`../Backend/models/README.md`](../Backend/models/README.md) — dónde va cada query.
