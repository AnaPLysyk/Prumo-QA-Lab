/** Status de defeito e leituras de milestone, ambiente e campos personalizados do Qase: serviço sintético, sem rede. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mudarStatusDefeitoNoQase as op } from '../../../../dist/testes/integracoes/mudarStatusDefeitoNoQase.js';
import { rotaEscritaPermitida } from '../../../../dist/conexoes/escrita/rotaEscritaPermitida.js';
import { idsDeOperacao } from '../../../../dist/conexoes/tipos/operacoesExternas.js';
import { lerDetalheDoServico } from '../../../../dist/conexoes/integracoes/lerDetalheDoServico.js';
import { criarRunNoQaseOperacao } from '../../../../dist/testes/integracoes/criarRunNoQaseOperacao.js';

const rec = { chave: 'PQ', id: 'PQ' };
function mundo(status = 'open', versao = '2026-10-15T10:00:00+00:00') {
  const d = { id: 5, status, updated_at: versao }; const patches = [];
  const ctx = { servico: 'qase', ler: async (u) => { assert.equal(u, '/v1/defect/PQ/5'); return { status: true, result: { ...d } }; },
    enviar: async (metodo, url, body) => { assert.ok(rotaEscritaPermitida('qase', metodo, url)); patches.push([metodo, url, JSON.parse(body)]); d.status = JSON.parse(body).status; d.updated_at = '2026-10-15T11:00:00+00:00'; return { status: true }; } };
  return { ctx, d, patches };
}

test('status de defeito: rota PATCH exata, catálogo e esquema fechado', () => {
  assert.ok(idsDeOperacao.includes('qase.status_defeito'));
  assert.equal(rotaEscritaPermitida('qase', 'PATCH', '/v1/defect/PQ/status/5'), true);
  assert.equal(rotaEscritaPermitida('qase', 'PATCH', '/v1/defect/PQ/5'), false, 'editar o defeito inteiro não tem contrato');
  assert.equal(op.schema.safeParse({ defeitoId: 5, status: 'open', versao: '2026-10-15T10:00:00+00:00' }).success, false, 'reabrir não está na API de status');
});

test('status de defeito: muda, confirma por releitura e não repete quando já está no destino', async () => {
  const m = mundo(); const p = { defeitoId: 5, status: 'resolved', versao: m.d.updated_at };
  const r = await op.executar(m.ctx, rec, p);
  assert.deepEqual(m.patches, [['PATCH', '/v1/defect/PQ/status/5', { status: 'resolved' }]]);
  assert.equal(await op.confirmar(m.ctx, rec, p, r), true);
  assert.equal((await op.executar(m.ctx, rec, p)).detalhes.existente, true); assert.equal(m.patches.length, 1);
  assert.equal((await op.reconciliar(m.ctx, rec, p)).id, '5');
});

test('status de defeito: alteração feita no Qase depois da leitura bloqueia a mudança', async () => {
  const m = mundo('in_progress', '2026-10-15T12:00:00+00:00');
  await assert.rejects(op.executar(m.ctx, rec, { defeitoId: 5, status: 'resolved', versao: '2026-10-15T10:00:00+00:00' }), (e) => e.codigo === 'SERVICE_SCOPE_CHANGED');
  assert.equal(m.patches.length, 0);
});

test('leituras: milestones, ambientes e só os campos personalizados que valem para o projeto', async () => {
  const urls = []; const respostas = {
    '/v1/milestone/PQ': [{ id: 1, title: 'Sprint 9', status: 'active' }],
    '/v1/environment/PQ': [{ id: 3, title: 'Homologação', slug: 'hml' }],
    '/v1/custom_field': [
      { id: 12, title: 'Módulo', type: 'selectbox', is_required: true, value: JSON.stringify([{ id: 1, title: 'Checkout' }]), is_enabled_for_all_projects: false, projects_codes: ['PQ'] },
      { id: 13, title: 'De outro projeto', is_required: true, is_enabled_for_all_projects: false, projects_codes: ['XX'] },
      { id: 14, title: 'Global', type: 'string', is_required: false, value: null, is_enabled_for_all_projects: true }]
  };
  const ctx = { servico: 'qase', ler: async (u) => { urls.push(u); return { status: true, result: { entities: respostas[u.split('?')[0]] } }; } };
  const pg = { offset: 0, limite: 100 };
  assert.deepEqual((await lerDetalheDoServico(ctx, rec, 'marcos', pg)).dados.map((m) => [m.id, m.titulo, m.estado]), [[1, 'Sprint 9', 'active']]);
  assert.deepEqual((await lerDetalheDoServico(ctx, rec, 'ambientes', pg)).dados.map((a) => [a.id, a.slug]), [[3, 'hml']]);
  const campos = (await lerDetalheDoServico(ctx, rec, 'campos-personalizados', pg, undefined, { tipo: 'defect' })).dados;
  assert.deepEqual(campos.map((c) => c.id), [12, 14]); assert.deepEqual(campos[0].opcoes, [{ id: '1', titulo: 'Checkout' }]); assert.equal(campos[1].opcoes, null);
  assert.match(urls.at(-1), /^\/v1\/custom_field\?entity=defect&/);
});

test('run no Qase leva milestone e ambiente escolhidos', async () => {
  let corpo; const ctx = { servico: 'qase', ler: async (u) => (u.startsWith('/v1/case/') ? { status: true, result: { entities: [{ id: 1 }], total: 1, filtered: 1 } } : { status: true, result: { entities: [], total: 0, filtered: 0 } }), enviar: async (_m, _u, b) => { corpo = JSON.parse(b); return { status: true, result: { id: 9 } }; } };
  await criarRunNoQaseOperacao.executar(ctx, rec, { titulo: 'Regressão', descricao: '', casos: [1], marcoId: 4, ambienteId: 3, autoteste: false }, 'ab'.repeat(32), {});
  assert.deepEqual([corpo.milestone_id, corpo.environment_id], [4, 3]);
});

test('caso Qase: automação vai como 0/1 (a API real recusa true/false) e a leitura aceita os três formatos', async () => {
  const { flagsDeAutomacao, automacaoLida } = await import('../../../../dist/testes/integracoes/automacaoNoQase.js');
  assert.deepEqual(flagsDeAutomacao('manual'), { isManual: 1, isToBeAutomated: 0 });
  assert.deepEqual(flagsDeAutomacao('a-automatizar'), { isManual: 1, isToBeAutomated: 1 });
  assert.deepEqual(flagsDeAutomacao('automatizado'), { isManual: 0, isToBeAutomated: 0 });
  assert.equal(automacaoLida({ isManual: true, isToBeAutomated: false }), 'manual');
  assert.equal(automacaoLida({ isManual: 1, isToBeAutomated: 1 }), 'a-automatizar');
  assert.equal(automacaoLida({ automation: 2 }), 'automatizado');
  assert.equal(automacaoLida({}), undefined);
});
