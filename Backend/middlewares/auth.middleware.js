/**
 * auth.middleware.js — guards del panel admin.
 *
 * Convención del proyecto (Docs/DATABASE.md §3.3): el rol y el campus se
 * RE-LEEN de la BD en cada request. El token sólo aporta el `id`; nunca se
 * confía en el `role`/`campusId` que venga en el payload.
 */
import jwt from 'jsonwebtoken';
import * as userModel from '../models/user.model.js';
import { AUTH_CONFIG } from '../config/main.js';
import { apiError } from '../utils/apiError.js';

/** Verifica el Bearer token y adjunta `req.user` con datos frescos de la BD. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw apiError(401, 'UNAUTHENTICATED');

    let payload;
    try {
      payload = jwt.verify(token, AUTH_CONFIG.jwtSecret);
    } catch {
      throw apiError(401, 'INVALID_TOKEN');
    }

    const user = await userModel.findAuthById(payload.sub);
    if (!user || !user.isActive) throw apiError(401, 'UNAUTHENTICATED');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Exige que `req.user.role` esté entre los permitidos. Usar después de requireAuth. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(apiError(403, 'FORBIDDEN'));
    }
    next();
  };
}
