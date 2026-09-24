/**
 * apiError.js — error con status HTTP y mensaje seguro de exponer al cliente.
 *
 * `message` es una sentencia machine-readable (UPPER_SNAKE_CASE) que el
 * Frontend ramifica; NO es prosa ni lleva `err.stack`. El error handler y los
 * controllers reconocen `expose === true` para mandarlo tal cual; cualquier
 * otro error cae en el 500 genérico.
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.expose = true;
  }
}

/** Atajo: `throw apiError(404, 'CODE_NOT_FOUND')`. */
export function apiError(status, message) {
  return new ApiError(status, message);
}

/** True si el error es seguro de mandar al cliente con su status y message. */
export function isExposable(err) {
  return Boolean(err && err.expose && Number.isInteger(err.status));
}
