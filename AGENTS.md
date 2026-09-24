## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Project domain — TAEV

This system manages the **TAEV** (Trayectorias de Aprendizaje Especializante y Vinculación) selection at UDEG: students rank their subject preferences, and the system assigns them to capacity-limited groups by first-come-first-served ordering, inside a 10–15 minute submission window.

It is a **multi-school platform**: `campuses` is the root of the model. Only PREPA 2 operates today, but each campus runs its own cycle — its own window, roster, subject offering, capacities and administrators.

**If you are about to write code, start with [`Docs/HANDOFF.md`](Docs/HANDOFF.md)** — current state, exact endpoint contracts, the 7 known mismatches between the mocked portal and the real API, and a verification checklist.

**Before designing or modifying the data model, the Backend, or the Admin UI, read:**
- `Docs/TAEV-DOMAIN.md` — business rules, roles and their scope, flow, the submission window and its kill switch, how the allocator distributes students.
- `Docs/DATABASE.md` — table-by-table reference, per-campus authorization, the allocator implementation, the endpoint surface.
- `Database/schemas/001_taev.dbml` — ERD (visualize in https://dbml.dbdiagram.io/home).

### Implementation status

- ✅ `Backend/prisma/schema.prisma` — modeled and validated. **Source of truth for the SQL.**
- ✅ `Backend/prisma/migrations/20260827000000_init_taev/` — initial migration, verified against PostgreSQL 16.
- ✅ `Backend/utils/semesterWindow.js` — the single function that decides whether the form accepts submissions. Covered by `npm test`.
- ✅ `Database/seeds/001_demo_semester.sql` — open semester, 7 subjects, 21 groups, 30 student codes. Idempotent.
- ✅ Public API, admin API, JWT auth and the allocator — implemented and curl-verified.
- ✅ `Backend/models/` — **every query lives here**. Controllers sanitize input, services decide, models query. No controller or service imports `prisma`. See `Backend/models/README.md`.
- ✅ Frontend portal — wired to the real API.
- 🟡 Admin SPA — semesters, roster, subject catalog, offering/groups, dashboard, audit log and the live submissions screen are built. CSV import, manual assignments, reports and users are shown disabled in the sidebar.

### Non-obvious rules that are easy to break

- **Prisma does not generate CHECK constraints or partial indexes.** They live in `Database/schemas/002_constraints.sql` and are pasted at the end of the initial migration. Regenerating the migration silently drops every guarantee: student-code format, capacity ceilings, one current semester per campus, admins without a campus.
- **Every temporal column needs an explicit `@db.Timestamptz(6)`** — Prisma's `DateTime` maps to `timestamp(3)` *without* a timezone, and this system hinges on exact instants.
- **Groups and preferences reference `semester_subjects`, never `subjects`.** That is what makes it impossible to create a group for a subject the semester does not offer.
- **Student codes are exactly 9 digits**, enforced in four places at once: `taev.config.json`, the Frontend store, `TAEV_STUDENT_CODE_LENGTH`, and a DB CHECK.
- **No query outside `Backend/models/`** — not even a "simple CRUD" `findMany` in a controller. Add a function to the model and call it from above. Services that need a transaction use `transaction()` from `config/db.js` and pass the `tx` down to the models.
- After touching the schema, run `Database/scripts/verify_constraints.sql` against a throwaway database.
