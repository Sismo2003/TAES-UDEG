/** MAIN IMPORTS **/
import express from "express";
import morgan from "morgan";
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ALLOWED_ORIGINS, NODE_ENV } from "./config/main.js";

/** ROUTES IMPORTS **/
import taevRouter from './routes/taev.js';
import adminRouter from './routes/admin.js';
import { isExposable } from './utils/apiError.js';

/** APP CODE */

const app = express();

/** TRUST PROXY: si la app corre detrás de un reverse proxy / nginx,
 *  necesario para que req.ip sea correcto en los rate limiters */
app.set('trust proxy', 1);

/** HELMET — cabeceras de seguridad por defecto */
app.use(helmet());

/** RATE LIMITERS — límite global básico. Endpoints específicos (login,
 *  contacto) deben tener su propio limiter más estricto. */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ data: false, message: 'Demasiadas solicitudes, intenta más tarde.' });
  },
});
app.use(globalLimiter);

/** MIDDLEWARES BÁSICOS — JSON pequeño (este API es de formularios/listas,
 *  no de uploads). Si añades uploads multipart, van por multer con su propio
 *  límite, no por este parser. */
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));

/** CORS */
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/** COOKIE PARSER */
app.use(cookieParser());

/** LOGGER */
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

/** HEALTH CHECK — útil para smoke tests y load balancers */
app.get('/health', (_req, res) => {
  res.status(200).json({ data: true, status: 'ok', env: NODE_ENV });
});

/** RUTAS — monta aquí cada router por feature */
app.use('/api/taev', taevRouter);
app.use('/api/admin', adminRouter);

/** 404 — catch-all para rutas no registradas */
app.use((req, res) => {
  res.status(404).json({ data: false, message: `Ruta no encontrada: ${req.method} ${req.path}` });
});

/** ERROR HANDLER — siempre el último middleware */
app.use((err, _req, res, _next) => {
  // Errores con status + message machine-readable (p. ej. de los guards de
  // auth vía next(err)) se exponen tal cual; el resto cae en el 500 genérico.
  if (isExposable(err)) {
    return res.status(err.status).json({ data: false, message: err.message });
  }
  console.error('[APP] Error no controlado:', err);
  res.status(500).json({ data: false, message: 'Error interno del servidor.' });
});

export default app;
