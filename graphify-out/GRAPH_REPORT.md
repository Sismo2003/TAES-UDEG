# Graph Report - TAEV-UDEG-PREPA2  (2026-08-28)

## Corpus Check
- 149 files · ~80,005 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1070 nodes · 1852 edges · 86 communities (60 shown, 26 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- devDependencies
- dependencies
- Admin/tsconfig.json
- dependencies
- IMPLEMENTATION LOG — Fases 0 → 5
- Admin/src/backend/connection.ts
- TAEV-UDEG-PREPA2
- main.js
- admin.service.js
- admin.controller.js
- SubmissionsPage.tsx
- App.tsx
- graphify.js
- taevStore.ts
- devDependencies
- 4. Tablas
- Backend — TAEV-UDEG-PREPA2
- dependencies
- TAEV — Dominio y reglas de negocio
- Frontend/tsconfig.json
- Arquitectura
- Frontend — TAEV-UDEG-PREPA2
- Sidebar.tsx
- cn
- STACK-SETUP — qué se creó al inicializar el proyecto
- Admin — TAEV-UDEG-PREPA2
- Frontend — TAEV-UDEG-PREPA2
- Backend — TAEV-UDEG-PREPA2
- HANDOFF — cablear la API con el portal público
- SemestersPage.tsx
- Controllers
- Database
- Admin/src/components/forms/README.md
- Admin/src/components/layout/README.md
- Admin/src/components/sections/README.md
- Admin/src/components/ui/README.md
- Admin/src/hooks/README.md
- Admin/src/lib/README.md
- Admin/src/stores/README.md
- middlewares/README.md
- routes/README.md
- services/README.md
- utils/README.md
- Scripts
- Seeds
- Frontend/src/components/forms/README.md
- Frontend/src/components/layout/README.md
- Frontend/src/components/sections/README.md
- Frontend/src/components/ui/README.md
- Frontend/src/hooks/README.md
- i18n/README.md
- Frontend/src/lib/README.md
- Frontend/src/stores/README.md
- AuditPage.tsx
- student.model.js
- db.js
- UI/UX — TAEV-UDEG-PREPA2
- offering.model.js
- StudentsPage.tsx
- subject.model.js
- AssignmentsPage.tsx
- prisma
- Índice
- campus.model.js
- TAEV-UDEG-PREPA2
- AGENTS.md
- ROADMAP — de acá al evento real
- Schemas
- `models/` — la única capa que habla con Prisma
- hash-string.js
- audit.model.js
- Ajustes posteriores — 2026-08-28 (Admin: página Semestres + padrón)
- submission.model.js
- Fase 7.1 — Módulo "Envíos" (pantalla en vivo) + sidebar colapsable — 2026-08-28
- Ajustes posteriores — 2026-08-28 (Admin: terminología de la UI)
- Fase 5 — Capa `models/` y módulos esenciales del panel
- Fase 7.2 — Módulo "Asignaciones" (colocar y mover a mano) — 2026-08-28
- Fase 3 — Auth + Admin
- Fase 0 — Entorno
- Fase 2 — Portal público
- Ajustes posteriores — 2026-08-28 (Frontend, fuera de las fases 0→5)
- Fase 1 — API pública

## God Nodes (most connected - your core abstractions)
1. `cn()` - 39 edges
2. `apiError` - 38 edges
3. `fail()` - 30 edges
4. `useAuthStore` - 22 edges
5. `transaction()` - 22 edges
6. `errorMessage()` - 19 edges
7. `useSemesterStore` - 19 edges
8. `loadSemesterScoped()` - 19 edges
9. `ip()` - 18 edges
10. `useTaevStore` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Stat()` --calls--> `cn()`  [EXTRACTED]
  Admin/src/pages/AssignmentsPage.tsx → Admin/src/lib/cn.ts
- `AddOfferingModal()` --calls--> `cn()`  [EXTRACTED]
  Admin/src/pages/OfferingsPage.tsx → Admin/src/lib/cn.ts
- `GroupFormModal()` --calls--> `cn()`  [EXTRACTED]
  Admin/src/pages/OfferingsPage.tsx → Admin/src/lib/cn.ts
- `LiveSwitch()` --calls--> `cn()`  [EXTRACTED]
  Admin/src/pages/SubmissionsPage.tsx → Admin/src/lib/cn.ts
- `Stat()` --calls--> `cn()`  [EXTRACTED]
  Admin/src/pages/SubmissionsPage.tsx → Admin/src/lib/cn.ts

## Import Cycles
- None detected.

## Communities (86 total, 26 thin omitted)

### Community 0 - "devDependencies"
Cohesion: 0.06
Nodes (31): devDependencies, @astrojs/check, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss (+23 more)

### Community 1 - "dependencies"
Cohesion: 0.05
Nodes (39): dependencies, astro, @astrojs/react, axios, @hookform/resolvers, lucide-react, qrcode.react, react (+31 more)

### Community 2 - "Admin/tsconfig.json"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, jsx, jsxImportSource, paths, exclude, extends, include (+6 more)

### Community 3 - "dependencies"
Cohesion: 0.04
Nodes (46): dependencies, bcryptjs, cookie-parser, cors, dotenv, express, express-rate-limit, helmet (+38 more)

### Community 4 - "IMPLEMENTATION LOG — Fases 0 → 5"
Cohesion: 0.29
Nodes (7): Cómo levantar todo, Fase 4 — Allocator, IMPLEMENTATION LOG — Fases 0 → 5, Pendientes, Resumen por fase, Verificación de la Fase 5, Verificación ejecutada

### Community 5 - "Admin/src/backend/connection.ts"
Cohesion: 0.10
Nodes (27): AdminUser, api, ApiEnvelope, ApiError, AssignmentMutationResult, endpoints, GroupRow, ListQuery (+19 more)

### Community 6 - "TAEV-UDEG-PREPA2"
Cohesion: 0.17
Nodes (12): Base de datos — regla obligatoria para cualquier agente, Comandos rápidos, Contexto del proyecto, Convenciones clave (resumen), Estado de la implementación, Estructura del repositorio, graphify, Puertos locales por defecto (+4 more)

### Community 7 - "main.js"
Cohesion: 0.07
Nodes (26): app, globalLimiter, assertConfig(), auth, db, defaultOrigins, origins, taev (+18 more)

### Community 8 - "admin.service.js"
Cohesion: 0.08
Nodes (49): transaction(), assertCampusAccess(), isGlobalScope(), scopeCampusId(), LIST_SELECT, addOffering(), bulkUploadStudents(), changeWindowMode() (+41 more)

### Community 9 - "admin.controller.js"
Cohesion: 0.13
Nodes (39): addOffering(), allocate(), AUDIT_ENTITY_TYPES, auditLog(), bulkStudents(), changeWindow(), clearCurrent(), createGroup() (+31 more)

### Community 10 - "SubmissionsPage.tsx"
Cohesion: 0.33
Nodes (8): Countdown, firstPreference(), formatDuration(), LiveSwitch(), pad(), resolveCountdown(), Stat(), SubmissionsPage()

### Community 11 - "App.tsx"
Cohesion: 0.16
Nodes (24): App(), errorMessage(), WindowReason, Card(), PageHeader(), useTableQuery(), formatDateTime(), AssignmentsPage() (+16 more)

### Community 13 - "taevStore.ts"
Cohesion: 0.06
Nodes (55): api, ApiEnvelope, ApiError, endpoints, Offering, PreferenceInput, SubmitResult, TaevStatus (+47 more)

### Community 16 - "devDependencies"
Cohesion: 0.06
Nodes (31): devDependencies, @astrojs/check, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss (+23 more)

### Community 17 - "4. Tablas"
Cohesion: 0.05
Nodes (43): 10. Decisiones cerradas, 11. Referencias cruzadas, 1. Principios de diseño, 2. Diagrama entidad-relación, 3.1 Qué separa un campus de otro, 3.2 Alcance de los usuarios, 3.3 El esquema define el alcance; el middleware lo hace cumplir, 3.4 Cómo sabe el portal público a qué campus entra el alumno (+35 more)

### Community 18 - "Backend — TAEV-UDEG-PREPA2"
Cohesion: 0.17
Nodes (11): Backend — TAEV-UDEG-PREPA2, Capas — regla dura, sin excepciones, Envelope de respuesta (síguelo tal cual), Layout, Manejo de errores, Migraciones (`prisma/migrations/`), Patrón de controller, Patrón de ruta (+3 more)

### Community 19 - "dependencies"
Cohesion: 0.05
Nodes (37): framer-motion, dependencies, astro, @astrojs/react, axios, framer-motion, @hookform/resolvers, lucide-react (+29 more)

### Community 20 - "TAEV — Dominio y reglas de negocio"
Cohesion: 0.09
Nodes (22): 10. Glosario, 11. Referencias cruzadas, 1.1 Alcance: una plataforma, varias escuelas, 1. Qué es TAEV, 2. Roles, 3. Flujo end-to-end, 4.1 Todo cuelga de un semestre, 4.2 Cuántas preferencias (+14 more)

### Community 21 - "Frontend/tsconfig.json"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, jsx, jsxImportSource, paths, exclude, extends, include (+6 more)

### Community 22 - "Arquitectura"
Cohesion: 0.15
Nodes (13): Admin (`Admin/.env`), Admin (panel interno), Arquitectura, Backend, Backend (`Backend/.env`), Capas, Comunicación entre capas, Diagrama de alto nivel (+5 more)

### Community 23 - "Frontend — TAEV-UDEG-PREPA2"
Cohesion: 0.17
Nodes (11): Cliente API (`backend/`), Contact info (regla futura, cuando se necesite), Diferencia clave Frontend vs Admin, Forms, Frontend — TAEV-UDEG-PREPA2, i18n (opcional), Layout, Routing (+3 more)

### Community 24 - "Sidebar.tsx"
Cohesion: 0.38
Nodes (5): AppLayout(), readCollapsed(), NAV, NavItem, Sidebar()

### Community 25 - "cn"
Cohesion: 0.13
Nodes (26): SubjectRow, blank(), FormValues, schema, StudentFormModal(), FormValues, schema, SubjectFormModal() (+18 more)

### Community 26 - "STACK-SETUP — qué se creó al inicializar el proyecto"
Cohesion: 0.20
Nodes (10): Comandos para arrancar el stack completo, Decisiones tomadas, Estructura completa al cierre del setup, Lo que NO se copió, Patrones de tooling, Próximos pasos sugeridos, Qué se copió del proyecto planner y qué se adaptó, Resumen ejecutivo (+2 more)

### Community 27 - "Admin — TAEV-UDEG-PREPA2"
Cohesion: 0.25
Nodes (7): Admin — TAEV-UDEG-PREPA2, Auth, Estructura, Patrón SPA sobre Astro, Reglas del proyecto, Setup local, Stack

### Community 28 - "Frontend — TAEV-UDEG-PREPA2"
Cohesion: 0.25
Nodes (7): Estructura, Frontend — TAEV-UDEG-PREPA2, Reglas del proyecto, Scripts npm, Setup local, Sin SEO, Stack

### Community 29 - "Backend — TAEV-UDEG-PREPA2"
Cohesion: 0.29
Nodes (6): Backend — TAEV-UDEG-PREPA2, Estructura, Reglas del proyecto, Scripts npm, Setup local, Stack

### Community 30 - "HANDOFF — cablear la API con el portal público"
Cohesion: 0.09
Nodes (22): 1. Dónde está parado el proyecto, #1 — `rankings` está indexado por NOMBRE, la API necesita IDs, 2. Arrancar en 5 minutos, #2 — `PreferencesStep` tiene el "3" hardcodeado, 3. Los 7 desajustes entre el front actual y la API real, #3 — No existe pantalla de "ventana cerrada", 4. Contratos de los tres endpoints públicos, #4 — `ErrorStep` tiene un título fijo equivocado (+14 more)

### Community 31 - "SemestersPage.tsx"
Cohesion: 0.20
Nodes (13): Campus, SemesterInput, FormValues, schema, SemesterFormModal(), FORMAT, fromLocalInputValue(), minutesBetween() (+5 more)

### Community 46 - "Seeds"
Cohesion: 0.40
Nodes (4): Archivos, Convención, El campus inicial no está acá, Seeds

### Community 55 - "AuditPage.tsx"
Cohesion: 0.23
Nodes (8): AuditRow, alignClass, Column, DataTableProps, PAGE_SIZES, SortState, useDebouncedValue(), ENTITY_TYPES

### Community 56 - "student.model.js"
Cohesion: 0.18
Nodes (4): buildWhere(), listPaginated(), ROW_SELECT, SORTABLE

### Community 57 - "db.js"
Cohesion: 0.22
Nodes (8): buildDatabaseUrl(), datasourceUrl, args, DESTRUCTIVE, isDestructive, isLocalHost, LOCAL_HOSTS, url

### Community 58 - "UI/UX — TAEV-UDEG-PREPA2"
Cohesion: 0.20
Nodes (9): 1. Principios de diseño — aplícalos, no los cites, 2. Tokens de marca — define los reales en `styles/global.css`, 3. Superficies — recipe estándar, 4. Modales — siempre el patrón `<Modal>` existente, 5. Buttons — el contrato color/variant, 6. Forms — inputs, validación y cuándo usar react-hook-form, 7. Cards, badges y layout de sección, 8. Modo claro/oscuro (+1 more)

### Community 61 - "StudentsPage.tsx"
Cohesion: 0.12
Nodes (20): StudentInput, StudentRow, analyze(), COLUMNS, MAX, norm(), ParsedRow, ParseResult (+12 more)

### Community 62 - "subject.model.js"
Cohesion: 0.22
Nodes (4): buildWhere(), listPaginated(), ROW_SELECT, SORTABLE

### Community 64 - "AssignmentsPage.tsx"
Cohesion: 0.21
Nodes (15): SubmissionRow, GroupOption, PlaceAssignmentModal(), PlaceMode, selectClass, buildOfferingIndex(), OfferingIndex, OfferingSeats (+7 more)

### Community 65 - "prisma"
Cohesion: 0.38
Nodes (8): prisma, createFixture(), databaseAvailable(), destroyFixture(), readAssignments(), readGroups(), readStatuses(), suffix()

### Community 66 - "Índice"
Cohesion: 0.25
Nodes (8): Convenciones para agentes, Código con reglas de negocio incrustadas, Docs, Dominio y producto, Esquema y base de datos, 👉 Si vas a escribir código ahora, Stack y arquitectura, Índice

### Community 68 - "TAEV-UDEG-PREPA2"
Cohesion: 0.33
Nodes (6): Documentación, Estado, Estructura, graphify, Inicio rápido, TAEV-UDEG-PREPA2

### Community 69 - "AGENTS.md"
Cohesion: 0.40
Nodes (4): graphify, Implementation status, Non-obvious rules that are easy to break, Project domain — TAEV

### Community 70 - "ROADMAP — de acá al evento real"
Cohesion: 0.09
Nodes (22): 10.1 El riesgo concreto que hay que resolver ya, 10.2 Tests automatizados de endpoints, 10.3 Ensayo de carga, 10.4 Checklist del día, 7.1 Envíos (lectura) — ✅ Hecho (2026-08-28, ver IMPLEMENTATION-LOG Fase 7.1), 7.2 Asignaciones (escritura) — ✅ Hecho (2026-08-28, ver IMPLEMENTATION-LOG Fase 7.2), Alcance, Cambios necesarios (+14 more)

### Community 71 - "Schemas"
Cohesion: 0.40
Nodes (4): Archivos, Cómo actualizar, Por qué existe `002_constraints.sql`, Schemas

### Community 72 - "`models/` — la única capa que habla con Prisma"
Cohesion: 0.50
Nodes (3): Convenciones, `models/` — la única capa que habla con Prisma, Paginación

### Community 74 - "audit.model.js"
Cohesion: 0.50
Nodes (3): buildWhere(), listPaginated(), ROW_SELECT

### Community 75 - "Ajustes posteriores — 2026-08-28 (Admin: página Semestres + padrón)"
Cohesion: 0.33
Nodes (6): 0. Diagnóstico — por qué `2026-MATUTINO` no abría (sin cambios de código), 1. `STATUS_LABEL.pending`: "pendiente" → "enviado", 2. Endpoint nuevo — "cerrar la plataforma" (quitar el semestre activo), 3. `Admin/src/pages/SemestersPage.tsx` — KPIs, botón y columna, Ajustes posteriores — 2026-08-28 (Admin: página Semestres + padrón), Verificación

### Community 76 - "submission.model.js"
Cohesion: 0.20
Nodes (4): buildLiveWhere(), listPaginated(), LIVE_ROW_SELECT, shapeLiveRow()

### Community 77 - "Fase 7.1 — Módulo "Envíos" (pantalla en vivo) + sidebar colapsable — 2026-08-28"
Cohesion: 0.33
Nodes (6): Admin SPA, Backend, Fase 7.1 — Módulo "Envíos" (pantalla en vivo) + sidebar colapsable — 2026-08-28, Inventario de archivos, Sidebar colapsable (escritorio), Verificación

### Community 78 - "Ajustes posteriores — 2026-08-28 (Admin: terminología de la UI)"
Cohesion: 0.40
Nodes (5): 1. "Padrón" → "Estudiantes" en todo el texto visible, 2. Dashboard — KPI "Pendientes" → "Sin asignar", 3. Dashboard — el motivo de la ventana ahora es una etiqueta legible, Ajustes posteriores — 2026-08-28 (Admin: terminología de la UI), Verificación

### Community 79 - "Fase 5 — Capa `models/` y módulos esenciales del panel"
Cohesion: 0.40
Nodes (5): 5.1 Por qué se refactorizó, 5.2 Endpoints nuevos, 5.3 Admin SPA — lo construido, 5.4 Inventario de archivos, Fase 5 — Capa `models/` y módulos esenciales del panel

### Community 80 - "Fase 7.2 — Módulo "Asignaciones" (colocar y mover a mano) — 2026-08-28"
Cohesion: 0.40
Nodes (5): Archivos, Decisiones, El bug que bloqueaba la feature, Fase 7.2 — Módulo "Asignaciones" (colocar y mover a mano) — 2026-08-28, Verificación

### Community 81 - "Fase 3 — Auth + Admin"
Cohesion: 0.50
Nodes (4): Admin SPA — núcleo funcional (🟡 parcial), Backend, Endpoints admin (todos con JWT salvo login), Fase 3 — Auth + Admin

### Community 82 - "Fase 0 — Entorno"
Cohesion: 0.50
Nodes (4): `Backend/.env` (nuevo, no versionado), `DATABASE_URL` en runtime — `config/databaseUrl.js` (nuevo), Fase 0 — Entorno, `Frontend/src/backend/connection.ts` — tipado

### Community 83 - "Fase 2 — Portal público"
Cohesion: 0.50
Nodes (4): Componentes, Fase 2 — Portal público, `Frontend/src/stores/taevStore.ts` — reescrito, Los 7 desajustes de HANDOFF §3

### Community 84 - "Ajustes posteriores — 2026-08-28 (Frontend, fuera de las fases 0→5)"
Cohesion: 0.67
Nodes (3): 1. Eliminado el motivo "blueprint" (cruces de esquina), 2. `PreferencesStep` — ancho fijo del select + salto de línea en nombres largos, Ajustes posteriores — 2026-08-28 (Frontend, fuera de las fases 0→5)

### Community 85 - "Fase 1 — API pública"
Cohesion: 0.67
Nodes (3): Contratos (como quedaron), Decisiones, Fase 1 — API pública

## Knowledge Gaps
- **474 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+469 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `IMPLEMENTATION LOG — Fases 0 → 5` connect `IMPLEMENTATION LOG — Fases 0 → 5` to `Ajustes posteriores — 2026-08-28 (Admin: página Semestres + padrón)`, `Fase 7.1 — Módulo "Envíos" (pantalla en vivo) + sidebar colapsable — 2026-08-28`, `Ajustes posteriores — 2026-08-28 (Admin: terminología de la UI)`, `Fase 5 — Capa `models/` y módulos esenciales del panel`, `Fase 7.2 — Módulo "Asignaciones" (colocar y mover a mano) — 2026-08-28`, `Fase 3 — Auth + Admin`, `Fase 0 — Entorno`, `Fase 2 — Portal público`, `Ajustes posteriores — 2026-08-28 (Frontend, fuera de las fases 0→5)`, `Fase 1 — API pública`, `DATABASE.md`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `TAEV — Diseño de Base de Datos` connect `4. Tablas` to `DATABASE.md`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `TAEV — Dominio y reglas de negocio` connect `TAEV — Dominio y reglas de negocio` to `DATABASE.md`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _474 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Admin/tsconfig.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._