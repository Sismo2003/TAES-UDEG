/**
 * auth.service.js — login del panel admin. JWT firmado con `JWT_SECRET`; el
 * payload sólo lleva `sub` (el id). Rol y campus se re-leen de la BD en cada
 * request (ver auth.middleware.js).
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as userModel from '../models/user.model.js';
import { AUTH_CONFIG } from '../config/main.js';
import { apiError } from '../utils/apiError.js';

export async function login(email, password) {
  if (!email || !password) throw apiError(400, 'MISSING_CREDENTIALS');

  const user = await userModel.findByEmailWithSecret(email);

  // Mismo error para "no existe" y "password mal": no filtra qué emails existen.
  const ok = user && user.isActive && (await bcrypt.compare(String(password), user.passwordHash));
  if (!ok) throw apiError(401, 'INVALID_CREDENTIALS');

  const token = jwt.sign({ sub: String(user.id) }, AUTH_CONFIG.jwtSecret, {
    expiresIn: AUTH_CONFIG.jwtExpiresIn,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      campusId: user.campusId,
    },
  };
}
