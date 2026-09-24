# Backend — TAEV-UDEG-PREPA2

API REST sobre Node.js + Express 5, con Prisma como ORM contra PostgreSQL.

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Express 5 (ES modules)
- **ORM**: Prisma 6 contra PostgreSQL 14+
- **Seguridad**: helmet, express-rate-limit, CORS estricto
- **Auth**: pendiente — la estructura está lista para añadirla (ver skill `backend`)

## Estructura

```
Backend/
├── app.js                # middleware + rate limiters + 404/error handlers
├── server.js              # entry point + startup checks + graceful shutdown
├── config/                 # main.js (env, CORS, puerto), db.js (Prisma singleton)
├── controllers/            # req/res por recurso
├── routes/                  # express.Router() por feature
├── middlewares/              # auth, validación, rate limiters específicos
├── services/                  # lógica cross-cutting
├── utils/                      # helpers puros
├── prisma/
│   ├── schema.prisma              # fuente de verdad del esquema
│   ├── build-database-url.js      # arma DATABASE_URL desde DB_*
│   └── migrations/                 # archivos SQL versionados (Prisma Migrate)
├── .env.example                  # plantilla — copia a .env
└── package.json
```

## Setup local

```bash
# 1. Instalar deps
npm install

# 2. Crear .env desde la plantilla
cp .env.example .env
# edita .env si tus credenciales de Postgres no son las del ejemplo

# 3. Levantar Postgres (si no tienes uno corriendo)
docker run -d --name taev-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=taev_udeg_prepa2 \
  -p 5432:5432 \
  postgres:16-alpine

# 4. Generar el cliente de Prisma y aplicar la migración inicial
npm run prisma:generate
npm run prisma:migrate:dev -- --name init

# 5. Arrancar en modo dev
npm run dev
```

El servidor escucha en `http://localhost:4000`. Health check: `GET /health`.

## Scripts npm

| Script | Qué hace |
|---|---|
| `npm run dev` | Arranca con `nodemon` (hot reload) |
| `npm start` | Arranca con `node` (producción) |
| `npm run prisma:generate` | Regenera el cliente de Prisma |
| `npm run prisma:migrate:dev -- --name <x>` | Crea y aplica una migración nueva |
| `npm run prisma:migrate:deploy` | Aplica migraciones pendientes (producción) |
| `npm run prisma:migrate:status` | Muestra qué migraciones están aplicadas |
| `npm run prisma:studio` | Abre Prisma Studio (GUI de la BD) |

## Reglas del proyecto

Lee la skill `.agents/skills/backend/SKILL.md` para las convenciones completas
de controllers, modelos, rutas, shape de respuesta y seguridad.
