import test from 'node:test';
import assert from 'node:assert/strict';
import { criarMundo } from '../../../apoio/mundo-servicos.mjs';
import { lerDetalheDoServico as lerExtra } from '../../../../dist/conexoes/integracoes/lerDetalheDoServico.js';
import { operacoesServico } from '../../../../dist/conexoes/tipos/adaptador.js';
import { filtrosSchema, operacoesExtras } from '../../../../dist/conexoes/tipos/leituras.js';
import { jqlDeTickets } from '../../../../dist/tickets/integracoes/jqlDeTickets.js';

const pg = { offset: 0, limite: 50 };
const ctxDe = (m, servico) => m.executor.comContexto('x', servico, async (c) => c);
test('JQL de tickets: projeto sempre fixado pelo ID do vínculo; filtros validados e escapados (sem injeção)', () => {
  assert.equal(jqlDeTickets('11'), 'project = 11 ORDER BY updated DESC');
  assert.equal(jqlDeTickets('11', { q: 'SMART-100' }), 'project = 11 AND key = SMART-100 ORDER BY updated DESC');
  assert.equal(jqlDeTickets('11', { tipo: 'Bug', status: 'Em andamento', desde: '2026-10-01', ate: '2026-10-10', pai: 'SMART-5' }), 'project = 11 AND issuetype = "Bug" AND status = "Em andamento" AND updated >= "2026-10-01" AND updated <= "2026-10-10 23:59" AND parent = SMART-5 ORDER BY updated DESC');
  const mal = jqlDeTickets('11', { q: 'x" OR project = 22 OR "y' });
  assert.equal(mal, 'project = 11 AND text ~ "x\\" OR project = 22 OR \\"y" ORDER BY updated DESC');
  assert.equal((mal.match(/(^|[^\\])"/g) ?? []).length % 2, 0, 'aspas sempre balanceadas');
  assert.throws(() => jqlDeTickets('11 OR project = 22')); assert.throws(() => filtrosSchema.parse({ tipo: 'Bug" OR 1=1' })); assert.throws(() => filtrosSchema.parse({ desde: '2026-10-01; DROP' })); assert.throws(() => filtrosSchema.parse({ jql: 'project = 22' }));
  assert.ok(['metadados', 'transicoes', 'historico', 'plano', 'arquivos', 'workflows', 'jobs', 'artefatos', 'revisoes', 'commit'].every((o) => operacoesServico.includes(o)));
});
test('Jira: metadados de criação, transições, histórico e anexos; ticket de outro projeto é recusado', async () => {
  const m = criarMundo(), ctx = await ctxDe(m, 'jira'), rec = m.recursos.jira;
  assert.deepEqual((await lerExtra(ctx, rec, 'metadados', pg)).dados.map((t) => [t.id, t.nome, t.subtarefa]), [['10001', 'Bug', false], ['10002', 'Task', false], ['10003', 'Subtask', true]]);
  assert.deepEqual((await lerExtra(ctx, rec, 'transicoes', pg, 'SMART-1')).dados.map((t) => t.nome), ['Iniciar', 'Concluir']);
  const h = (await lerExtra(ctx, rec, 'historico', pg, 'SMART-1')).dados[0]; assert.deepEqual(h.mudancas, [{ campo: 'status', de: 'Aberto', para: 'Em andamento' }]); assert.equal(h.por, 'Pessoa fictícia');
  assert.deepEqual((await lerExtra(ctx, rec, 'anexos', pg, 'SMART-1')).dados, []);
  await assert.rejects(lerExtra(ctx, rec, 'transicoes', pg, 'CID-1'), (e) => e.codigo === 'SERVICE_SCOPE_CHANGED'); await assert.rejects(lerExtra(ctx, rec, 'historico', pg, 'nao-e-ticket'));
  await assert.rejects(lerExtra(ctx, rec, 'workflows', pg), (e) => e.codigo === 'SERVICE_WRITE_BLOCKED', 'operação de outro serviço não existe aqui');
});
test('Qase: plano com casos e campos de sistema', async () => {
  const m = criarMundo(), ctx = await ctxDe(m, 'qase'), rec = m.recursos.qase; m.qase.planos.push({ id: 7, title: 'Plano', cases: [1, 2] });
  assert.equal((await lerExtra(ctx, rec, 'plano', pg, '7')).dados.title, 'Plano'); assert.equal((await lerExtra(ctx, rec, 'campos-sistema', pg)).dados[0].slug, 'priority'); await assert.rejects(lerExtra(ctx, rec, 'plano', pg, '404'), (e) => e.codigo === 'SERVICE_NOT_FOUND');
});
test('GitHub: arquivos, execuções de CI, jobs, artefatos, revisões e commit; sem logs nem download (redirecionamento bloqueado)', async () => {
  const m = criarMundo(), ctx = await ctxDe(m, 'github'), rec = m.recursos.github;
  assert.equal((await lerExtra(ctx, rec, 'arquivos', pg, 'tests')).dados[0].caminho, 'tests/a.spec.ts'); await assert.rejects(lerExtra(ctx, rec, 'arquivos', pg, '../segredo')); await assert.rejects(lerExtra(ctx, rec, 'arquivos', pg, 'a\\b'));
  const w = (await lerExtra(ctx, rec, 'workflows', pg)).dados[0]; assert.deepEqual([w.id, w.conclusao, w.branch], [77, 'failure', 'main']);
  assert.equal((await lerExtra(ctx, rec, 'jobs', pg, '77')).dados[0].etapas[0].conclusao, 'failure'); assert.deepEqual((await lerExtra(ctx, rec, 'artefatos', pg, '77')).dados[0], { id: 5, nome: 'relatorio', bytes: 1234, expirado: false, criado: null });
  assert.equal((await lerExtra(ctx, rec, 'revisoes', pg, '1')).dados[0].estado, 'APPROVED'); const c = (await lerExtra(ctx, rec, 'commit', pg, 'a'.repeat(40))).dados; assert.equal(c.arquivos[0].adicoes, 3); await assert.rejects(lerExtra(ctx, rec, 'commit', pg, 'HEAD; rm'));
  assert.ok(m.chamadas.every(([metodo]) => metodo === 'GET'), 'leituras nunca escrevem'); assert.equal(operacoesExtras.includes('logs'), false);
});
