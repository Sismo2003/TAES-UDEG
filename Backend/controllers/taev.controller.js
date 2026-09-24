/**
 * taev.controller.js — portal público. req/res fino; la lógica vive en el
 * service. Los `message` de error son sentencias machine-readable que el
 * Frontend ramifica (Docs/HANDOFF.md §4).
 */
import * as taev from '../services/taev.service.js';
import { isExposable } from '../utils/apiError.js';

/** Traduce un error a la respuesta del envelope. Nunca filtra `err.message`
 *  crudo ni `err.stack`: sólo sentencias conocidas. */
function fail(res, err, tag) {
  // Doble click / dos pestañas: la unicidad de la BD lo atrapa como P2002.
  if (err?.code === 'P2002') {
    return res.status(409).json({ data: false, message: 'ALREADY_SUBMITTED' });
  }
  if (isExposable(err)) {
    return res.status(err.status).json({ data: false, message: err.message });
  }
  console.error(`[TAEV] ${tag}:`, err);
  return res.status(500).json({ data: false, message: 'INTERNAL_ERROR' });
}

export const status = async (req, res) => {
  try {
    const data = await taev.getStatus(req.query.campus);
    return res.status(200).json({ data });
  } catch (err) {
    return fail(res, err, 'status');
  }
};

export const verifyCode = async (req, res) => {
  try {
    const { code, campus } = req.body ?? {};
    const data = await taev.verifyCode(campus, code);
    return res.status(200).json({ data, message: 'CODE_OK' });
  } catch (err) {
    return fail(res, err, 'verifyCode');
  }
};

export const submit = async (req, res) => {
  try {
    const { code, campus, preferences } = req.body ?? {};
    const data = await taev.submitPreferences({
      campusCode: campus,
      code,
      preferences,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    return res.status(201).json({ data, message: 'SUBMITTED' });
  } catch (err) {
    return fail(res, err, 'submit');
  }
};
