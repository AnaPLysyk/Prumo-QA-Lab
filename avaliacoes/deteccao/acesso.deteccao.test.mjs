import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './app.mjs';

// Cenário mínimo do caso 3 (tabela de decisão, RQ-03): as combinações que o teste existente não cobre.
const { podeExcluir } = await carregar('acesso.mjs');
test('GERENTE exclui pedido ABERTO', () => assert.equal(podeExcluir({ perfil: 'GERENTE' }, { status: 'ABERTO' }), true));
test('GERENTE NÃO exclui pedido FECHADO', () => assert.equal(podeExcluir({ perfil: 'GERENTE' }, { status: 'FECHADO' }), false));
test('OPERADOR NÃO exclui nem pedido ABERTO', () => assert.equal(podeExcluir({ perfil: 'OPERADOR' }, { status: 'ABERTO' }), false));
