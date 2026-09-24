# TAEV — Dominio y reglas de negocio

Documento fundacional. Define **qué es TAEV**, **qué hace el sistema** y **qué
reglas rigen el comportamiento** de los tres actores (administrador, alumno,
motor de asignación). Cualquier agente que toque este proyecto debe leerlo
antes de modelar o tocar el Backend.

> **Audiencia**: futuros agentes (humanos o IA), contribuidores nuevos, y uno
> mismo dentro de seis meses.
>
> **Status**: fuente de verdad del dominio. Si una decisión de UI o de Backend
> entra en conflicto con lo escrito acá, gana este documento y se corrige el
> código. Para el **cómo** técnico, ver [`Docs/DATABASE.md`](./DATABASE.md).

---

## 1. Qué es TAEV

**TAEV** = *Trayectorias de Aprendizaje Especializante y Vinculación*
(Universidad de Guadalajara — Sistema de Educación Media Superior).

Es el proceso donde cada alumno de preparatoria elige en qué asignatura-tema va
a profundizar durante el semestre, dentro de un catálogo fijo de opciones
(Diseño, Arte, Serigrafía, Salubridad, Ética, Robótica, Emprendimiento…).

El problema operativo:

- Los alumnos son muchos y las asignaturas tienen **cupo limitado**.
- La elección es por **orden de llegada**: el primero que envía tiene prioridad.
- La ventana de envío es **muy corta** (típicamente 10–15 minutos), porque abre
  y cierra en una sola sentada.
- Hay **una sola asignación final por alumno**: entra a un solo grupo de una
  sola asignatura.
- Si su primera preferencia está llena, baja a la segunda; si esa también, a la
  tercera. Si todas están llenas, queda sin lugar.

### 1.1 Alcance: una plataforma, varias escuelas

El sistema arranca en **Preparatoria No. 2**, pero está modelado como
plataforma multi-escuela desde el día 1. Cada escuela (*campus*) corre su
propio ciclo, completamente independiente:

| Cada campus tiene lo suyo | Se comparte en toda la red |
|---|---|
| Su padrón de alumnos | El catálogo maestro de asignaturas |
| Su oferta de asignaturas | |
| Sus grupos y cupos | |
| Su ventana de envío | |
| Su semestre activo | |
| Sus administradores | |

Que el catálogo sea compartido significa que "Robótica" es **la misma
asignatura** en toda la red, aunque sólo algunas escuelas la oferten. Eso hace
que un reporte cruzado ("cuántos eligieron Robótica en toda la red") sea
inmediato, en vez de tener que casar nombres entre bases separadas.

Hoy existe un solo campus (`prepa-2`) y nada de esto se nota en la operación.
La razón de tenerlo desde el principio es técnica: agregar la escuela como
columna obligatoria **después**, con inscripciones reales en la base, obliga a
una migración con downtime. Ahora cuesta cero.

---

## 2. Roles

| Rol | Quién | Qué puede hacer |
|---|---|---|
| **Superadmin** | Coordinación de la red | Todo lo de admin, en **todos** los campus. Da de alta escuelas y administradores. |
| **Administrador** | Coordinador / jefe de academia de **una** escuela | Crea semestres, sube padrones, define oferta y cupos, abre y cierra la ventana, ejecuta y revisa la asignación — siempre dentro de su campus. |
| **Viewer** | Personal de consulta de una escuela | Sólo lectura, dentro de su campus. |
| **Alumno** | Estudiante UDEG con código de 9 dígitos | Teclea su código, ve las asignaturas ofertadas, ordena sus preferencias, envía. Una sola vez por semestre. |
| **Motor de asignación** | Lógica del Backend | Cuando el admin lo dispara, reparte alumnos a grupos en orden de `submitted_at`. |

Reglas de alcance que **no son negociables**:

- Un `admin` o un `viewer` **siempre** pertenece a un campus. Un usuario de
  esos roles sin escuela sería omnipotente en silencio, así que la base lo
  rechaza.
- Sólo un `superadmin` puede tener alcance global.
- El alcance se verifica **en cada request** contra la base, nunca confiando en
  lo que venga en el token.

El alumno **no tiene cuenta**. Su única credencial es el código de 9 dígitos,
validado contra el padrón del semestre activo de su escuela. No hay OTP ni
correo de confirmación: la responsabilidad de subir un padrón limpio es del
admin.

---

## 3. Flujo end-to-end

