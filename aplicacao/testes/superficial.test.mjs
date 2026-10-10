import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarCupom } from '../src/cupom.mjs';

test.skip('cupom PRUMO10 concede 10% de desconto', () => {
  assert.equal(aplicarCupom('PRUMO10', 200), 180);
});
test('aplicar cupom retorna um número', () => {
  assert.equal(typeof aplicarCupom('PRUMO10', 200), 'number');
});
