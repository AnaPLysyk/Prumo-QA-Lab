import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, dadosDaConta } from '../../../apoio/janela.mjs';
import { servidorFixture } from '../../../apoio/servicos-fixtures.mjs';
import { concluirTrabalho as concluir } from '../../../../dist/agendamentos/banco/concluirTrabalho.js';
import { enfileirar } from '../../../../dist/agendamentos/banco/enfileirar.js';
import { obterTrabalho } from '../../../../dist/agendamentos/banco/obterTrabalho.js';
import { pegarProximoTrabalho as reivindicar } from '../../../../dist/agendamentos/banco/pegarProximoTrabalho.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/criarRotina.js';

const confirmar = (app) => app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }); // confirmação nativa simulada pelo runner
const instrumentar = (app, port) => app.evaluate((_, p) => {
  const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http'), dns = process.getBuiltinModule('node:dns');
  dns.promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
  https.request = (url, opcoes, callback) => http.request({ hostname: '127.0.0.1', port: p, path: url.pathname + url.search, method: opcoes.method, headers: { ...opcoes.headers, 'x-fixture-host': url.hostname } }, callback);
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
}, port);

async function prepararJira(t) {
  const dados = novoDados(t), s = await servidorFixture(t); const a = await abrir(t, dados); await instrumentar(a.app, s.port); await confirmar(a.app);
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'SMART-LAB', descricao: 'sintético' }))).data;
  const conta = (await a.page.evaluate(() => window.prumo.servicoAdicionar({ servico: 'jira', nome: 'Jira simulado', instancia: 'https://lab.atlassian.net', usuario: 'fixture@example.test', token: 'fixture-secret-28' }))).data;
  const recursos = (await a.page.evaluate((id) => window.prumo.servicoRecursos(id), conta.id)).data.recursos;
  assert.ok((await a.page.evaluate(([x, y, z]) => window.prumo.servicoVincular(x, y, z), [e.id, conta.id, recursos[0]])).ok);
  const pastaDaConta = await dadosDaConta(a.page, dados);
  const rotina = criarRotina({ nome: 'Regressão SMART-1', espacoId: e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', ticket: 'SMART-1', frequencia: { tipo: 'intervalo', minutos: 600 }, fuso: 'UTC' }, pastaDaConta);
  const execucao = (chave, resultado) => { const { trabalho } = enfileirar({ chave, rotinaId: rotina.id, espacoId: e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', ticket: 'SMART-1', origem: 'MANUAL', slot: null }, pastaDaConta); reivindicar(pastaDaConta); concluir(trabalho.id, resultado, pastaDaConta); return trabalho.id; };
  return { dados: pastaDaConta, s, a, e, rotina, execucao };
}

test('comentário Jira pela interface: prévia, confirmação nativa, publicação única e somente o POST de comentário', async (t) => {
  const { dados, s, a, execucao } = await prepararJira(t);
  const id = execucao('x1', { status: 'FAIL', motivo: 'Falha do processo', contagem: { pass: 2, fail: 1, blocked: 0, notRun: 0 }, evidenciaId: '11111111-1111-4111-8111-111111111111', detalhes: 'C3: valor não persistiu após recarregar' });
  await ir(a.page, 'execucoes'); await a.page.getByRole('row').filter({ hasText: 'Regressão SMART-1' }).waitFor();
  assert.match(await a.page.textContent('#metricas-exec'), /1\s*execuções/); assert.match(await a.page.textContent('#metricas-exec'), /1\s*FAIL/);
  await a.page.locator(`tr[data-exec="${id}"] td.ds-acao button`).click(); await a.page.locator('#qualidade-dialog[open]').getByRole('button', { name: 'Comentário Jira' }).click();
  await a.page.waitForSelector('#jira-caixa pre'); const previa = await a.page.textContent('#jira-caixa pre');
  for (const x of ['Ticket: SMART-1', '3 cenário(s) executado(s): 2 PASS, 1 FAIL', 'C3: valor não persistiu', 'não altera o status do ticket', 'Prumo-Execução: ' + id]) assert.ok(previa.includes(x), x);
  assert.equal(s.comentarios.length, 0, 'prévia não envia nada'); assert.ok(s.pedidos.every((p) => p.metodo === 'GET'));
  await a.page.click('#jira-publicar'); await a.page.waitForFunction(() => document.querySelector('#aviso')?.textContent.includes('Comentário publicado'));
  assert.equal(s.comentarios.length, 1); assert.equal(s.comentarios[0].ticket, 'SMART-1'); assert.match(JSON.stringify(s.comentarios[0].body), /PRUMO QA — RESULTADO DE VALIDAÇÃO/);
  assert.deepEqual([...new Set(s.pedidos.filter((p) => p.metodo !== 'GET').map((p) => p.metodo + ' ' + p.caminho))], ['POST /rest/api/3/issue/SMART-1/comment'], 'a única escrita é o comentário');
  assert.doesNotMatch(s.pedidos.filter((p) => p.metodo === 'POST')[0].corpo, /fixture-secret-28|token/i, 'credencial nunca vai no corpo');
  await ir(a.page, 'execucoes'); await a.page.locator(`tr[data-exec="${id}"]`).getByText('PUBLICADO').waitFor();
  // Repetir não cria outro comentário (idempotência local)
  const outra = await a.page.evaluate((x) => window.prumo.jiraPublicar(x), id); assert.equal(outra.data.estado, 'PUBLICADO'); assert.equal(s.comentarios.length, 1);
  assert.equal(obterTrabalho(id, dados).jira.estado, 'PUBLICADO'); assert.equal(obterTrabalho(id, dados).jira.comentarioId, '700');
  // Registro local de rastreabilidade
  const reg = JSON.parse(fs.readFileSync(path.join(dados, 'plataforma', 'publicacoes-jira.json'), 'utf8')).itens[0]; assert.equal(reg.estado, 'PUBLICADO'); assert.equal(reg.comentarioId, '700'); assert.ok(reg.vinculoId && reg.conexaoId);
  assert.doesNotMatch(fs.readFileSync(path.join(dados, 'plataforma', 'publicacoes-jira.json'), 'utf8'), /fixture-secret-28/);
  assert.deepEqual(a.erros, []);
});

test('Jira: permissão negada vira pendência clara; resposta perdida é reconciliada sem comentário duplicado', async (t) => {
  const { s, a, execucao } = await prepararJira(t);
  const id = execucao('x2', { status: 'PASS', motivo: 'ok', contagem: { pass: 3, fail: 0, blocked: 0, notRun: 0 }, evidenciaId: '22222222-2222-4222-8222-222222222222' });
  s.controle.postStatus = 403; const negado = await a.page.evaluate((x) => window.prumo.jiraPublicar(x), id);
  assert.equal(negado.data.estado, 'FALHA'); assert.match(negado.data.erro, /SERVICE_PERMISSION/); assert.equal(s.comentarios.length, 0);
  await ir(a.page, 'execucoes'); await a.page.locator(`tr[data-exec="${id}"]`).getByText('FALHA').first().waitFor();
  // O Jira cria o comentário, mas a conexão cai antes da resposta
  s.controle.postStatus = 201; s.controle.perderResposta = true; const incerto = await a.page.evaluate((x) => window.prumo.jiraPublicar(x), id);
  assert.equal(incerto.data.estado, 'FALHA'); assert.equal(s.comentarios.length, 1, 'o comentário existe remotamente');
  const reconciliado = await a.page.evaluate((x) => window.prumo.jiraPublicar(x), id);
  assert.equal(reconciliado.data.estado, 'PUBLICADO'); assert.equal(reconciliado.data.comentarioId, '700'); assert.equal(s.comentarios.length, 1, 'não duplicou');
  assert.ok(s.pedidos.some((p) => p.metodo === 'GET' && p.caminho.includes('/comment')), 'procurou o marcador antes de reenviar');
});

test('Jira: execução bloqueada ou consulta não tem comentário; sem vínculo Jira a publicação falha sem efeito remoto', async (t) => {
  const { s, a, execucao } = await prepararJira(t);
  const bloqueada = execucao('x3', { status: 'BLOCKED', motivo: 'HUMAN_APPROVAL_REQUIRED' });
  const r = await a.page.evaluate((x) => window.prumo.jiraPrevia(x), bloqueada); assert.equal(r.ok, false); assert.match(r.error, /JIRA_COMMENT_NOT_APPLICABLE/);
  const semConta = await a.page.evaluate(() => window.prumo.servicoRemover('00000000-0000-4000-8000-000000000000')); assert.equal(semConta.ok, false);
  assert.equal(s.comentarios.length, 0);
});
