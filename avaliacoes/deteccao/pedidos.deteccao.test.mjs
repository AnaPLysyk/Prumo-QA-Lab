import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './app.mjs';

// Cenário mínimo do caso 4 (RQ-04): o oráculo é o ESTADO do dado depois da recusa, não só o erro.
const { criarLoja } = await carregar('pedidos.mjs');
test('exclusão recusada mantém o pedido existente e inalterado', () => {
  const original = { id: 1, status: 'FECHADO', itens: 2 };
  const loja = criarLoja([original]);
  assert.throws(() => loja.excluir(1, { perfil: 'OPERADOR' }), /não autorizada/);
  assert.deepEqual(loja.obter(1), original);
  assert.equal(loja.total(), 1);
});
