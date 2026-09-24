/**
 * adminAuth.controller.js — login del panel y perfil del usuario actual.
 */
import * as authService from '../services/auth.service.js';
import { isExposable } from '../utils/apiError.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const data = await authService.login(email, password);
    return res.status(200).json({ data, message: 'LOGIN_OK' });
  } catch (err) {
    if (isExposable(err)) {
      return res.status(err.status).json({ data: false, message: err.message });
    }
    console.error('[AUTH] login:', err);
    return res.status(500).json({ data: false, message: 'INTERNAL_ERROR' });
  }
};

/** GET /api/admin/auth/me — datos frescos ya cargados por requireAuth. */
export const me = async (req, res) => {
  const { id, email, fullName, role, campusId } = req.user;
  return res.status(200).json({ data: { id, email, fullName, role, campusId } });
};
