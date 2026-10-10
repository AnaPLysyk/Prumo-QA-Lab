import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './app.mjs';

// Cenário mínimo do caso 1 (valores-limite, RQ-01): os quatro valores de fronteira do intervalo 18–65.
const { elegivel } = await carregar('elegibilidade.mjs');
test('17 está fora (limite inferior inválido)', () => assert.equal(elegivel(17), false));
test('18 está dentro (limite inferior válido)', () => assert.equal(elegivel(18), true));
test('65 está dentro (limite superior válido)', () => assert.equal(elegivel(65), true));
test('66 está fora (limite superior inválido)', () => assert.equal(elegivel(66), false));
