import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, escolherPasta, mcp, dadosDaConta, atenderConfirmacoes } from '../../infra/janela.mjs';
import { fixture } from '../../../unitario/infra/fixtures.mjs';
import { servidorFixture } from '../../../../site/scripts/servicos-fixtures.mjs';
import { concluirTrabalho as concluir } from '../../../../dist/agendamentos/banco/fila.js';
import { enfileirar } from '../../../../dist/agendamentos/banco/fila.js';
import { pegarProximoTrabalho as reivindicar } from '../../../../dist/agendamentos/banco/fila.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/cicloDaRotina.js';

// Janela/IPC reais; perfil, projeto e serviços sintéticos. Não comprova
// autenticação humana nem acesso às contas de produção.
async function preparar(t) {
  const dados = novoDados(t), s = await servidorFixture(t), a = await abrir(t, dados);
  await a.app.evaluate((_, port) => {
    const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http');
    process.getBuiltinModule('node:dns').promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
    https.request = (url, opts, cb) => http.request({ hostname: '127.0.0.1', port, path: url.pathname + url.search, method: opts.method, headers: { ...opts.headers, 'x-fixture-host': url.hostname } }, cb);
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
  }, s.port);
  const conf = atenderConfirmacoes(a.app, () => 'confirmar'); t.after(() => conf.parar());
  const r = await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Qualidade V39', descricao: 'Fixture isolada' }));
  assert.equal(r.ok, true); const e = r.data;
  for (const servico of ['jira', 'qase']) {
    const c = await a.page.evaluate(d => window.prumo.servicoAdicionar(d), { servico, nome: servico + ' fixture', token: 'fixture-v39-secret', ...(servico === 'jira' ? { instancia: 'https://lab.atlassian.net', usuario: 'qa@example.test' } : {}) });
    assert.equal(c.ok, true);
    const rec = await a.page.evaluate(id => window.prumo.servicoRecursos(id), c.data.id);
    assert.equal((await a.page.evaluate(([id, conta, recurso]) => window.prumo.servicoVincular(id, conta, recurso), [e.id, c.data.id, rec.data.recursos[0]])).ok, true);
  }
  await ir(a.page, 'projetos');
  await a.page.locator('#projeto-botao').click(); await a.page.locator(`.projeto-item[data-projeto="${e.id}"]`).click();
  await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'Qualidade V39');
  return { ...a, dados, s, e, conf };
}
async function captura(a, nome) {
  if (!process.env.PRUMO_V39_CAPTURAS) return;
  const dir = path.resolve(process.env.PRUMO_V39_CAPTURAS); fs.mkdirSync(dir, { recursive: true });
  await a.page.screenshot({ path: path.join(dir, nome + '.png'), fullPage: true });
}
const modal = page => page.locator('#qualidade-dialog[open]');
async function fechar(page) { await page.keyboard.press('Escape'); await page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' }); }

test('evidência BLOCKED real é consultada e exportada dentro de Execuções', async t => {
  const a = await preparar(t), f = await fixture(t);
  await escolherPasta(a.app, f.root); assert.equal((await a.page.evaluate(id => window.prumo.espacoPasta(id), a.e.id)).ok, true);
  await ir(a.page, 'projetos'); await a.page.locator('#projeto-botao').click(); await a.page.locator(`.projeto-item[data-projeto="${a.e.id}"]`).click();
  const [r] = await mcp(f.root, a.dados, [['executar_validacao', { capability: 'unit' }]]);
  const resultado = JSON.parse(r.content[0].text); assert.equal(resultado.status, 'BLOCKED');
  await ir(a.page, 'evidencias'); await modal(a.page).getByText('HUMAN_APPROVAL_REQUIRED', { exact: false }).first().waitFor();
  assert.match(await modal(a.page).textContent(), /BLOCKED/);
  const arquivo = path.join(a.dados, 'evidencia.json');
  await a.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, arquivo);
  await a.page.click('#evidencia-exportar'); await a.page.waitForFunction(() => /Evidência exportada/.test(document.querySelector('#aviso').textContent));
  const json = JSON.parse(fs.readFileSync(arquivo, 'utf8')); assert.match(JSON.stringify(json), /BLOCKED/);
  assert.ok(JSON.stringify(json).includes(resultado.jobId), 'exportação conserva jobId original');
  await captura(a, 'evidencia-blocked'); await fechar(a.page);
  assert.equal(await a.page.getAttribute('[data-aba=testes]', 'aria-current'), 'page'); assert.deepEqual(a.erros, []);
});

