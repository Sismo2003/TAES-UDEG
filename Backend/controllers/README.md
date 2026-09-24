# Controllers

Cada archivo aquí maneja un recurso o feature. Convención:

- **Una controller por recurso**, exporta funciones nombradas (`export const list = ...`).
- **Validación de input primero**, luego llamada al modelo/servicio.
- **Shape de respuesta uniforme**: `{ data, message }` (ver skill `backend`).
- **Try/catch con tag de módulo** en el log de errores, ej: `[AUTH]`, `[LEADS]`.

## Cómo empezar

1. Crea `controllers/<recurso>.controller.js`
2. Crea el modelo correspondiente en `prisma/schema.prisma` + migración
3. Crea la ruta en `routes/<recurso>.js`
4. Monta el router en `app.js`

Ejemplo mínimo (referencia):

```js
// controllers/ejemplo.controller.js
import { prisma } from '../config/db.js';

export const list = async (_req, res) => {
  try {
    const items = await prisma.ejemplo.findMany();
    res.status(200).json({ data: items });
  } catch (err) {
    console.error('[EJEMPLO] Error interno:', err);
    res.status(500).json({ data: false, message: 'Error interno del servidor.' });
  }
};
```
