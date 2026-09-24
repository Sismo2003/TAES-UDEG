/**
 * semesterWindow.js — LA ÚNICA fuente de verdad sobre si el formulario acepta
 * envíos en este instante.
 *
 * Regla de oro: ningún controller, service ni componente del Frontend decide
 * esto por su cuenta. Todos llaman acá. Un segundo lugar que "también" calcule
 * la ventana es exactamente cómo un sistema termina aceptando un envío después
 * de cerrar.
 *
 * ── Por qué no es un booleano ────────────────────────────────────────────────
 *
 * El diseño anterior era `NOW() ∈ ventana OR is_open = true`. Ese OR tiene un
 * agujero fatal: con `is_open = false` DENTRO de la ventana programada, el
 * formulario sigue abierto. O sea que el admin no podía cerrar antes de tiempo
 * — justo la acción que más se necesita cuando algo sale mal en una ventana de
 * 15 minutos en vivo (se filtró el link, se subió el padrón equivocado, se
 * abrió sin querer).
 *
 * Un booleano no puede expresar tres intenciones distintas, así que el modo es
 * un enum con PRECEDENCIA ABSOLUTA, no una condición más en un OR:
 *
 *   force_closed → CERRADO. Gana sobre todo. Este es el kill switch.
 *   force_open   → ABIERTO. Gana sobre el horario (reabrir para rezagados).
 *   scheduled    → manda el reloj: abierto si NOW() ∈ [opensAt, closesAt).
 *
 * El intervalo es semiabierto: en el milisegundo exacto de `closesAt` ya está
 * cerrado. Un intervalo cerrado deja una rendija de un instante donde dos
 * lecturas del mismo momento pueden discrepar.
 *
 * @module utils/semesterWindow
 */

/** Valores del enum `semester_window_mode` de PostgreSQL. */
export const WINDOW_MODE = Object.freeze({
  SCHEDULED: 'scheduled',
  FORCE_OPEN: 'force_open',
  FORCE_CLOSED: 'force_closed',
});

/**
 * Razones machine-readable (UPPER_SNAKE_CASE, como pide la convención del
 * Backend). El Frontend ramifica por estas, no por la prosa del `message`.
 */
export const WINDOW_REASON = Object.freeze({
  /** No hay semestre marcado `is_current`. El portal no tiene a qué apuntar. */
  NO_ACTIVE_SEMESTER: 'NO_ACTIVE_SEMESTER',
  /** Kill switch activo. Cerrado por decisión explícita del admin. */
  FORCED_CLOSED: 'FORCED_CLOSED',
  /** Abierto por decisión explícita del admin, fuera de horario. */
  FORCED_OPEN: 'FORCED_OPEN',
  /** Abierto porque el reloj está dentro de la ventana programada. */
  OPEN_SCHEDULED: 'OPEN_SCHEDULED',
  /** Todavía no abre. El Frontend muestra cuenta regresiva. */
  NOT_YET_OPEN: 'NOT_YET_OPEN',
  /** La ventana programada ya pasó. */
  CLOSED_SCHEDULED: 'CLOSED_SCHEDULED',
});

/**
 * @typedef {Object} WindowState
 * @property {boolean}     isOpen      Si el formulario acepta envíos AHORA.
 * @property {string}      reason      Una de WINDOW_REASON.
 * @property {string}      mode        El `windowMode` del semestre.
 * @property {string|null} opensAt     ISO 8601, o null si no hay semestre.
 * @property {string|null} closesAt    ISO 8601, o null si no hay semestre.
 * @property {string}      serverTime  ISO 8601 del instante evaluado.
 * @property {number|null} opensInMs   ms hasta abrir (negativo si ya pasó).
 * @property {number|null} closesInMs  ms hasta cerrar (negativo si ya pasó).
 */

