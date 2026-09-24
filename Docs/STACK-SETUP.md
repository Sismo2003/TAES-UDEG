# STACK-SETUP — qué se creó al inicializar el proyecto

> Documento vivo: cualquier cambio estructural al stack se anota acá.

## Resumen ejecutivo

Este proyecto se inicializó con un stack **monorepo de tres paquetes
independientes** (cada uno con su propio `package.json`, su propio puerto,
su propio deploy):

```
/
├── Backend/     Node 20 + Express 5 + Prisma 6 + PostgreSQL 14+
├── Frontend/    Astro 5 + React 19 (islas) + Tailwind v4
├── Admin/       Astro 5 + React 19 (SPA) + react-router + Tailwind v4
├── Docs/
├── Database/
└── .agents/skills/   ui, frontend, backend
```

No hay monorepo tool (Turborepo, Nx, pnpm workspaces). Cada subproyecto
se instala y arranca por separado. Esto es intencional: cada deploy es
independiente (el Frontend público puede re-deployarse sin tocar el Admin
ni el Backend).

## Decisiones tomadas

| Decisión | Por qué |
|---|---|
| **Express 5** (no 4) | Mismo que el proyecto de referencia; mejor manejo de async y errores. |
| **PostgreSQL 14+** | Requisito del brief. Soporte maduro de Prisma. |
| **Prisma 6** | ORM tipado, migraciones versionadas, schema como única fuente de verdad. |
| **`build-database-url.js`** | Script que arma `DATABASE_URL` desde `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`. **Bloquea comandos destructivos** (`migrate dev`/`reset`/`db push`) contra hosts no locales. |
| **Helmet + rate-limit global** | Headers de seguridad + límite moderado a nivel de `app.js`. Endpoints spammables llevan su propio limiter más estricto. |
| **ES modules en Backend** | `import`/`export`, `"type": "module"`. Sin TypeScript en Backend (igual que el proyecto de referencia). |
| **TypeScript estricto en Frontend y Admin** | Astro + React lo exigen prácticamente. |
| **Astro output: `static`** | Sin SEO activo. Render se hace en build; las islas React hidratan lo interactivo. |
| **Admin como SPA único** | Una sola página Astro monta `<App client:only="react" />`. Toda la navegación interna va por `react-router-dom`. |
| **Tailwind CSS v4 (CSS-first)** | Sin `tailwind.config.js`. Tokens via `@theme {}` en `global.css`. |
| **No SEO** | Sin sitemap, sin prerender para motores, sin meta-tags avanzados. |
| **Sin auth todavía** | Estructura lista (variables `JWT_*` no agregadas), pero no implementada. |
| **Sin Docker / live demos** | Regla dura del proyecto. |
| **Sin CAPTCHA** | No se necesita todavía. |

## Qué se copió del proyecto planner y qué se adaptó

Las **estructura de trabajo y convenciones** se tomaron del proyecto
`/Users/sismo/Developer/planner` (monorepo de NimbusCloud). Específicamente:

### Skills (`.agents/skills/`)

- `ui/SKILL.md` — patrón de tokens, motion, modals, buttons, forms. La
  paleta y el "dark space theme" específicos del planner **se removieron**.
  Los tokens ahora son semánticos (`--color-primary`, `--color-accent`,
  `--color-surface`, etc.) y personalizables en `styles/global.css`.
- `frontend/SKILL.md` — convenciones de stores Zustand, API client
  (axios + `request()`), forms, i18n. **Adaptado** de "React + Vite SPA"
  a "Astro + React islands" para Frontend, y a "Astro + React SPA" para
  Admin.
- `backend/SKILL.md` — convenciones de Express + controllers + envelope
  de respuesta + migraciones + seguridad. **Cambios clave**:
  - MySQL → PostgreSQL
  - Eliminado todo el sistema de demos (Docker, dockerode, Cloudflare
    DNS proxy, sistema de live-demo containers).
  - Eliminada la auth (estaba implementada en planner, acá no).
  - Eliminado Turnstile/Cloudflare CAPTCHA.

### Patrones de tooling

- `Backend/prisma/build-database-url.js` — patrón idéntico al del planner
  (arma URL desde vars `DB_*`, bloquea comandos destructivos contra hosts
  no locales). Adaptado de MySQL a PostgreSQL.
- `Backend/app.js` + `Backend/server.js` — misma forma: middleware en
  `app.js`, arranque con health check y graceful shutdown en `server.js`.
- `Frontend/src/backend/connection.ts` y `Admin/src/backend/connection.ts`
  — mismo patrón (axios + `request()` + `endpoints.*`).

### Lo que NO se copió

- Sistema de demos en vivo del planner (Docker + dockerode + 4
  contenedores por sesión + DNS proxy con Cloudflare) — irrelevante
  para este proyecto y la regla "sin Docker" lo prohíbe.
- Cloudflare Turnstile CAPTCHA — sin auth, sin forms públicos spammeables
  todavía.
- Sistema bilingüe i18n con framer-motion scramble effects del planner —
  se conserva la **infraestructura** (`i18n/`, `useLanguage`, shape de
  los archivos `es.ts`/`en.ts`) pero no se pre-construye contenido
  bilingüe. Queda como opt-in.
- Brand tokens del planner (`#414697`, `#7b9cd2`, `#0a0a0f` etc.) —
  reemplazados por tokens genéricos personalizables.

## Comandos para arrancar el stack completo

