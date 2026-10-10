import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './app.mjs';

// Cenário mínimo dos casos 6 e 7 (RQ-06/RQ-07): comparar o total final com o valor esperado.
const { aplicarCupom } = await carregar('cupom.mjs');
test('PRUMO10 concede 10% de desconto: 200 vira 180', () => assert.equal(aplicarCupom('PRUMO10', 200), 180));
test('outro código não altera o total', () => assert.equal(aplicarCupom('OUTRO', 200), 200));
