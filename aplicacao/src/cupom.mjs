// RQ-06: o cupom PRUMO10 concede 10% de desconto sobre o total. Qualquer outro código não altera o total.
export function aplicarCupom(codigo, total) {
  if (total < 0) throw new RangeError('total negativo');
  return codigo === 'PRUMO10' ? Math.round(total * 0.9 * 100) / 100 : total;
}
