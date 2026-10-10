import test from 'node:test';
import assert from 'node:assert/strict';
import { criarLoja } from '../src/pedidos.mjs';

const pedidos = () => [{ id: 1, status: 'FECHADO', itens: 2 }];

test('operador não consegue excluir (lança erro)', () => {
  const loja = criarLoja(pedidos());
  assert.throws(() => loja.excluir(1, { perfil: 'OPERADOR' }), /não autorizada/);
});
test('admin exclui pedido existente', () => {
  const loja = criarLoja(pedidos());
  loja.excluir(1, { perfil: 'ADMIN' });
  assert.equal(loja.total(), 0);
});