test('casos e defeitos Qase usam dados consultados e modais; falha e vazio são explícitos', async t => {
  // Repositório: lista de linhas agrupada por suíte (grupos fechados); a busca desliga o agrupamento. O detalhe abre no painel lateral #caso-painel e a lista fica intacta.
  const a = await preparar(t); await ir(a.page, 'testes'); await a.page.click('[data-sub=repositorio]');
  await a.page.locator('#cat-busca').fill('Caso fictício');
  const abrirCaso31 = () => a.page.locator('#cat-lista .rep-linha[data-caso="31"]');
  await abrirCaso31().first().click();
  const painel = a.page.locator('#caso-painel'); await painel.waitFor(); await painel.getByText('Carregando o cenário…').waitFor({ state: 'detached' }); assert.match(await painel.textContent(), /Entrar como Editor fictício|expected_result/);
  // DECISÃO DE PRODUTO: a frase "Não executado no Prumo" só existe no modal antigo; o painel mostra a situação (Manual) e nenhum resultado. Mantida a garantia: nada de execução presumida.
  assert.match(await painel.textContent(), /Manual/, 'tipo de execução explícito'); assert.doesNotMatch(await painel.textContent(), /\b(PASS|FAIL|BLOCKED)\b/, 'execução não presumida');
  await captura(a, 'caso-qase-painel'); await painel.getByRole('button', { name: 'Fechar painel' }).click(); await painel.waitFor({ state: 'detached' });
  assert.equal(await abrirCaso31().count(), 1, 'lista preservada');
  // Tickets consolida Jira e defeitos do Qase com a origem identificada em cada linha.
  a.s.controle.corpo = null; await ir(a.page, 'tickets'); await a.page.waitForSelector('#tk-tabela [data-defeito="91"]');
  assert.match(await a.page.textContent('#tk-tabela [data-defeito="91"]'), /Qase/); assert.match(await a.page.textContent('#tk-tabela [data-ticket="SMART-1"]'), /Jira/);
  // O núcleo revalida o vínculo antes de ler; a resposta é a do servidor simulado para o defeito 91.
  await a.page.locator('#tk-tabela [data-defeito="91"]').getByRole('button', { name: 'Abrir', exact: true }).click(); await modal(a.page).locator('#def-detalhe').waitFor();
  assert.match(await modal(a.page).textContent(), /Falha observada apenas na fixture/); assert.match(await modal(a.page).textContent(), /somente leitura/); await captura(a, 'defeito-qase-modal'); await fechar(a.page);
  // Vazio explícito: filtro sem correspondência nos defeitos consultados (o núcleo revalida o vínculo, então não há resposta global falsa).
  await a.page.selectOption('#tk-origem', 'qase'); await a.page.fill('#tk-q', 'sem-correspondencia'); await a.page.press('#tk-q', 'Enter'); await a.page.getByText('Nenhum ticket encontrado', { exact: true }).waitFor();
  a.s.controle.status = 403; await a.page.press('#tk-q', 'Enter'); await a.page.waitForFunction(() => /SERVICE_PERMISSION/.test(document.querySelector('#tk-fontes').textContent));
  assert.deepEqual(a.erros, []);
});

test('ticket em modal preserva filtro e foco; estados API e permissões permanecem verificáveis', async t => {
  const a = await preparar(t); await ir(a.page, 'tickets');
  await a.page.fill('#tk-q', 'SMART'); await a.page.press('#tk-q', 'Enter');
  const abrirTicket = a.page.locator('#tk-tabela [data-ticket="SMART-1"]').getByRole('button', { name: 'Abrir', exact: true });
  await abrirTicket.click(); await modal(a.page).locator('#tk-painel').waitFor();
  assert.match(await modal(a.page).textContent(), /SMART-1/);
  assert.match(await modal(a.page).textContent(), /somente leitura|desligada/i);
  await captura(a, 'ticket-modal'); await fechar(a.page);
  assert.equal(await a.page.inputValue('#tk-q'), 'SMART'); assert.equal(await abrirTicket.evaluate(n => n === document.activeElement), true);
  await abrirTicket.press('Enter'); await modal(a.page).waitFor(); await modal(a.page).getByRole('button', { name: 'Fechar detalhes' }).click();
  a.s.controle.status = 403; await a.page.press('#tk-q', 'Enter');
  await a.page.waitForFunction(() => /SERVICE_PERMISSION/.test(document.querySelector('#aviso').textContent));
  assert.equal(a.s.pedidos.filter(p => p.metodo !== 'GET').length, 0);
  assert.doesNotMatch(await a.page.textContent('body'), /fixture-v39-secret/);
  assert.deepEqual(a.erros, []);
});

