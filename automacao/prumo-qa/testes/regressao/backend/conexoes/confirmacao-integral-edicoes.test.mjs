import test from 'node:test';
import assert from 'node:assert/strict';
import { editarCasoNoQase } from '../../../../dist/testes/integracoes/editarCasoNoQase.js';
import { editarTicket } from '../../../../dist/tickets/integracoes/editarTicket.js';

const recursoQase = { chave: 'QA' };
const recursoJira = { chave: 'QA' };

test('Qase: editar somente descricao exige releitura e nao confirma campo divergente', async () => {
  let leituras = 0;
  const ctx = { ler: async () => { leituras++; return { result: { description: 'texto antigo' } }; } };
  const resultado = await editarCasoNoQase.confirmar(ctx, recursoQase, { casoId: 11, descricao: 'texto novo' });
  assert.equal(resultado, false);
  assert.equal(leituras, 1);
});

test('Qase: confirma somente quando todos os campos enviados correspondem', async () => {
  const ctx = { ler: async () => ({ result: { title: 'Novo caso', description: 'Nova descricao', priority: 2, isManual: true, isToBeAutomated: false } }) };
  assert.equal(await editarCasoNoQase.confirmar(ctx, recursoQase, { casoId: 11, titulo: 'Novo caso', descricao: 'Nova descricao', prioridade: 2, automacao: 'manual' }), true);
  assert.equal(await editarCasoNoQase.confirmar(ctx, recursoQase, { casoId: 11, titulo: 'Novo caso', descricao: 'Outra descricao' }), false);
});

test('Jira: descricao nao conferida nao recebe sucesso', async () => {
  const urls = [];
  const ctx = { ler: async (url) => { urls.push(url); return { fields: { summary: 'Novo', description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'antigo' }] }] }, labels: ['existente'] } }; } };
  assert.equal(await editarTicket.confirmar(ctx, recursoJira, { ticket: 'QA-10', descricao: 'novo' }), false);
  assert.match(urls[0], /fields=summary,description,labels/);
  assert.equal(await editarTicket.confirmar(ctx, recursoJira, { ticket: 'QA-10', adicionarRotulos: ['novo'] }), false);
});

test('Jira: campos efetivamente alterados sao conferidos', async () => {
  const ctx = { ler: async () => ({ fields: { summary: 'Atualizado', description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'novo' }] }] }, labels: ['novo'] } }) };
  assert.equal(await editarTicket.confirmar(ctx, recursoJira, { ticket: 'QA-10', resumo: 'Atualizado', descricao: 'novo', adicionarRotulos: ['novo'] }), true);
});
