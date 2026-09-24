# TAEV-UDEG-PREPA2

Sistema de registro **TAEV** (Trayectorias de Aprendizaje Especializante y
Vinculación) para la UDEG. Los alumnos ordenan sus preferencias de asignatura y
el sistema los asigna a grupos con cupo **por orden de llegada**, dentro de una
ventana de 10–15 minutos.

Plataforma **multi-escuela**: hoy opera PREPA 2, y cada campus corre su propio
ciclo con ventana, padrón, oferta y cupos independientes.

Monorepo de tres paquetes independientes.

> **¿Vas a escribir código?** Empezá por
> [`Docs/HANDOFF.md`](./Docs/HANDOFF.md) — qué falta, cómo levantar el entorno
> con datos de prueba, y los desajustes conocidos entre el portal maquetado y la
> API real.
>
> **¿Querés entender el sistema?** [`Docs/TAEV-DOMAIN.md`](./Docs/TAEV-DOMAIN.md)
> explica qué hace y por qué; [`Docs/DATABASE.md`](./Docs/DATABASE.md) explica
> cómo está construido.

## Estructura

```
TAEV-UDEG-PREPA2/
├── Backend/      API REST — Node 20 + Express 5 + Prisma 6 + PostgreSQL 14+
├── Frontend/     Sitio público — Astro 5 + React 19 (islas) + Tailwind v4
├── Admin/        Panel interno — Astro 5 + React 19 (SPA) + react-router
├── Docs/         Documentación
├── Database/     Artefactos de BD (schemas, seeds, scripts)
├── .agents/      Skills para el agente (ui, frontend, backend)
├── .opencode/    Plugin graphify para OpenCode
└── CLAUDE.md     Reglas del proyecto
```

## Inicio rápido

```bash
# 1. Postgres (Docker, una sola vez)
docker run -d --name taev-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=taev_udeg_prepa2 \
  -p 5432:5432 postgres:16-alpine

# 2. Backend
cd Backend && npm install && cp .env.example .env
npm run prisma:migrate:deploy   # aplica la migración inicial (ya versionada)
npm run prisma:generate
npm test                        # lógica de la ventana de envío
docker exec -i taev-db psql -U postgres -d taev_udeg_prepa2 \
  < ../Database/seeds/001_demo_semester.sql   # datos de prueba
npm run dev

# 3. Frontend (otra terminal)
cd Frontend && npm install && cp .env.example .env && npm run dev

# 4. Admin (otra terminal)
cd Admin && npm install && cp .env.example .env && npm run dev
```

| Servicio | Puerto |
|---|---|
| Backend | `http://localhost:4000` |
| Frontend | `http://localhost:4321` |
| Admin | `http://localhost:4322` |
| PostgreSQL | `localhost:5432` |

## Documentación

**Para trabajar**:

- [`Docs/HANDOFF.md`](./Docs/HANDOFF.md) — estado, qué falta, contratos de los
  endpoints, desajustes conocidos y checklist de verificación.

**Dominio y modelo** (leer en este orden):

- [`Docs/TAEV-DOMAIN.md`](./Docs/TAEV-DOMAIN.md) — **el qué**: reglas de negocio,
  roles, flujo, la ventana de envío y su kill switch, cómo reparte el allocator.
- [`Docs/DATABASE.md`](./Docs/DATABASE.md) — **el cómo**: tablas, constraints,
  autorización por campus, implementación del allocator, endpoints.
- [`Database/schemas/001_taev.dbml`](./Database/schemas/001_taev.dbml) — ERD para
  pegar en https://dbml.dbdiagram.io/home.

**Stack**:

- [`Docs/STACK-SETUP.md`](./Docs/STACK-SETUP.md) — qué se creó, decisiones, qué se copió del proyecto planner.
- [`Docs/ARCHITECTURE.md`](./Docs/ARCHITECTURE.md) — diagrama de capas y cómo se comunican.
- [`Docs/README.md`](./Docs/README.md) — índice completo de la documentación.
- [`.agents/skills/`](./.agents/skills/) — convenciones que el agente debe seguir.
- [`CLAUDE.md`](./CLAUDE.md) — reglas duras y contexto para el agente.

## Estado

| Pieza | Estado |
|---|---|
| Esquema Prisma + migración inicial | ✅ Modelado, validado y probado contra PostgreSQL 16 |
| Lógica de la ventana de envío | ✅ Implementada con tests (`cd Backend && npm test`) |
| API (controllers, rutas, auth) | ❌ Por implementar |
| Portal público | 🟡 Maquetado con mocks, falta cablear la API |
| Panel Admin | ❌ Scaffold |

## graphify

Este proyecto tiene un knowledge graph en `graphify-out/`:

```bash
graphify update .          # incremental
graphify query "<pregunta>"  # consulta sobre el código
```

Para abrir el grafo en el navegador: `open graphify-out/graph.html`.