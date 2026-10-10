import { writeFileSync } from 'node:fs';
import { total } from './total-a.mjs';
import { total as totalAlternativo } from './total-b.mjs';
export async function relatorio(itens, rota = 'principal') {
  const modulo = await import('./' + 'formatacao' + '.mjs');
  const soma = rota === 'principal' ? total(itens) : totalAlternativo(itens);
  return { estado: 'NOVO', total: soma, texto: modulo.formatar(soma) };
}
export async function gerarEGravar(itens, arquivo) {
  if (!Array.isArray(itens)) throw new TypeError('Itens inválidos');
  const resultado = await relatorio(itens);
  writeFileSync(arquivo, JSON.stringify(resultado));
  return resultado;
}
