# Arquitectura

Cómo se conectan los cuatro servicios del stack y qué cruza por dónde.

## Diagrama de alto nivel

```
                    ┌────────────────────────────────────────┐
                    │           Navegador (user)             │
                    └───────────┬────────────────────┬───────┘
                                │                    │
                                │  sitio público     │  panel interno
                                ▼                    ▼
                    ┌────────────────────�  ┌────────────────────┐
                    │     Frontend       │  │       Admin        │
                    │  Astro + React     │  │  Astro + React SPA │
                    │  :4321             │  │  :4322             │
                    └──────────┬─────────�  └──────────┬─────────┘
                               │ HTTP (axios)           │ HTTP (axios)
                               │ PUBLIC_API_URL         │ PUBLIC_API_URL
                               └──────────┬─────────────�
                                          ▼
                              ┌──────────────────────┐
                              │       Backend        │
                              │  Express 5 + Prisma  │
                              │  :4000               │
                              └──────────┬───────────┘
                                         │ DATABASE_URL
                                         ▼
                              ┌──────────────────────┐
                              │     PostgreSQL       │
                              │  :5432               │
                              └──────────────────────┘
```

## Capas

### Frontend (público)

- Astro sirve HTML estático + islas React interactivas.
- Cada ruta es una página Astro (`src/pages/*.astro`).
- Las islas React (`client:load` / `client:visible`) hacen fetch a la API
  vía `src/backend/connection.ts`.
- Estado global en stores Zustand (`src/stores/*`).
- **No** consume auth (sitio público).

### Admin (panel interno)

- Una sola página Astro monta `<App client:only="react" />`.
- Toda la navegación interna del panel es **client-side** vía
  `react-router-dom` (rutas anidadas, code-splitting por ruta).
- El layout base (`Sidebar` + `main`) viene de `App.tsx`.
- Aquí vivirá el futuro login (`authStore` + interceptor en `connection.ts`).

### Backend

- Express 5 con middlewares globales (`helmet`, `cors`, `rate-limit`,
  `express.json`).
- Estructura por feature: cada recurso tiene su `controller`, su
  `route`, y opcionalmente su `service` para lógica compleja.
- Prisma como ORM contra PostgreSQL.
- Envelope de respuesta uniforme `{ data, message }`.
- Errores logueados con tag `[MODULO]`.
- Auth pendiente: cuando se agregue, JWT firmados con `JWT_SECRET`
  (≥ 32 chars en producción), roles re-validados contra la BD en cada
  request, secret solo desde env.

### PostgreSQL

- Schema definido en `Backend/prisma/schema.prisma`.
- Migraciones versionadas en `Backend/prisma/migrations/`.
- Producción se toca solo con `npm run prisma:migrate:deploy` (aditivo).
- Comandos destructivos (`migrate dev`/`reset`/`db push`) **bloqueados**
  contra hosts no locales vía `build-database-url.js`.

## Comunicación entre capas

| De → A | Cómo | Notas |
|---|---|---|
| Frontend → Backend | HTTP REST, JSON | `withCredentials: true`. CORS en Backend permite `http://localhost:4321` en dev. |
| Admin → Backend | HTTP REST, JSON | Igual que Frontend, origen `http://localhost:4322`. |
| Backend → Postgres | Prisma (TCP al puerto 5432) | `DATABASE_URL` arma `build-database-url.js` desde `DB_*`. |
| Frontend ↔ Admin | **No se hablan** | Son dos proyectos independientes. |

## Variables de entorno

### Backend (`Backend/.env`)

| Variable | Default dev | Notas |
|---|---|---|
| `NODE_ENV` | `dev` | `production` activa chequeos estrictos (ej. `JWT_SECRET` ≥ 32). |
| `PORT` | `4000` | |
| `ALLOWED_ORIGINS` | `http://localhost:4321,http://localhost:4322` | CSV. Nunca `'*'` con `credentials: true`. |
| `DB_HOST` | `localhost` | |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `taev_udeg_prepa2` | |
| `DB_USER` | `postgres` | |
| `DB_PASSWORD` | `postgres` | **Cambiar en producción.** |
| `DB_SSL` | `false` | `true` para proveedores gestionados. |
| `LOG_LEVEL` | `combined` | `combined`/`common`/`dev`/`short`/`tiny` (morgan). |

### Frontend (`Frontend/.env`)

| Variable | Default | Notas |
|---|---|---|
| `PUBLIC_API_URL` | `http://localhost:4000` | Se incrusta en el bundle en build. |

### Admin (`Admin/.env`)

| Variable | Default | Notas |
|---|---|---|
| `PUBLIC_API_URL` | `http://localhost:4000` | Se incrusta en el bundle en build. |

## Reglas que el setup inicial ya respeta

- ✅ ES modules en Backend (`"type": "module"`).
- ✅ Prisma es la única fuente de verdad del esquema.
- ✅ `build-database-url.js` bloquea comandos destructivos contra producción.
- ✅ Helmet + rate-limit + CORS estricto en Backend.
- ✅ Cliente HTTP centralizado (axios + `request()`) en Frontend y Admin.
- ✅ Tokens semánticos via `@theme` (Tailwind v4) sin clases crudas de marca.
- ✅ No SEO (sin sitemap, sin SSR para motores).
- ✅ Sin Docker / sin auth / sin CAPTCHA — por decisión del proyecto.
- ✅ Skills (`ui`, `frontend`, `backend`) en `.agents/skills/` para que
  el agente las cargue cuando trabaja en cada área.
