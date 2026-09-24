---
name: backend
description: Convenciones para la API (Backend/) — Node.js + Express 5 + Prisma contra PostgreSQL. Usar al leer o editar cualquier archivo bajo Backend/ — controllers, rutas, middlewares, schema, migraciones.
---

# Backend — TAEV-UDEG-PREPA2

Express 5 + Prisma contra PostgreSQL 14+. ES modules (`"type": "module"`),
siempre `import`/`export`, nunca `require`.

## Layout

```
Backend/
├── app.js                # middleware + rate limiters + 404/error handlers
├── server.js              # entry point + startup checks + graceful shutdown
├── config/                 # main.js (env, CORS, puerto), db.js (Prisma singleton)
├── routes/                  # express.Router() por feature
├── controllers/              # sanitizan input y arman la respuesta
├── services/                  # reglas de negocio, transacciones, auditoría
├── models/                     # LAS QUERIES. Único lugar que importa `prisma`
├── middlewares/                 # auth, alcance por campus, rate limiters
├── utils/                        # helpers puros (queryParams, apiError, ventana)
└── prisma/
    ├── schema.prisma              # fuente de verdad del esquema
    ├── build-database-url.js      # arma DATABASE_URL desde DB_*
    └── migrations/                 # archivos SQL versionados (Prisma Migrate)
```

## Capas — regla dura, sin excepciones

```
routes/       →  qué URL existe y qué guards corre
controllers/  →  sanitiza y valida el input, arma el envelope de la respuesta
services/     →  decide: autoriza por campus, valida el dominio, transacciona, audita
models/       →  la query
```

**Ningún controller ni service escribe `prisma.<tabla>.<op>()`.** Ni siquiera
para un "CRUD simple": un `findMany` con su `where`, su `select` y su `orderBy`
escrito en el handler HTTP es exactamente lo que después nadie encuentra cuando
hay que cambiar un índice o auditar qué expone un endpoint. Si falta una
consulta, se agrega una función a `models/<recurso>.model.js` y se la llama
desde arriba. Ver `Backend/models/README.md` para las convenciones (todas las
funciones toman `client = prisma` al final para poder correr dentro de un `tx`;
reciben filtros de dominio, no fragmentos de `where`).

Un service que necesita una transacción **no importa `prisma`**: usa
`transaction()` de `config/db.js` y le pasa el `tx` a los modelos.

El SQL crudo vive sólo en `models/`, parametrizado con los template tags de
Prisma. Hoy son dos, ambos en `group.model.js` y documentados en
`Docs/DATABASE.md` §7.3.

**Input del cliente**: el querystring se sanitiza en el controller con
`utils/queryParams.js` (`parsePagination`, `parseSearch`, `parseSort`,
`parseOptionalBool`, `parseEnum`). El modelo nunca ve un string crudo del
cliente, y `sort` sólo acepta las columnas que el endpoint declara.

## Envelope de respuesta (síguelo tal cual)

Toda respuesta tiene `data`: en éxito es `true`, un objeto o un array; en
fallo es `false`, acompañado de `message` legible.

```js
// éxito
res.status(200).json({ data: true, user: safeUser, message: 'Login exitoso' });
res.status(200).json({ data: sessions });                       // list endpoint

// fallo
res.status(400).json({ data: false, message: 'Faltan campos requeridos.' });
```

Códigos HTTP estándar:
- `200` lectura/update ok · `201` creado · `204` sin contenido
- `400` input inválido · `401` no autenticado · `403` no autorizado
- `404` no encontrado · `409` conflicto (duplicate key) · `429` rate-limited
- `500` error interno · `503` infra no disponible

Algunos `message` son **sentencias machine-readable** que el frontend
matchea (`UPPER_SNAKE_CASE`) en vez de mostrarlos literal. Si necesitas
ramificar por razón específica en el frontend, usa ese patrón en lugar
de prosa.

## Patrón de controller

```js
export const list = async (req, res) => {
  try {
    // 1. sanitizar el input del cliente
    const pagination = parsePagination(req.query);
    const filters = {
      ...pagination,
      search: parseSearch(req.query.search),
      sort: parseSort(req.query.sort, ['code', 'name'], { field: 'name', dir: 'asc' }),
    };
    // 2. delegar al service (que decide) → que llama al modelo (que consulta)
    const { rows, total } = await recurso.list(req.user, filters);
    // 3. armar el envelope
    return res.status(200).json({ data: { rows, total, ...pagination } });
  } catch (err) {
    return fail(res, err, 'list');   // helper local: 4xx conocidos vs. 500 + log
  }
};
```

