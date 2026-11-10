import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShift, SHIFTS } from './shift.js';

test('parseShift: ausente o vacío ⇒ null', () => {
  assert.equal(parseShift(undefined), null);
  assert.equal(parseShift(null), null);
  assert.equal(parseShift('  '), null);
});

test('parseShift: normaliza mayúsculas y espacios', () => {
  assert.equal(parseShift('Matutino'), 'matutino');
  assert.equal(parseShift(' VESPERTINO '), 'vespertino');
});

test('parseShift: valor desconocido ⇒ 400 INVALID_SHIFT', () => {
  assert.throws(() => parseShift('nocturno'), (err) => err.status === 400 && err.message === 'INVALID_SHIFT');
});

test('SHIFTS coincide con el enum de la BD', () => {
  assert.deepEqual([...SHIFTS], ['matutino', 'vespertino']);
});
