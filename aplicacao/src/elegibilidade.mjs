// RQ-01: elegibilidade por idade. Intervalo fechado: 18 a 65 anos, inteiros.
export function elegivel(idade) {
  if (!Number.isInteger(idade)) throw new TypeError('idade deve ser um inteiro');
  return idade >= 18 && idade <= 65;
}
