// Capacidade "integracao": exige banco de testes isolado, que não existe neste laboratório; fica bloqueada por contrato.
if (process.env.PRUMO_LAB_AMBIENTE_ISOLADO !== '1') {
  console.error('BLOCKED: ambiente de teste isolado não comprovado; nada foi executado.');
  process.exit(2);
}
console.error('BLOCKED: este laboratório não possui banco de testes.');
process.exit(2);
