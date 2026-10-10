// RQ-03: quem pode excluir um pedido. ADMIN: sempre. GERENTE: somente pedido ABERTO. OPERADOR e visitante (null): nunca.
export function podeExcluir(usuario, pedido) {
  if (!usuario) return false;
  if (usuario.perfil === 'ADMIN') return true;
  if (usuario.perfil === 'GERENTE') return pedido.status === 'ABERTO';
  return false;
}
