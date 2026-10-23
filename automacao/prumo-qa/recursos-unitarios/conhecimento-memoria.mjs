import { mock } from 'node:test';
import { memoria } from './conhecimento-falso.mjs';
import substitutos from './conhecimento-substitutos.cjs';
// Troca cada função do banco de conhecimento pela versão em memória (mesma lista do hook do runner); o resto do módulo continua real.
for (const [arquivo, mapa] of Object.entries(substitutos)) {
  const alvo = '../../../dist/' + arquivo;
  const real = await import(alvo);
  mock.module(alvo, { exports: { ...real, ...Object.fromEntries(Object.entries(mapa).map(([exportado, nome]) => [exportado, memoria[nome]])) } });
}
