import { podeExcluir } from './acesso.mjs';

// RQ-04: uma exclusão recusada não pode alterar nenhum dado existente.
export function criarLoja(pedidosIniciais = []) {
  const pedidos = new Map(pedidosIniciais.map((p) => [p.id, { ...p }]));
  return {
    obter: (id) => (pedidos.has(id) ? { ...pedidos.get(id) } : undefined),
    total: () => pedidos.size,
    excluir(id, usuario) {
      const pedido = pedidos.get(id);
      if (!pedido) throw new Error('pedido inexistente');
      if (!podeExcluir(usuario, pedido)) throw new Error('exclusão não autorizada');
      pedidos.delete(id);
    }
  };
}