test('rastreabilidade consulta vínculo declarado e bloqueia recurso desvinculado', async t => {
  const a = await preparar(t);
  const e = (await a.page.evaluate(id => window.prumo.espacoObter(id), a.e.id)).data;
  const j = e.vinculos.find(v => v.servico === 'jira'), q = e.vinculos.find(v => v.servico === 'qase');
  const r = await a.page.evaluate(([id, dados]) => window.prumo.espacoAssociar(id, dados), [e.id, { de: { tipo: 'jira', id: 'SMART-1', vinculoId: j.id, origem: j.recurso.chave }, para: { tipo: 'qase', id: '31', vinculoId: q.id, origem: q.recurso.chave }, justificativa: 'Associação declarada para teste' }]);
  assert.equal(r.ok, true);
  // A seção "Vínculos declarados" saiu da interface (Rastreabilidade virou parte de Testes): a garantia passa a ser verificada pela API.
  const mapa = (await a.page.evaluate(id => window.prumo.vinculosMapa(id), e.id)).data;
  assert.ok(mapa.arestas.some(x => JSON.stringify(x).includes('SMART-1') && JSON.stringify(x).includes('DECLARADO_PELO_USUARIO')), 'vínculo declarado consultável');
  const antes = a.s.pedidos.length;
  const lido = await a.page.evaluate(id => window.prumo.servicoConsultar(id, 'jira', 'ticket', {}, 'SMART-1'), e.id);
  assert.equal(lido.ok, true); const depoisDeLer = a.s.pedidos.length; assert.ok(depoisDeLer > antes, 'consulta com vínculo vai ao serviço');
  assert.equal((await a.page.evaluate(id => window.prumo.servicoDesvincular(id, 'jira'), e.id)).ok, true);
  const bloqueado = await a.page.evaluate(id => window.prumo.servicoConsultar(id, 'jira', 'ticket', {}, 'SMART-1'), e.id);
  assert.equal(bloqueado.ok, false, 'recurso desvinculado não é consultado'); assert.equal(a.s.pedidos.length, depoisDeLer, 'nenhum pedido remoto após desvincular');
  assert.ok(JSON.stringify((await a.page.evaluate(id => window.prumo.vinculosMapa(id), e.id)).data).includes('DESATUALIZADO'), 'relação do vínculo removido fica marcada como desatualizada');
  assert.deepEqual(a.erros, []);
});

test('rotina configurada no modal, pausa/retomada e execução detalhada sem resultado inventado', async t => {
  const a = await preparar(t); await ir(a.page, 'agenda'); await a.page.click('#rotina-nova');
  await modal(a.page).locator('#rotina-form').waitFor();
  await a.page.fill('#rotina-nome', 'Consulta isolada'); await a.page.selectOption('#rotina-tipo', 'consulta-jira');
  await a.page.selectOption('#rotina-freq', 'intervalo'); await a.page.fill('#rotina-minutos', '600');
  await captura(a, 'rotina-formulario'); await a.page.click('#rotina-salvar');
  await a.page.waitForSelector('[data-rotina]'); await a.page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' });
  let rotina = a.page.locator('#conteudo [data-rotina]').filter({ hasText: 'Consulta isolada' });
  await rotina.getByRole('button', { name: 'Pausar', exact: true }).click(); await rotina.getByRole('button', { name: 'Retomar', exact: true }).waitFor();
  await rotina.getByRole('button', { name: 'Retomar', exact: true }).click(); await rotina.getByRole('button', { name: 'Pausar', exact: true }).waitFor();
  const pastaDaConta = await dadosDaConta(a.page, a.dados);
  const r = criarRotina({ nome: 'Tentativa bloqueada V39', espacoId: a.e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', frequencia: { tipo: 'intervalo', minutos: 600 }, fuso: 'UTC' }, pastaDaConta);
  const { trabalho } = enfileirar({ chave: 'v39-bloqueada', rotinaId: r.id, espacoId: a.e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', origem: 'MANUAL', slot: null }, pastaDaConta);
  reivindicar(pastaDaConta); concluir(trabalho.id, { status: 'BLOCKED', motivo: 'HUMAN_APPROVAL_REQUIRED', detalhes: 'Fixture: execução impedida; nenhum cenário executado.' }, pastaDaConta);
  await ir(a.page, 'execucoes'); await a.page.locator(`#runs-lista [data-exec="${trabalho.id}"]`).click();
  await modal(a.page).waitFor(); assert.match(await modal(a.page).textContent(), /nenhum cenário executado/); await captura(a, 'execucao-bloqueada'); await fechar(a.page);
  assert.equal(await a.page.locator('#nav [data-aba="evidencias"]:visible').count(), 0);
  for (const zoom of [1, 2, 4]) {
    await a.app.evaluate(({ BrowserWindow }, z) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 900); w.webContents.setZoomFactor(z); }, zoom);
    for (const aba of ['tickets', 'testes', 'agenda', 'runs', 'vinculos']) { await ir(a.page, aba); assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${aba}, zoom ${zoom}`); }
  }
  assert.deepEqual(a.erros, []);
});
