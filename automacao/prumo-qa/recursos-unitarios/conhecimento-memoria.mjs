import { mock } from 'node:test';
import { memoria } from './conhecimento-falso.mjs';
import substitutos from './conhecimento-substitutos.cjs';
// Troca cada função do banco de conhecimento pela versão em memória (mesma lista do hook do runner).
for (const [arquivo, [exportado, nome]] of Object.entries(substitutos)) mock.module('../../../dist/' + arquivo, { exports: { [exportado]: memoria[nome] } });