```
┌──────────────────────┐                        ┌──────────────────────┐
│        ADMIN         │                        │        ALUMNO        │
└──────────┬───────────┘                        └───────────┬──────────┘
           │                                                │
   1. Crea el semestre de SU campus                          │
      "2026A" + opens_at + duración                          │
           ▼                                                │
     ┌──────────────┐                                        │
     │   semestre   │  (uno activo por campus)               │
     └──────┬───────┘                                        │
            │                                                │
   2. Sube el padrón (CSV)  ──▶ semester_students            │
            │                    ~ miles de códigos          │
            │                                                │
   3. Define la oferta      ──▶ semester_subjects            │
      y los grupos con cupo ──▶ subject_groups               │
            │                                                │
   4. Abre la ventana                                        │
      (window_mode = scheduled)                              │
            ▼                                                │
  ╔═════════════════════════════════════════════════════════╪═════╗
  ║             VENTANA ACTIVA                              │     ║
  ║   scheduled → NOW() ∈ [opens_at, closes_at)             │     ║
  ║   force_open → siempre abierta                          │     ║
  ║   force_closed → SIEMPRE CERRADA (kill switch)          │     ║
  ╚═════════════════════════════════════════════════════════╪═════╝
            │                                                │
            │                        5. Teclea su código de 9 dígitos
            │                                                ▼
            │                                    ┌───────────────────────┐
            │                                    │ ¿ventana abierta?     │
            │                                    │ ¿está en el padrón?   │──no──▶ error
            │                                    │ ¿ya envió?            │       explicado
            │                                    └───────────┬───────────┘
            │                                              sí │
            │                                                ▼
            │                        6. Ordena sus N preferencias
            │                           (asignatura + rank 1..N)
            │                                                │
            │                        7. Confirma el envío     ▼
            │                                    ┌────────────────────────┐
            │                                    │   form_submissions     │
            │                                    │   submitted_at = NOW() │
            │                                    │   (server time)        │
            │                                    └───────────┬────────────┘
            │                                                │
            │  ← se revalida la ventana DENTRO de la transacción del envío
            │                                                │
  ╔═════════════════════════════════════════════════════════╪═════╗
  ║   La ventana cierra (por reloj o por kill switch)        │     ║
  ╚═════════════════════════════════════════════════════════╪═════╝
            │                                                │
   8. Dispara la asignación                                   │
            ▼                                                │
     ┌──────────────────────┐                                │
     │ Motor de asignación  │ ◀── orden: submitted_at ASC, id ASC
     │ (una transacción)    │
     └──────────┬───────────┘
                ▼
     ┌──────────────────────┐
     │  group_assignments   │  1 fila por alumno colocado
     │  status: allocated   │  o status = unplaced
     └──────────────────────┘
                │
   9. Revisa, mueve a mano lo que haga falta,
      publica los resultados
```

---

## 4. El semestre

### 4.1 Todo cuelga de un semestre

- **Padrón, oferta, grupos, envíos y asignaciones son siempre *de* un
  semestre** — y por lo tanto de un campus.
- **Un semestre activo por escuela.** El alumno que entra al portal siempre
  interactúa con el semestre marcado como actual de su campus. La base
  garantiza que no pueda haber dos: si hubiera, "el semestre activo" sería
  ambiguo y el sistema devolvería resultados no deterministas en el peor
  momento posible.
- **Los códigos NO son globales, son por semestre.** El alumno `218327451`
  puede ser válido en `2026A` y no en `2026B` (egresó, cambió de plantel…).
- **El catálogo de asignaturas sí es global.** El admin reutiliza "Robótica"
  semestre a semestre y escuela a escuela. Lo que cambia es *qué se oferta* y
  *qué grupos con cupo se abren*.
- `"2026A"` existe **una vez por escuela**, no una vez en todo el sistema.

### 4.2 Cuántas preferencias

Configurable **por semestre** (`ranks_required`, default 3). El portal lee ese
número del Backend, no de una constante compilada: si un semestre pide 3 y otro
pide 5, ambos funcionan sin tocar el Frontend.

---

## 5. La ventana de envío

### 5.1 El admin necesita tres cosas, no dos

El diseño original combinaba un horario programado con un interruptor manual
mediante un *o lógico*: abierto si estamos en horario **o** si el switch está
prendido. Eso deja al admin sin la acción más importante de todas: **cerrar
antes de tiempo**. Con el switch apagado a mitad de la ventana programada, el
formulario seguía abierto.

En una ventana de 15 minutos en vivo, eso es exactamente lo que se necesita
cuando algo sale mal: se filtró el enlace, se subió el padrón equivocado, se
abrió sin querer. Un booleano no puede expresar tres intenciones distintas.

### 5.2 Tres modos con precedencia absoluta

