# `models/` — la única capa que habla con Prisma

Regla dura del proyecto:

```
routes/       →  qué URL existe y qué guards corre
controllers/  →  sanitiza y valida el input, arma la respuesta del envelope
services/     →  reglas de negocio, transacciones, auditoría
models/       →  LA QUERY. Ningún otro archivo importa `prisma`.
```

**Ni un controller ni un service escriben `prisma.<tabla>.<op>()`.** Si hace
falta una consulta nueva, se agrega una función acá y se la llama desde arriba.
El objetivo es que la forma de una query (qué columnas, qué joins, qué orden,
qué índice va a usar) viva en un solo lugar auditable por tabla, y no
desparramada en los handlers HTTP.

## Convenciones

1. **Todas las funciones aceptan `client = prisma` como último parámetro.**
   Así un service las puede correr dentro de una transacción pasando el `tx`
   sin duplicar la query:

   ```js
   await prisma.$transaction(async (tx) => {
     const semester = await semesterModel.findById(id, tx);
     await auditModel.write({ ... }, tx);
   });
   ```

2. **Los modelos reciben filtros de dominio, no fragmentos de `where` de
   Prisma.** `listByCampus(campusId)` — con `null` = todos los campus — en vez
   de que el llamador arme `{ campusId }`. El `where` se construye acá.

3. **Los modelos no autorizan ni tiran errores HTTP.** Devuelven filas o
   `null`. Quien decide si un 404 es un 404 o un 403 es el service
   (`assertCampusAccess`), que es el que conoce al usuario.

4. **Los `select` explícitos viven acá** como constantes por modelo
   (`LIST_SELECT`, `DETAIL_SELECT`): la superficie que la API expone de cada
   tabla se lee de un vistazo.

5. **SQL crudo permitido sólo acá**, parametrizado con template tags de Prisma
   (`$executeRaw` con `${}`, nunca concatenación). Hoy son dos, ambos en
   `group.model.js` y documentados en `Docs/DATABASE.md` §7.3: el advisory lock
   del allocator y el recálculo de `assigned_count`.

## Paginación

Los listados que la tabla del panel consume devuelven siempre la misma forma:

```js
{ rows, total }
```

El controller la convierte en `{ data: { rows, total, page, pageSize } }`. Los
límites de `page`/`pageSize` los impone `utils/queryParams.js`, no el modelo.
