/** Correções achadas na homologação real com o Qase (15/10/2026), reproduzidas sem rede. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixarIp, motivoDaRecusa } from '../../../../dist/conexoes/integracoes/requisitarServico.js';
import { consultarNoServico } from '../../../../dist/conexoes/integracoes/consultarNoServico.js';
import { ErroServico } from '../../../../dist/conexoes/integracoes/ErroServico.js';
import { codigoDaFalhaDeOperacao } from '../../../../dist/conexoes/escrita/codigoDaFalhaDeOperacao.js';

test('IP fixado responde no formato pedido: lista quando o Node chama com {all:true} (antes: "Invalid IP address: undefined")', () => {
  const lookup = fixarIp('3.134.200.51'); const r = [];
  lookup('api.qase.io', { all: true }, (...a) => r.push(a)); lookup('api.qase.io', { family: 4 }, (...a) => r.push(a)); lookup('api.qase.io', 4, (...a) => r.push(a));
  assert.deepEqual(r, [[null, [{ address: '3.134.200.51', family: 4 }]], [null, '3.134.200.51', 4], [null, '3.134.200.51', 4]]);
});

test('motivo da recusa: mensagem do Qase, Jira e GitHub, curta e sem segredo', () => {
  assert.equal(motivoDaRecusa(JSON.stringify({ status: false, errorMessage: 'Data is invalid.', errorFields: [{ field: 'isManual', error: 'Allowed values: 0, 1.' }] })), 'Data is invalid. · isManual: Allowed values: 0, 1.');
  assert.equal(motivoDaRecusa(JSON.stringify({ errorMessages: ['Campo obrigatório'], errors: { summary: 'vazio' } })), 'Campo obrigatório · summary: vazio');
  assert.equal(motivoDaRecusa(JSON.stringify({ message: 'Validation Failed', errors: [{ field: 'title', code: 'missing' }] })), 'Validation Failed · title missing');
  assert.doesNotMatch(motivoDaRecusa(JSON.stringify({ errorMessage: 'token=abc123segredo invalido' }), ['abc123segredo']), /abc123segredo/);
  assert.equal(motivoDaRecusa('<html>'), undefined);
  assert.ok(motivoDaRecusa(JSON.stringify({ errorMessage: 'x'.repeat(500) })).length <= 200);
  assert.equal(codigoDaFalhaDeOperacao(new ErroServico('SERVICE_RESPONSE_INVALID', undefined, 'isManual: Allowed values: 0, 1.')), 'SERVICE_RESPONSE_INVALID: isManual: Allowed values: 0, 1.');
});

test('plano do Qase sem external_issues (HTTP 402): a lista de casos é relida sem os vínculos e avisa, em vez de falhar', async () => {
  const pedidos = [];
  const a = { c: { id: 'c1', servico: 'qase', instancia: 'https://api.qase.io', contaId: 'conta', token: 'tk' }, escrita: async () => { throw new Error('não escreve'); },
    transporte: async (p) => { pedidos.push(p.caminho); if (p.caminho.includes('include=external_issues')) throw new ErroServico('SERVICE_PLAN_LIMIT', undefined, 'not available on your current plan'); return { status: true, result: { total: 1, filtered: 1, entities: [{ id: 1, title: 'Caso' }] } }; } };
  const r = await consultarNoServico(a, { id: 'PQ', chave: 'PQ', instancia: 'https://api.qase.io', contaId: 'conta' }, 'casos', { offset: 0, limite: 25 });
  assert.equal(pedidos.length, 2); assert.match(pedidos[0], /include=external_issues/); assert.doesNotMatch(pedidos[1], /include/);
  assert.deepEqual(r.dados.map((c) => c.id), [1]); assert.match(r.limitacao, /plano do Qase/);
  const outro = { ...a, transporte: async () => { throw new ErroServico('SERVICE_PERMISSION'); } };
  await assert.rejects(consultarNoServico(outro, { id: 'PQ', chave: 'PQ', instancia: 'https://api.qase.io', contaId: 'conta' }, 'casos', { offset: 0, limite: 25 }), (e) => e.codigo === 'SERVICE_PERMISSION', 'outros erros não são mascarados');
});

test('run no Qase: a releitura real não traz include_all_cases nem is_autotest e mesmo assim confirma', async () => {
  const { criarRunNoQaseOperacao: op } = await import('../../../../dist/testes/integracoes/criarRunNoQaseOperacao.js');
  const { marcadorDaOperacao } = await import('../../../../dist/conexoes/escrita/marcadorDaOperacao.js');
  const k = 'ab'.repeat(32); const p = { titulo: 'Run', descricao: '', casos: [1], autoteste: false };
  const real = { id: 1, title: 'Run', description: `[${marcadorDaOperacao(k)}]`, status: 1, environment: null, milestone: null, cases: [1] }; // formato do GET homologado
  const ctx = (r) => ({ ler: async () => ({ status: true, result: r }) });
  assert.equal(await op.confirmar(ctx(real), { chave: 'PQ' }, p, { id: '1' }, k), true);
  assert.equal(await op.confirmar(ctx({ ...real, is_autotest: true }), { chave: 'PQ' }, p, { id: '1' }, k), false, 'quando o campo vem, precisa bater');
  assert.equal(await op.confirmar(ctx({ ...real, milestone: { id: 9 } }), { chave: 'PQ' }, { ...p, marcoId: 4 }, { id: '1' }, k), false, 'milestone lido como objeto');
});

test('resultados no Qase: o envio em lote aparece com atraso e a confirmação relê antes de desistir', async () => {
  const mod = await import('../../../../dist/testes/integracoes/publicarResultadosNoQase.js');
  const { marcadorDaOperacao } = await import('../../../../dist/conexoes/escrita/marcadorDaOperacao.js');
  mod.definirEsperaDaConfirmacao(1);
  const k = 'cd'.repeat(32); const p = { runId: 1, resultados: [{ casoId: 1, status: 'passed', comentario: 'ok' }] };
  let leituras = 0; const ctx = { ler: async () => { leituras++; return { status: true, result: { total: leituras < 2 ? 0 : 1, entities: leituras < 2 ? [] : [{ case_id: 1, comment: `ok\n[${marcadorDaOperacao(k)}]` }] } }; } };
  assert.equal(await mod.publicarResultadosNoQase.confirmar(ctx, { chave: 'PQ' }, p, { id: '1' }, k), true); assert.equal(leituras, 2);
  const nunca = { ler: async () => ({ status: true, result: { total: 0, entities: [] } }) };
  assert.equal(await mod.publicarResultadosNoQase.confirmar(nunca, { chave: 'PQ' }, p, { id: '1' }, k), false, 'sem o resultado, continua não confirmado');
});