| Modo | Qué hace | Cuándo se usa |
|---|---|---|
| `scheduled` | Manda el reloj: abierto entre la hora de apertura y la de cierre | Operación normal |
| `force_open` | **Abierto**, sin importar la hora | Reabrir para un rezagado, o abrir antes |
| `force_closed` | **CERRADO**, sin importar la hora | **Kill switch**: parar todo, ya |

`force_closed` gana sobre todo lo demás. No es una condición más dentro de un
*o lógico*: es lo primero que se evalúa, y si está puesto, no se mira el reloj.
Esa es toda la diferencia entre un switch que funciona y uno que no.

### 5.3 Garantías operativas

1. **La hora la pone el servidor.** El navegador del alumno puede estar
   desfasado varios minutos; el sistema le informa la hora real del servidor
   para que la cuenta regresiva sea honesta, pero **nunca** decide con el reloj
   del cliente.
2. **La ventana se revalida al enviar.** Pasar la verificación del código a las
   10:14:59 no da derecho a enviar a las 10:20. El chequeo se repite dentro de
   la misma operación que guarda el envío.
3. **Cada cambio de modo queda auditado.** Cuando alguien pregunte "¿por qué
   cerró a las 10:07?", la respuesta está en la bitácora, con quién y cuándo.
4. **Una sola pieza de código decide.** Todo el sistema — portal, panel, API —
   consulta la misma función. No hay una segunda implementación que pueda
   discrepar.

Los bordes exactos (el instante de apertura cuenta como abierto; el instante de
cierre ya cuenta como cerrado) están cubiertos por tests automatizados.

---

## 6. Identidad del alumno

El alumno se identifica con su **código UDEG de exactamente 9 dígitos**.

Reglas:

1. Son **9 dígitos numéricos, ni uno más ni uno menos**. Se valida en el
   navegador, en la API y en la base de datos con un CHECK. Las tres capas
   dicen lo mismo.
2. El código debe existir en el padrón del **semestre activo de su escuela** y
   estar activo.
3. Si ya tiene un envío registrado, no puede volver a entrar: se le muestra
   "ya completaste tu registro".
4. No hay autenticación más allá del código.

La verificación del código **no devuelve un sí/no**. Distingue cuatro
situaciones, porque cada una necesita un mensaje distinto para el alumno:

| Situación | Qué ve el alumno |
|---|---|
| La ventana está cerrada | Por qué está cerrada (todavía no abre / ya cerró / cerrada por la coordinación) |
| El formato del código es inválido | "Deben ser 9 dígitos" |
| No está en el padrón | "No encontramos ningún alumno con ese código" |
| Ya envió | "Ya completaste tu registro" |
| Puede continuar | Su nombre y la lista de asignaturas ofertadas |

---

## 7. Preferencias y asignación

### 7.1 El formulario

- El alumno ve las asignaturas **ofertadas y activas** de su semestre.
- Debe asignar rank `1`, `2`, … hasta `ranks_required` a asignaturas
  **distintas**. No puede repetir asignatura ni repetir rank: lo impide la UI y
  lo impide la base.
- Al confirmar, se registra el envío con la **hora exacta del servidor** más
  sus preferencias, todo en una sola operación atómica.
- Después del envío **no se puede modificar**. Si hay que corregir algo, lo
  hace el admin moviendo la asignación, y queda trazado.
- Al terminar, el alumno ve la confirmación con el **label del semestre**
  (`2026-A`) y su orden de preferencias. No hay folio: un número de comprobante
  que el sistema no guarda en ningún lado no sirve para nada.

### 7.2 Estados de un envío

| Estado | Significado |
|---|---|
| `pending` | Envió, todavía no se ejecutó la asignación |
| `allocated` | El motor (o el admin) le asignó un grupo |
| `unplaced` | Todas sus preferencias estaban llenas. Sin lugar |

No hay más estados. Un valor de enum que ningún proceso produce es deuda pura:
en PostgreSQL no se puede eliminar después.

### 7.3 Cómo reparte el motor

Recorre los envíos **en orden estricto de llegada** y, para cada alumno,
intenta sus preferencias en orden:

1. Toma su rank 1. Busca un grupo de esa asignatura con lugar, en el orden de
   llenado definido por el admin.
2. **Si todos los grupos de esa asignatura están llenos, pasa al rank 2.** Y
   después al 3, y así. Sólo se abandona al alumno cuando se agotaron *todas*
   sus preferencias.
3. Al colocarlo, ocupa un lugar y pasa al siguiente alumno.
4. Si ninguna preferencia tenía lugar, queda `unplaced`.

Propiedades que el motor garantiza:

- **El orden de llegada es la equidad del sistema.** Se ordena por hora de
  envío y, ante empate exacto, por el identificador del envío. Sin ese
  desempate, dos corridas podrían dar resultados distintos.
