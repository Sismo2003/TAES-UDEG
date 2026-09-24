/**
 * routes/taev.js — portal público de TAEV. Sin auth.
 *
 * `verify-code` y `submit` llevan un rate limiter propio, más estricto que el
 * global de `app.js` (ver rateLimit.middleware.js).
 */
import { Router } from 'express';
import { status, verifyCode, submit } from '../controllers/taev.controller.js';
import { taevSubmitLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.get('/status', status);
router.post('/verify-code', taevSubmitLimiter, verifyCode);
router.post('/submit', taevSubmitLimiter, submit);

export default router;
