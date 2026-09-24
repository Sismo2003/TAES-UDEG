# DDL

`schema.sql` es el esquema completo de la base — **sólo definición, cero
datos** — generado automáticamente a partir de
`Backend/prisma/migrations/*/migration.sql`.

Existe para que este repo (**público**) siempre tenga a la vista la
estructura real de la base sin que nadie tenga que levantar Postgres para
verla, y sin ningún riesgo de que se cuele un dato real: el generador
descarta todo `INSERT`/`UPDATE`/`DELETE`/`COPY`/`MERGE` de cada migración
antes de concatenarla.

**No editar `schema.sql` a mano.** Es un artefacto derivado. Para
regenerarlo:

```bash
node Database/scripts/generate-ddl.mjs
```

## Cuándo regenerarlo

Cada vez que se aplique una migración nueva de Prisma (ver la sección
"Base de datos — regla obligatoria" en el `CLAUDE.md` raíz). Si tocaste el
esquema y no corriste esto antes de commitear, `schema.sql` queda
desactualizado respecto a `schema.prisma` — no hay chequeo automático que lo
detecte todavía.