- **Sólo considera oferta activa.** Una asignatura desactivada o un grupo
  desactivado no reciben a nadie, aunque alguien los haya elegido.
- **Ningún grupo puede exceder su cupo.** No sólo por la lógica del motor: la
  base de datos lo rechaza. Si algo intentara sobrepasarlo, la operación
  completa se cancela en vez de dejar datos corruptos.
- **Se puede volver a correr.** A los ya colocados no los toca. A los que
  quedaron sin lugar **sí los vuelve a considerar**, en su posición cronológica
  original. Es el escenario real: *"abrí un grupo más, volvé a correr"*.
- **Dos admins no se pisan.** Si dos disparan la asignación a la vez, el
  sistema los encola; no compiten por los mismos cupos.

### 7.4 Ajustes manuales

El admin puede mover a un alumno a otro grupo del mismo semestre después de la
asignación automática. Queda registrado como movimiento manual, con quién lo
hizo y cuándo. El grupo destino debe tener lugar — si no, la operación se
rechaza.

Si mueve a un alumno que había quedado sin lugar, su estado se actualiza en la
misma operación. (Antes esto era un hueco: un alumno colocado a mano sin
actualizar su estado no contaba contra el cupo, y el grupo se sobrellenaba.)

---

## 8. Qué pasa con los alumnos sin lugar

Cuando las preferencias de un alumno están todas llenas queda `unplaced`. **No**
se le asigna una asignatura al azar ni "la que tenga más cupo": eso rompería el
principio de preferencia y sería peor que no asignarle nada, porque el alumno
terminaría en algo que no eligió sin saber por qué.

Qué sigue es una decisión operativa del coordinador, y el sistema le da las dos
herramientas: la lista de quiénes quedaron fuera, y la capacidad de colocarlos a
mano (abriendo un grupo nuevo, ampliando un cupo, o ubicándolos donde haya
lugar) con todo el movimiento trazado.

---

## 9. Extensibilidad

Lo que el modelo soporta **sin cambios destructivos**:

| Extensión futura | Cómo se agrega |
|---|---|
| Más escuelas (PREPA 3, PREPA 4…) | Ya está. Alta en `campuses` + admins de ese campus |
| Asignatura exclusiva de una escuela | `subjects.campus_id` nullable (NULL = compartida) |
| Más o menos preferencias | Ya está: `ranks_required` por semestre |
| Horarios por grupo | Tabla `subject_group_schedules`, documentada en el DBML |
| Notificaciones por correo | Tabla `notifications` + worker, documentada en el DBML |
| Reabrir para un alumno puntual | `force_open` + el admin cierra al terminar |
| Historial de quién hizo qué | Ya está: `audit_log` desde el día 1 |

Lo que **rompería** el modelo y exigiría una migración pensada:

- Pasar de "una asignatura por alumno" a "N asignaturas por alumno": la
  asignación dejaría de ser 1:1 con el envío.
- Cambiar el criterio de orden de "hora de envío" a cualquier otra cosa
  (sorteo, promedio, prioridad). El orden cronológico está en el corazón de
  todo el diseño.

---

## 10. Glosario

| Término | Definición |
|---|---|
| TAEV | Trayectorias de Aprendizaje Especializante y Vinculación |
| Campus / escuela | Plantel (`prepa-2`). Nivel raíz: cada uno corre su propio ciclo |
| Semestre | Período (`2026A`) de un campus. Unidad operativa del modelo |
| Asignatura | Materia-tema del catálogo compartido (Robótica, Ética…) |
| Oferta | Qué asignaturas se ofrecen en un semestre concreto |
| Grupo | Sección de una asignatura ofertada, con cupo limitado |
| Padrón | Lista de códigos válidos para un semestre |
| Preferencia | Rank que un alumno asigna a una asignatura ofertada |
| Envío | El registro del alumno. Inmutable |
| Asignación | El grupo final del alumno. Puede ser automática o manual |
| Ventana | Lapso durante el cual el formulario acepta envíos |
| Kill switch | `force_closed`: cierra el formulario sin importar la hora |
| Cupo | Máximo de alumnos en un grupo |

---

## 11. Referencias cruzadas

- **Diseño técnico de la BD**: [`Docs/DATABASE.md`](./DATABASE.md)
- **Esquema (fuente de verdad)**: [`Backend/prisma/schema.prisma`](../Backend/prisma/schema.prisma)
- **ERD visual**: [`Database/schemas/001_taev.dbml`](../Database/schemas/001_taev.dbml)
- **Lógica de la ventana**: [`Backend/utils/semesterWindow.js`](../Backend/utils/semesterWindow.js)
- **Arquitectura del stack**: [`Docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