Un listado paginado devuelve SIEMPRE `{ data: { rows, total, page, pageSize } }`.
Una sola forma para todas las tablas del panel.

**Logs con tag de módulo entre corchetes** — `[AUTH]`, `[USERS]`, `[LEADS]`.
Búsca por tag cuando traces un fallo a través de capas.

## Patrón de ruta

Un `express.Router()` por feature, montado en `app.js`:

```js
// routes/users.js
import { Router } from 'express';
import { list, getById, create, update, remove } from '../controllers/users.controller.js';

const router = Router();
router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

export default router;
```

```js
// app.js
import usersRouter from './routes/users.js';
app.use('/api/users', usersRouter);
```

Auth (cuando se agregue) — el middleware `middlewares/auth.middleware.js`
exportará guards compuestos (`requireAuth`, `requireAdmin`) y se aplica a
nivel de router:

```js
router.post('/', requireAuth, create);
router.delete('/:id', requireAuth, requireAdmin, remove);
```

## Rate limiting

`express-rate-limit` con `app.set('trust proxy', 1)` (necesario si la app
corre detrás de nginx/cloudflare). Hay un **limiter global** en `app.js`
(moderado: 300 req/15min por IP). Endpoints spammables (login, contacto)
deben tener su **propio limiter más estricto** vía `middlewares/rateLimit.middleware.js`.

El handler del limiter responde `{ data: false, message: '...' }` con
status 429 — ya está cableado en `app.js`, copiar el patrón.

## Prisma — reglas no negociables

- **`prisma/schema.prisma` es la fuente de verdad** del esquema. Cualquier
  cambio a la BD pasa por acá.
- **Cada cambio de schema genera una migración**:
  `npm run prisma:migrate:dev -- --create-only --name <nombre_descriptivo>`
- **Leer el `migration.sql` generado antes de aplicarlo.** Si tiene `DROP`,
  `TRUNCATE`, `DELETE`, o un `MODIFY` sobre una columna con datos, parar y
  usar expand/contract. `migrate deploy` corre ese SQL en producción sin
  rollback.
- **Nunca** `migrate dev`, `migrate reset` o `db push` contra producción —
  pueden borrar la base entera. `Backend/prisma/build-database-url.js` los
  bloquea si `DB_HOST` no es local, a menos que se setee
  `PRISMA_ALLOW_REMOTE=1` explícitamente.
- **Producción se toca solo con `migrate deploy`** (aditivo, no resetea).
- **Cambios no triviales** (rename/eliminar columnas con datos) usan
  expand/contract: agregar la columna nueva como nullable en un deploy,
  migrar el código que la usa en otro.

## Migraciones (`prisma/migrations/`)

Versionadas en el repo. Prisma genera los archivos con timestamp + nombre.
Cada deploy aplica las pendientes con `npm run prisma:migrate:deploy`.

## Seguridad no negociable

- Toda query Prisma usa su API tipada (parametrizada por construcción).
  Si necesitas `prisma.$queryRaw`, **siempre** placeholders `$1, $2, ...`,
  nunca concatenación.
- `express.json({ limit: '100kb' })` — deliberadamente chico. Si un payload
  necesita más, va por `multer` con su propio límite, no por este parser.
- CORS estricto: lista de orígenes en `ALLOWED_ORIGINS`, nunca `'*'` (es
  inválido con `credentials: true`).
- Headers de seguridad con `helmet()` (ya cableado en `app.js`).
- Variables sensibles siempre desde `process.env` (vía `dotenv` en
  arranque). Nunca hardcoded en código.
- **Auth aún no implementada.** Cuando se agregue:
  - JWT firmados con `JWT_SECRET` (mínimo 32 chars en producción).
  - Secret solo desde env, nunca en el repo.
  - Roles siempre re-validados contra la BD en cada request — nunca
    confiar en el payload del token.

## Manejo de errores

`app.js` ya tiene:
- 404 catch-all: `{ data: false, message: 'Ruta no encontrada: ...' }`
- Error handler final con log + `{ data: false, message: 'Error interno del servidor.' }`

Los controllers atrapan sus propios errores con try/catch y devuelven
500 con `{ data: false, message: '...' }` — **nunca** propagan `err.message`
o `err.stack` al cliente.
