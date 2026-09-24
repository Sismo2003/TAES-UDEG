/**
 * user.model.js — queries sobre `users` (administradores del panel).
 *
 * `passwordHash` sale de la base en UNA sola función (`findByEmailWithSecret`),
 * usada exclusivamente por el login. Todo lo demás usa `SAFE_SELECT`, que no lo
 * incluye: así el hash no puede escaparse por accidente en un endpoint nuevo.
 */
import { prisma } from '../config/db.js';

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  campusId: true,
  isActive: true,
};

/** Identidad fresca para `requireAuth`: el token sólo aporta el id. */
export function findAuthById(id, client = prisma) {
  return client.user.findUnique({ where: { id: Number(id) }, select: SAFE_SELECT });
}

/**
 * Única query que devuelve `passwordHash`. El email se normaliza acá para que
 * "Admin@X.com" y "admin@x.com" sean el mismo usuario en todos los llamadores.
 */
export function findByEmailWithSecret(email, client = prisma) {
  return client.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
    select: { ...SAFE_SELECT, passwordHash: true },
  });
}
