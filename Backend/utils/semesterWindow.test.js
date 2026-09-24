/**
 * Tests de la ventana de envío. Corre con `npm test` (node:test, sin deps).
 *
 * Esta es la lógica que decide quién alcanza a registrarse y quién no, en una
 * ventana de 15 minutos que ocurre una vez por semestre y no se puede repetir.
 * Los casos borde de acá no son teóricos: son el milisegundo exacto de cierre,
 * el kill switch a mitad de la ventana, y el admin reabriendo para un rezagado.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSemesterWindow,
  windowMessage,
  deriveClosesAt,
  WINDOW_MODE,
  WINDOW_REASON,
} from './semesterWindow.js';

const OPENS = new Date('2026-08-22T16:00:00.000Z'); // 10:00 en CDMX (UTC-6)
const CLOSES = new Date('2026-08-22T16:15:00.000Z'); // +15 min

const semester = (windowMode = WINDOW_MODE.SCHEDULED) => ({
  opensAt: OPENS,
  closesAt: CLOSES,
  windowMode,
});

const at = (iso) => new Date(iso);

// ─────────────────────────────────────────────────────────────────────────────
// Modo scheduled — manda el reloj
// ─────────────────────────────────────────────────────────────────────────────

test('scheduled: cerrado un instante antes de abrir', () => {
  const w = resolveSemesterWindow(semester(), at('2026-08-22T15:59:59.999Z'));
  assert.equal(w.isOpen, false);
  assert.equal(w.reason, WINDOW_REASON.NOT_YET_OPEN);
});

test('scheduled: abierto en el instante exacto de apertura (borde inclusivo)', () => {
  const w = resolveSemesterWindow(semester(), OPENS);
  assert.equal(w.isOpen, true);
  assert.equal(w.reason, WINDOW_REASON.OPEN_SCHEDULED);
});

test('scheduled: abierto a mitad de la ventana', () => {
  const w = resolveSemesterWindow(semester(), at('2026-08-22T16:07:30.000Z'));
  assert.equal(w.isOpen, true);
});

test('scheduled: abierto el último milisegundo útil', () => {
  const w = resolveSemesterWindow(semester(), at('2026-08-22T16:14:59.999Z'));
  assert.equal(w.isOpen, true);
});

test('scheduled: CERRADO en el instante exacto de cierre (intervalo semiabierto)', () => {
  // El borde que más importa: en closesAt ya no se acepta. Sin esto, dos
  // lecturas del mismo instante podrían discrepar.
  const w = resolveSemesterWindow(semester(), CLOSES);
  assert.equal(w.isOpen, false);
  assert.equal(w.reason, WINDOW_REASON.CLOSED_SCHEDULED);
});

test('scheduled: cerrado después de la ventana', () => {
  const w = resolveSemesterWindow(semester(), at('2026-08-22T18:00:00.000Z'));
  assert.equal(w.isOpen, false);
  assert.equal(w.reason, WINDOW_REASON.CLOSED_SCHEDULED);
});

// ─────────────────────────────────────────────────────────────────────────────
// force_closed — el kill switch. Gana SIEMPRE.
// ─────────────────────────────────────────────────────────────────────────────

test('force_closed: cierra a mitad de la ventana programada', () => {
  // Este es EL caso que el diseño viejo (`ventana OR is_open`) no podía
  // expresar: con el OR, el formulario seguía abierto.
  const w = resolveSemesterWindow(semester(WINDOW_MODE.FORCE_CLOSED), at('2026-08-22T16:07:30.000Z'));
  assert.equal(w.isOpen, false);
  assert.equal(w.reason, WINDOW_REASON.FORCED_CLOSED);
});

test('force_closed: cerrado también en el instante exacto de apertura', () => {
  const w = resolveSemesterWindow(semester(WINDOW_MODE.FORCE_CLOSED), OPENS);
  assert.equal(w.isOpen, false);
});

test('force_closed: cerrado antes, durante y después — sin excepción', () => {
  const momentos = [
    '2026-08-22T10:00:00.000Z',
    '2026-08-22T16:00:00.000Z',
    '2026-08-22T16:07:30.000Z',
    '2026-08-22T16:15:00.000Z',
    '2027-01-01T00:00:00.000Z',
  ];
  for (const m of momentos) {
    const w = resolveSemesterWindow(semester(WINDOW_MODE.FORCE_CLOSED), at(m));
    assert.equal(w.isOpen, false, `debería estar cerrado en ${m}`);
    assert.equal(w.reason, WINDOW_REASON.FORCED_CLOSED);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// force_open — reabrir para rezagados
// ─────────────────────────────────────────────────────────────────────────────

test('force_open: abre antes de la hora programada', () => {
  const w = resolveSemesterWindow(semester(WINDOW_MODE.FORCE_OPEN), at('2026-08-20T00:00:00.000Z'));
  assert.equal(w.isOpen, true);
  assert.equal(w.reason, WINDOW_REASON.FORCED_OPEN);
});

test('force_open: reabre después de que la ventana cerró', () => {
  const w = resolveSemesterWindow(semester(WINDOW_MODE.FORCE_OPEN), at('2026-08-23T00:00:00.000Z'));
  assert.equal(w.isOpen, true);
  assert.equal(w.reason, WINDOW_REASON.FORCED_OPEN);
});

// ─────────────────────────────────────────────────────────────────────────────
// Sin semestre activo
// ─────────────────────────────────────────────────────────────────────────────

test('sin semestre activo: cerrado, sin fechas, sin reventar', () => {
  const w = resolveSemesterWindow(null, OPENS);
  assert.equal(w.isOpen, false);
  assert.equal(w.reason, WINDOW_REASON.NO_ACTIVE_SEMESTER);
  assert.equal(w.opensAt, null);
  assert.equal(w.closesAt, null);
  assert.equal(w.opensInMs, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Metadatos para el Frontend
// ─────────────────────────────────────────────────────────────────────────────

test('devuelve serverTime y cuenta regresiva para corregir el reloj del cliente', () => {
  const now = at('2026-08-22T15:55:00.000Z');
  const w = resolveSemesterWindow(semester(), now);
  assert.equal(w.serverTime, '2026-08-22T15:55:00.000Z');
  assert.equal(w.opensInMs, 5 * 60_000);
  assert.equal(w.closesInMs, 20 * 60_000);
});

test('opensInMs es negativo una vez que la ventana abrió', () => {
  const w = resolveSemesterWindow(semester(), at('2026-08-22T16:05:00.000Z'));
  assert.ok(w.opensInMs < 0);
  assert.equal(w.closesInMs, 10 * 60_000);
});

test('acepta fechas como string ISO, no sólo Date', () => {
  const w = resolveSemesterWindow(
    { opensAt: OPENS.toISOString(), closesAt: CLOSES.toISOString(), windowMode: WINDOW_MODE.SCHEDULED },
    at('2026-08-22T16:05:00.000Z'),
  );
  assert.equal(w.isOpen, true);
});

test('cada razón tiene un mensaje para el alumno', () => {
  for (const reason of Object.values(WINDOW_REASON)) {
    assert.equal(typeof windowMessage(reason), 'string');
    assert.ok(windowMessage(reason).length > 0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveClosesAt
// ─────────────────────────────────────────────────────────────────────────────

test('deriveClosesAt suma los minutos correctos', () => {
  assert.equal(deriveClosesAt(OPENS, 15).toISOString(), CLOSES.toISOString());
});

test('deriveClosesAt cruza el cambio de día sin perderse', () => {
  const result = deriveClosesAt(new Date('2026-08-22T23:50:00.000Z'), 20);
  assert.equal(result.toISOString(), '2026-08-23T00:10:00.000Z');
});

test('deriveClosesAt rechaza duraciones inválidas', () => {
  for (const malo of [0, -5, 1.5, NaN, '15', null, undefined]) {
    assert.throws(() => deriveClosesAt(OPENS, malo), RangeError, `debería rechazar ${String(malo)}`);
  }
});