```bash
# 1. Postgres (una sola vez por máquina)
docker run -d --name taev-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=taev_udeg_prepa2 \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Backend
cd Backend
npm install
cp .env.example .env       # editar si tus credenciales no son las del ejemplo
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run dev                # http://localhost:4000

# 3. Frontend (otra terminal)
cd Frontend
npm install
cp .env.example .env
npm run dev                # http://localhost:4321

# 4. Admin (otra terminal)
cd Admin
npm install
cp .env.example .env
npm run dev                # http://localhost:4322
```

## Estructura completa al cierre del setup

```
TAEV-UDEG-PREPA2/
├── .gitignore                      # globales (env, node_modules, dist, .astro, ...)
├── CLAUDE.md                        # reglas y convenciones para el agente
│
├── Backend/
│   ├── .gitignore
│   ├── .env.example                  # plantilla para .env
│   ├── package.json                  # Express 5, Prisma 6, helmet, morgan, etc.
│   ├── README.md
│   ├── app.js                          # middleware + rate limit + 404/error handlers
│   ├── server.js                        # entry + startup checks + graceful shutdown
│   ├── config/
│   │   ├── main.js                       # env, CORS, puerto
│   │   └── db.js                          # Prisma singleton
│   ├── controllers/    (vacío — listo para el primer recurso)
│   ├── routes/         (vacío)
│   ├── middlewares/    (vacío)
│   ├── services/       (vacío)
│   ├── utils/
│   │   ├── semesterWindow.js           # única fuente de verdad de la ventana
│   │   └── semesterWindow.test.js      # 19 tests (node:test, sin deps)
│   └── prisma/
│       ├── schema.prisma               # fuente de verdad — modelo TAEV completo
│       ├── build-database-url.js       # arma DATABASE_URL + guarda anti-destrucción
│       └── migrations/
│           ├── migration_lock.toml     # provider = "postgresql"
│           └── 20260827000000_init_taev/migration.sql
│
├── Frontend/
│   ├── .gitignore
│   ├── .env.example                     # PUBLIC_API_URL
│   ├── package.json                      # Astro + React + Tailwind v4
│   ├── README.md
│   ├── astro.config.mjs                  # static + React + Tailwind
│   ├── tsconfig.json
│   └── src/
│       ├── styles/global.css              # tokens @theme
│       ├── layouts/Layout.astro
│       ├── pages/index.astro               # placeholder
│       ├── backend/connection.ts            # axios + endpoints.health()
│       ├── data/contact.config.json
│       ├── components/{layout,sections,ui,forms}/
│       ├── stores/  hooks/  i18n/  lib/
│       └── public/
│
├── Admin/
│   ├── .gitignore
│   ├── .env.example
│   ├── package.json                      # Astro + React + react-router-dom
│   ├── README.md
│   ├── astro.config.mjs                  # port 4322
│   ├── tsconfig.json
│   └── src/
│       ├── styles/global.css
│       ├── layouts/Layout.astro
│       ├── pages/index.astro               # monta <App client:only="react" />
│       ├── App.tsx                          # BrowserRouter + Routes + Sidebar
│       ├── backend/connection.ts
│       ├── components/layout/Sidebar.tsx
│       ├── pages/{DashboardPage,UsersPage,SettingsPage,NotFoundPage}.tsx
│       ├── components/{layout,sections,ui,forms}/   (vacíos — READMEs)
│       ├── stores/  hooks/  lib/
│       └── public/
│
├── Docs/
│   ├── README.md
│   ├── STACK-SETUP.md   (este archivo)
│   └── ARCHITECTURE.md
│
├── Database/
│   ├── .gitignore
│   ├── README.md
│   ├── schemas/    (vacío)
│   ├── seeds/       (vacío)
│   └── scripts/      (vacío)
│
└── .agents/skills/
    ├── ui/SKILL.md          # tokens semánticos, motion, modals, buttons, forms
    ├── frontend/SKILL.md   # Astro + React + Zustand + axios + react-hook-form
    └── backend/SKILL.md    # Express + Prisma + envelope { data, message }
```

## Próximos pasos sugeridos

El dominio ya está modelado y migrado (ver [`DATABASE.md`](./DATABASE.md)). Lo
que falta es cablear la API:

1. **Auth del panel** — `POST /api/admin/auth/login` con JWT, más el middleware
   `assertCampusAccess` que acota cada request al campus del usuario. Está
   especificado en `DATABASE.md` §3.3 y §8.
2. **Portal público end-to-end**: `GET /api/taev/status` →
   `POST /api/taev/verify-code` → `POST /api/taev/submit`, reemplazando los
   mocks de `Frontend/src/stores/taevStore.ts`. La ventana se revalida dentro
   de la transacción del envío (`DATABASE.md` §6.3).
3. **Allocator** — `services/allocation.service.js` siguiendo la
   implementación de `DATABASE.md` §7.3 (advisory lock + resolución en
   memoria + recálculo de `assigned_count`).
4. **Panel admin**: semestres, padrón por CSV, oferta y cupos, el switch de la
   ventana, disparar la asignación, overview y bitácora.
5. **Definir la identidad visual real** y actualizar los tokens en
   `Frontend/src/styles/global.css` y `Admin/src/styles/global.css`.
6. **Decidir si el sitio se hace bilingüe** — si sí, poblar
   `Frontend/src/i18n/es.ts` e `i18n/en.ts`.

Mientras tanto: `GET /health` responde, `npm test` corre en verde, `prisma
studio` abre la BD, y el portal público está maquetado con mocks.
