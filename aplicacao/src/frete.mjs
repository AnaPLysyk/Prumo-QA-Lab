// RQ-02: o frete depende da região. SUL e SUDESTE: 10; NORDESTE e NORTE: 20; CENTRO_OESTE: 15.
const tabela = { SUL: 10, SUDESTE: 10, NORDESTE: 20, NORTE: 20, CENTRO_OESTE: 15 };
export function frete(regiao) {
  if (!Object.hasOwn(tabela, regiao)) throw new RangeError('região desconhecida');
  return tabela[regiao];
}
