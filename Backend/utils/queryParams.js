/**
 * queryParams.js — sanitización del input que llega por querystring.
 *
 * Vive en `utils/` y no en los controllers para que "qué es una página válida"
 * o "cuánto puede pedir un cliente" tenga una sola definición. El controller
 * llama a estos helpers y le pasa al modelo valores ya normalizados: el modelo
 * nunca ve un string del cliente.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/**
 * `?page=2&pageSize=50` → `{ page, pageSize, skip, take }`.
 * Fuera de rango o basura ⇒ default, nunca error: un listado no se cae porque
 * alguien escribió `?page=abc` en la barra de direcciones.
 */
export function parsePagination(query = {}, options = {}) {
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE;
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;

  const rawPage = Number(query.page);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawSize = Number(query.pageSize ?? query.limit);
  const pageSize =
    Number.isInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, maxPageSize) : defaultPageSize;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Texto de búsqueda: recortado, acotado en largo, `null` si queda vacío. */
export function parseSearch(raw, maxLength = 80) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : null;
}

/** `"true"`/`"false"`/`"1"`/`"0"` → boolean. Cualquier otra cosa ⇒ `null` (sin filtro). */
export function parseOptionalBool(raw) {
  if (raw === true || raw === 'true' || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === '0') return false;
  return null;
}

/** Entero positivo o `null`. Para ids que vienen de la URL o del querystring. */
export function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Valor de un conjunto cerrado (estados, modos). Fuera del set ⇒ `null`. */
export function parseEnum(raw, allowed) {
  return allowed.includes(raw) ? raw : null;
}

/**
 * Ordenamiento seguro: el cliente manda un nombre de columna y una dirección,
 * pero sólo se aceptan los que el endpoint declara. Nunca se interpola lo que
 * mande el cliente en un `orderBy` sin pasar por acá.
 */
export function parseSort(raw, allowedFields, fallback) {
  const [field, dir] = String(raw ?? '').split(':');
  if (!allowedFields.includes(field)) return fallback;
  return { field, dir: dir === 'desc' ? 'desc' : 'asc' };
}
