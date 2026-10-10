import test from 'node:test';
import assert from 'node:assert/strict';
import { frete } from '../src/frete.mjs';

test('frete para SUL é 10', () => assert.equal(frete('SUL'), 10));
test('frete para SUDESTE é 10', () => assert.equal(frete('SUDESTE'), 10));
test('frete para NORDESTE é 20', () => assert.equal(frete('NORDESTE'), 20));
test('região desconhecida é recusada', () => assert.throws(() => frete('LUA'), RangeError));