/**
 * Resuelve el estado de la ventana de un semestre.
 *
 * Función pura: mismos argumentos ⇒ mismo resultado. No lee el reloj por su
 * cuenta ni toca la base. Eso la hace testeable de forma exhaustiva y es lo
 * que permite que el endpoint público devuelva `serverTime` para que el
 * Frontend corrija su propio desfase de reloj (en una ventana de 15 minutos,
 * un cliente 3 minutos adelantado es un alumno que cree que llegó tarde).
 *
 * @param {{ opensAt: Date|string, closesAt: Date|string, windowMode: string }|null} semester
 *        El semestre activo, o null si no hay ninguno.
 * @param {Date} [now=new Date()] Instante a evaluar. SIEMPRE server time.
 * @returns {WindowState}
 */
export function resolveSemesterWindow(semester, now = new Date()) {
  const serverTime = now.toISOString();

  if (!semester) {
    return {
      isOpen: false,
      reason: WINDOW_REASON.NO_ACTIVE_SEMESTER,
      mode: WINDOW_MODE.SCHEDULED,
      opensAt: null,
      closesAt: null,
      serverTime,
      opensInMs: null,
      closesInMs: null,
    };
  }

  const opensAt = new Date(semester.opensAt);
  const closesAt = new Date(semester.closesAt);
  const t = now.getTime();

  const base = {
    mode: semester.windowMode,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    serverTime,
    opensInMs: opensAt.getTime() - t,
    closesInMs: closesAt.getTime() - t,
  };

  // ── Precedencia absoluta. El orden de estos ifs ES la regla de negocio. ──

  // 1. Kill switch. Cerrado y punto: no se consulta el reloj.
  if (semester.windowMode === WINDOW_MODE.FORCE_CLOSED) {
    return { ...base, isOpen: false, reason: WINDOW_REASON.FORCED_CLOSED };
  }

  // 2. Apertura forzada. Abierto y punto.
  if (semester.windowMode === WINDOW_MODE.FORCE_OPEN) {
    return { ...base, isOpen: true, reason: WINDOW_REASON.FORCED_OPEN };
  }

  // 3. Programado: manda el reloj. Intervalo semiabierto [opensAt, closesAt).
  if (t < opensAt.getTime()) {
    return { ...base, isOpen: false, reason: WINDOW_REASON.NOT_YET_OPEN };
  }
  if (t >= closesAt.getTime()) {
    return { ...base, isOpen: false, reason: WINDOW_REASON.CLOSED_SCHEDULED };
  }
  return { ...base, isOpen: true, reason: WINDOW_REASON.OPEN_SCHEDULED };
}

/**
 * Mensaje para el alumno según la razón. Prosa separada de la lógica: cambiar
 * un texto nunca debe poder cambiar quién entra y quién no.
 *
 * @param {string} reason Una de WINDOW_REASON.
 * @returns {string}
 */
export function windowMessage(reason) {
  switch (reason) {
    case WINDOW_REASON.NO_ACTIVE_SEMESTER:
      return 'El registro de TAEV no está disponible en este momento.';
    case WINDOW_REASON.FORCED_CLOSED:
      return 'El registro está cerrado por la coordinación.';
    case WINDOW_REASON.NOT_YET_OPEN:
      return 'El registro todavía no abre. Vuelve a la hora indicada.';
    case WINDOW_REASON.CLOSED_SCHEDULED:
      return 'El periodo de registro ya cerró.';
    case WINDOW_REASON.FORCED_OPEN:
    case WINDOW_REASON.OPEN_SCHEDULED:
      return 'El registro está abierto.';
    default:
      return 'El registro no está disponible en este momento.';
  }
}

/**
 * Deriva `closesAt` a partir de `opensAt` + duración en minutos.
 *
 * El admin piensa en "abre a las 10:00 y dura 15 minutos", pero la base guarda
 * los dos extremos como timestamps reales (así la consulta usa índice y el fin
 * de la ventana tiene un solo lugar donde vive). Esta función es el puente, y
 * es el ÚNICO lugar donde se hace esa cuenta.
 *
 * @param {Date|string} opensAt
 * @param {number} durationMinutes Entero > 0.
 * @returns {Date}
 * @throws {RangeError} Si la duración no es un entero positivo.
 */
export function deriveClosesAt(opensAt, durationMinutes) {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new RangeError('durationMinutes debe ser un entero positivo.');
  }
  return new Date(new Date(opensAt).getTime() + durationMinutes * 60_000);
}
