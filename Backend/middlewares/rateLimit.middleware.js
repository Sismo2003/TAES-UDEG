/**
 * rateLimit.middleware.js — limiters específicos por endpoint.
 *
 * El limiter global de `app.js` (300 req / 15 min) es demasiado laxo para el
 * portal público: cientos de alumnos entran en la misma ventana de 15 minutos,
 * muchos desde la MISMA red de la escuela (misma IP saliente). Un limiter por
 * IP demasiado estricto bloquea a una clase entera; los defaults
 * (`TAEV_CONFIG.submitRateLimitMax` / `submitRateLimitWindowMs`) están pensados
 * para eso — verificar contra el caso real antes de la primera corrida en vivo.
 */
import rateLimit from 'express-rate-limit';
import { TAEV_CONFIG } from '../config/main.js';

/** Aplica a `POST /api/taev/verify-code` y `POST /api/taev/submit`. */
export const taevSubmitLimiter = rateLimit({
  windowMs: TAEV_CONFIG.submitRateLimitWindowMs,
  max: TAEV_CONFIG.submitRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ data: false, message: 'RATE_LIMITED' });
  },
});
