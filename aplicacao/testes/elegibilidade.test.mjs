import test from 'node:test';
import assert from 'node:assert/strict';
import { elegivel } from '../src/elegibilidade.mjs';

test('adulto de 30 anos é elegível', () => {
  assert.equal(elegivel(30), true);
});
