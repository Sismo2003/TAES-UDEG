# Routes

Un `express.Router()` por feature. Se monta en `app.js`:

```js
// app.js
import ejemploRouter from './routes/ejemplo.js';
app.use('/api/ejemplo', ejemploRouter);
```

Convención de archivo: `<recurso>.js` en minúscula.
