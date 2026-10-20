import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, escolherPasta, abas, dadosDaConta } from '../../../apoio/janela.mjs';
import { fixture } from '../../../apoio/fixtures.mjs';
import { servidorFixture } from '../../../apoio/servicos-fixtures.mjs';
import { concluirTrabalho as concluir } from '../../../../dist/agendamentos/banco/concluirTrabalho.js';
import { enfileirar } from '../../../../dist/agendamentos/banco/enfileirar.js';
import { pegarProximoTrabalho as reivindicar } from '../../../../dist/agendamentos/banco/pegarProximoTrabalho.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/criarRotina.js';

// v40 (Design System + Grupo B): janela/IPC reais; perfil, projeto e serviços sintéticos (servidor local).
// Não comprova contas de produção nem autenticação humana do Windows; confirmações nativas são doubles do runner.
async function preparar(t, { pasta = false } = {}) {
  const dados = novoDados(t), s = await servidorFixture(t), a = await abrir(t, dados);
  await a.app.evaluate((_, port) => {
    const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http');
    process.getBuiltinModule('node:dns').promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
    https.request = (url, opts, cb) => http.request({ hostname: '127.0.0.1', port, path: url.pathname + url.search, method: opts.method, headers: { ...opts.headers, 'x-fixture-host': url.hostname } }, cb);
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
  }, s.port);
  await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Qualidade V40', descricao: 'Fixture isolada' }))).data;
  for (const servico of ['jira', 'qase']) {
    const c = await a.page.evaluate((d) => window.prumo.servicoAdicionar(d), { servico, nome: servico + ' fixture', token: 'fixture-v40-secret', ...(servico === 'jira' ? { instancia: 'https://lab.atlassian.net', usuario: 'qa@example.test' } : {}) });
    assert.equal(c.ok, true); const rec = await a.page.evaluate((id) => window.prumo.servicoRecursos(id), c.data.id);
    assert.equal((await a.page.evaluate(([id, conta, recurso]) => window.prumo.servicoVincular(id, conta, recurso), [e.id, c.data.id, rec.data.recursos[0]])).ok, true);
  }
  let f = null; if (pasta) { f = await fixture(t); await escolherPasta(a.app, f.root); assert.equal((await a.page.evaluate((id) => window.prumo.espacoPasta(id), e.id)).ok, true); }
  await selecionar(a.page, e);
  return { ...a, dados, s, e, f };
}
async function selecionar(page, e) { await ir(page, 'projetos'); await page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: /Selecionar projeto|Projeto selecionado/ }).click(); await page.waitForFunction((n) => document.querySelector('#projeto-atual').textContent === n, e.nome); }
const modal = (page) => page.locator('#qualidade-dialog[open]');
async function fecharModal(page) { await page.keyboard.press('Escape'); await page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' }); }
async function captura(a, nome) { if (!process.env.PRUMO_V40_CAPTURAS) return; const dir = path.resolve(process.env.PRUMO_V40_CAPTURAS); fs.mkdirSync(dir, { recursive: true }); await a.page.screenshot({ path: path.join(dir, nome + '.png') }); }
const semRolagemHorizontal = async (page) => { const r = await page.evaluate(() => { const W = innerWidth; if (document.documentElement.scrollWidth <= W + 1) return true; return [...document.querySelectorAll('#conteudo *, header *')].filter((el) => el.getBoundingClientRect().right > W + 1).slice(0, 6).map((el) => el.tagName + '#' + el.id + '.' + String(el.className).slice(0, 30) + ':' + Math.round(el.getBoundingClientRect().right) + '/' + W).join(' | '); }); if (r !== true) console.log('overflow:', r); return r === true; };
const naoGet = (s) => s.pedidos.filter((p) => p.metodo !== 'GET');

test('navegação completa, Design System no Grupo B, Evidências só dentro de Execuções e sem rolagem horizontal', async (t) => {
  const a = await preparar(t);
  assert.equal(await a.page.locator('#nav [data-aba="evidencias"]:visible').count(), 0, 'Evidências não volta como menu');
  for (const tamanho of [[1440, 900], [1024, 768], [860, 900]]) {
    await a.app.evaluate(({ BrowserWindow }, [w, hh]) => BrowserWindow.getAllWindows()[0].setSize(w, hh), tamanho);
    for (const aba of abas.filter((x) => x !== 'evidencias')) {
      await ir(a.page, aba); assert.ok((await a.page.textContent('#conteudo')).trim().length > 30, aba);
      if (['tickets', 'testes', 'agenda', 'suporte', 'ajuda', 'runs', 'vinculos'].includes(aba)) assert.equal(await a.page.locator('#conteudo .ds-cab h1').count(), 1, 'cabeçalho padrão em ' + aba);
      assert.equal(await semRolagemHorizontal(a.page), true, `${aba} ${tamanho.join('x')}`);
    }
  }
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
  for (const zoom of [2, 4]) {
    await a.app.evaluate(({ BrowserWindow }, z) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z), zoom);
    for (const aba of ['tickets', 'testes', 'agenda', 'runs', 'vinculos', 'suporte', 'ajuda']) { await ir(a.page, aba); assert.equal(await semRolagemHorizontal(a.page), true, `${aba} zoom ${zoom}`); }
  }
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  assert.deepEqual(a.erros, [], 'console sem erros (inclui CSP: nenhum atributo style inline)');
});

test('Tickets consolida Jira e Qase, modal preserva filtros e foco, rolagem só dentro do modal e escrita desligada fica indisponível', async (t) => {
  const a = await preparar(t); await ir(a.page, 'tickets');
  await a.page.waitForSelector('#tk-tabela [data-ticket="SMART-1"]'); await a.page.waitForSelector('#tk-tabela [data-defeito="91"]');
  assert.match(await a.page.textContent('#tk-fontes'), /Jira[\s\S]*1 ticket\b[\s\S]*Qase[\s\S]*1 defeito\b/);
  assert.equal(await a.page.textContent('#tk-contagem'), '2');
  await a.page.selectOption('#tk-origem', 'jira'); await a.page.fill('#tk-q', 'SMART'); await a.page.click('#tk-buscar');
  await a.page.waitForFunction(() => !document.querySelector('#tk-tabela [data-defeito]') && document.querySelector('#tk-tabela [data-ticket="SMART-1"]'));
  const abrirT = a.page.locator('#tk-tabela [data-ticket="SMART-1"]').getByRole('button', { name: 'Abrir', exact: true });
  await abrirT.click(); await modal(a.page).locator('#tk-painel').waitFor();
  assert.equal(await a.page.getAttribute('#qualidade-dialog', 'data-tamanho'), 'lg');
  assert.equal(await a.page.evaluate(() => { const d = document.querySelector('#qualidade-dialog'); return d.scrollHeight <= d.clientHeight + 1; }), true, 'sem rolagem dupla: só o corpo do modal rola');
  assert.equal(await a.page.isDisabled('#tk-comentar'), true, 'comentário indisponível sem escrita'); assert.equal(await a.page.isDisabled('#tk-editar'), true);
  assert.match(await modal(a.page).textContent(), /Escrita no Jira desligada/);
  assert.match(await modal(a.page).textContent(), /Caso|Nenhum vínculo declarado/);
  await captura(a, 'ticket-modal'); await fecharModal(a.page);
  assert.equal(await a.page.inputValue('#tk-q'), 'SMART'); assert.equal(await a.page.inputValue('#tk-origem'), 'jira'); assert.equal(await abrirT.evaluate((n) => n === document.activeElement), true, 'foco volta ao registro');
  // Clicar na linha também abre; Escape fecha.
  await a.page.locator('#tk-tabela [data-ticket="SMART-1"] td').nth(2).click(); await modal(a.page).waitFor(); await fecharModal(a.page);
  // Erro da API fica explícito na fonte, sem apagar o que já foi exibido como lista vazia.
  a.s.controle.status = 500; await a.page.click('#tk-buscar'); await a.page.waitForFunction(() => /SERVICE_/.test(document.querySelector('#tk-fontes').textContent));
  assert.equal(await a.page.locator('#tk-lista .ds-estado[data-tipo="erro"]').count(), 1, 'estado de erro explícito');
  assert.equal(naoGet(a.s).length, 0, 'nenhuma escrita'); assert.doesNotMatch(await a.page.textContent('body'), /fixture-v40-secret/);
  assert.deepEqual(a.erros, []);
});

test('defeito Qase → ticket Jira com confirmação nativa, vínculo registrado uma vez e visível na rastreabilidade', async (t) => {
  const a = await preparar(t); a.s.controle.aceitarCriacao = true;
  await ir(a.page, 'tickets'); await a.page.waitForSelector('#tk-tabela [data-defeito="91"]');
  await a.page.locator('#tk-tabela [data-defeito="91"]').getByRole('button', { name: 'Abrir', exact: true }).click(); await modal(a.page).locator('#def-detalhe').waitFor();
  await a.page.click('#def-jira'); await a.page.waitForSelector('#tk-novo-resumo');
  assert.match(await a.page.inputValue('#tk-novo-resumo'), /\[Qase SFQ-91\]/); assert.equal(await a.page.isDisabled('#tk-novo-criar'), true, 'sem escrita habilitada o envio fica indisponível');
  await fecharModal(a.page); assert.equal(naoGet(a.s).length, 0);
  // Habilita a escrita no Jira deste projeto (confirmação nativa simulada) e repete o fluxo.
  await ir(a.page, 'conexoes'); await a.page.click('#escrita-jira'); await a.page.waitForFunction(() => /escrita habilitada/.test(document.querySelector('[data-escrita=jira]')?.textContent || ''));
  await ir(a.page, 'tickets'); await a.page.waitForSelector('#tk-tabela [data-defeito="91"]');
  await a.page.locator('#tk-tabela [data-defeito="91"]').getByRole('button', { name: 'Abrir', exact: true }).click(); await modal(a.page).locator('#def-detalhe').waitFor();
  await a.page.click('#def-jira'); await a.page.waitForSelector('#tk-novo-criar:not([disabled])'); await captura(a, 'defeito-novo-ticket');
  await a.page.click('#tk-novo-criar'); await a.page.waitForSelector('[data-resultado-operacao="CONFIRMADA"]');
  await modal(a.page).getByText('Vínculo registrado: Defeito Qase 91 → SMART-99.').waitFor();
  assert.equal(a.s.criados.length, 1); assert.match(JSON.stringify(a.s.criados[0].corpo), /Qase SFQ-91/);
  assert.deepEqual([...new Set(naoGet(a.s).map((p) => p.metodo + ' ' + p.caminho))], ['POST /rest/api/3/issue'], 'a única escrita é a criação do ticket');
  const rel = (await a.page.evaluate((id) => window.prumo.espacoObter(id), a.e.id)).data.relacoes.filter((r) => r.de.tipo === 'qase-defeito');
  assert.equal(rel.length, 1); assert.deepEqual([rel[0].de.id, rel[0].para.tipo, rel[0].para.id], ['91', 'jira-bug', 'SMART-99']);
  // Reabrir o defeito mostra o ticket relacionado e não oferece criar outro.
  await fecharModal(a.page); await a.page.locator('#tk-tabela [data-defeito="91"]').getByRole('button', { name: 'Abrir', exact: true }).click(); await modal(a.page).locator('#def-detalhe').waitFor();
  assert.equal(await a.page.locator('#def-jira').count(), 0); await modal(a.page).getByRole('button', { name: 'Abrir jira-bug SMART-99', exact: true }).first().waitFor();
  await fecharModal(a.page); await ir(a.page, 'rastreabilidade');
  await a.page.getByRole('button', { name: 'Abrir qase-defeito 91', exact: true }).waitFor(); assert.match(await a.page.textContent('#vinc-tabela'), /SMART-99/);
  await captura(a, 'vinculos-defeito'); assert.equal(a.s.criados.length, 1, 'nenhum ticket duplicado');
  assert.deepEqual(a.erros, []);
});

test('Agendamentos orquestra rotinas em modal (grupos, regras, autorização e execuções) e pausa/retoma sem inventar resultado', async (t) => {
  const a = await preparar(t);
  const pastaDaConta = await dadosDaConta(a.page, a.dados);
  criarRotina({ nome: 'Regressão sem autorização', espacoId: a.e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', frequencia: { tipo: 'intervalo', minutos: 600 }, fuso: 'UTC' }, pastaDaConta);
  await ir(a.page, 'agenda'); await a.page.click('#rotina-nova'); await modal(a.page).locator('#rotina-form').waitFor();
  assert.equal(await modal(a.page).locator('#rotina-form fieldset').count(), 3, 'fluxo, quando e horário perdido agrupados');
  await a.page.fill('#rotina-nome', 'Consulta diária'); await a.page.selectOption('#rotina-tipo', 'consulta-jira'); await a.page.selectOption('#rotina-freq', 'diario'); await a.page.fill('#rotina-hora', '08:30');
  assert.equal(await a.page.isVisible('#rotina-minutos'), false); assert.equal(await a.page.isVisible('#rotina-hora'), true);
  await captura(a, 'rotina-formulario'); await a.page.click('#rotina-salvar'); await a.page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' });
  const linha = a.page.locator('#rotinas-tabela [data-rotina]').filter({ hasText: 'Consulta diária' }); await linha.waitFor();
  assert.match(await linha.textContent(), /Todo dia às 08:30/); assert.match(await linha.textContent(), /Não exige/);
  const semAut = a.page.locator('#rotinas-tabela [data-rotina]').filter({ hasText: 'Regressão sem autorização' }); assert.match(await semAut.textContent(), /Sem automação|AUSENTE|Sem autoriza/);
  assert.match(await a.page.textContent('#agenda-worker'), /ativas sem autorização/);
  await semAut.getByRole('button', { name: 'Abrir rotina Regressão sem autorização' }).click(); await modal(a.page).waitFor();
  await modal(a.page).getByText('Regras da rotina').waitFor(); assert.match(await modal(a.page).textContent(), /BLOCKED até você autorizar/);
  await modal(a.page).getByRole('tab', { name: 'Execuções' }).click(); await modal(a.page).getByText('Nenhuma execução desta rotina').waitFor();
  await modal(a.page).getByRole('tab', { name: /Autorização/ }).click(); await modal(a.page).getByRole('button', { name: 'Autorizar execuções agendadas…' }).waitFor();
  await captura(a, 'rotina-modal');
  await modal(a.page).getByRole('button', { name: 'Pausar', exact: true }).click(); await modal(a.page).getByRole('button', { name: 'Retomar', exact: true }).waitFor();
  await fecharModal(a.page); await ir(a.page, 'agenda');
  await a.page.locator('#rotinas-tabela [data-rotina]').filter({ hasText: 'Regressão sem autorização' }).getByRole('button', { name: 'Retomar', exact: true }).click();
  await a.page.locator('#rotinas-tabela [data-rotina]').filter({ hasText: 'Regressão sem autorização' }).getByRole('button', { name: 'Pausar', exact: true }).waitFor();
  await a.page.selectOption('#agenda-estado', 'PAUSADA'); await a.page.getByText('Nenhuma rotina para estes filtros').waitFor();
  const ex = (await a.page.evaluate(() => window.prumo.execucoes({}))).data; assert.equal(ex.total, 0, 'criar, pausar e retomar não geram execução');
  assert.deepEqual(a.erros, []);
});

test('Execução em modal com Resumo, Etapas, Logs e Evidências reais; falha vira rascunho de bug sem envio', async (t) => {
  const a = await preparar(t, { pasta: true });
  const pastaDaConta = await dadosDaConta(a.page, a.dados);
  const r = criarRotina({ nome: 'Regressão V40', espacoId: a.e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', ticket: 'SMART-1', frequencia: { tipo: 'intervalo', minutos: 600 }, fuso: 'UTC' }, pastaDaConta);
  const { trabalho } = enfileirar({ chave: 'v40-fail', rotinaId: r.id, espacoId: a.e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', ticket: 'SMART-1', origem: 'MANUAL', slot: null }, pastaDaConta);
  reivindicar(pastaDaConta); concluir(trabalho.id, { status: 'FAIL', motivo: 'Falha do processo', contagem: { pass: 1, fail: 1, blocked: 0, notRun: 0 }, detalhes: 'C2: valor esperado não persistiu' }, pastaDaConta);
  await ir(a.page, 'execucoes'); const linha = a.page.locator(`#runs-tabela [data-exec="${trabalho.id}"]`); await linha.waitFor();
  assert.match(await linha.textContent(), /1 PASS · 1 FAIL/); assert.match(await a.page.textContent('#metricas-exec'), /1\s*FAIL/);
  await linha.getByRole('button', { name: 'Abrir execução Regressão V40', exact: true }).click(); await modal(a.page).waitFor();
  for (const aba of ['Resumo', 'Etapas', 'Logs', 'Evidências']) assert.equal(await modal(a.page).getByRole('tab', { name: new RegExp('^' + aba) }).count(), 1, aba);
  assert.match(await modal(a.page).textContent(), /C2: valor esperado não persistiu/);
  await modal(a.page).getByRole('tab', { name: /^Etapas/ }).click(); await modal(a.page).getByText('Enfileirada').waitFor(); assert.match(await modal(a.page).textContent(), /Tentativa 1/);
  await modal(a.page).getByRole('tab', { name: /^Logs/ }).click(); await modal(a.page).locator('[data-painel=logs] pre').first().waitFor();
  await modal(a.page).getByRole('tab', { name: /^Evidências/ }).click(); await modal(a.page).getByText('Nenhuma evidência registrada para esta execução.').waitFor();
  assert.match(await modal(a.page).textContent(), /Anexos e comentários em execuções ainda não têm armazenamento/, 'limite declarado, sem ação falsa');
  await captura(a, 'execucao-modal');
  await a.page.click('#exec-bug'); await modal(a.page).getByText(/Rascunho de bug criado/).waitFor();
  const ps = (await a.page.evaluate((id) => window.prumo.propostas(id), a.e.id)).data; assert.equal(ps.length, 1); assert.equal(ps[0].tipo, 'bug'); assert.equal(ps[0].estado, 'RASCUNHO'); assert.equal(ps[0].dados.origem, 'SMART-1');
  assert.equal(naoGet(a.s).length, 0, 'rascunho não envia nada ao Jira');
  await fecharModal(a.page); assert.equal(await a.page.getAttribute('[data-aba=testes]', 'aria-current'), 'page');
  // Evidências CLI/MCP continuam acessíveis apenas como modal de Execuções.
  // O modal abre com "Consultando…": espera o conteúdo real antes de conferir (no CI a consulta é mais lenta).
  await a.page.click('#exec-evidencias'); await modal(a.page).waitFor();
  await a.page.waitForFunction(() => /Nenhuma evidência|Resultados reais/.test(document.querySelector('#qualidade-dialog[open]')?.textContent ?? ''), null, { timeout: 15000 }); await fecharModal(a.page);
  assert.deepEqual(a.erros, []);
});

test('Testes organiza casos, suites, planos e runs com dados consultados; tipo de execução explícito e estados vazios', async (t) => {
  const a = await preparar(t); await ir(a.page, 'testes');
  const subs = await a.page.locator('[data-sub]').allTextContents(); assert.deepEqual(subs, ['IDE', 'Repositório', 'Runs', 'Planos']);
  await a.page.click('[data-sub=repositorio]'); await a.page.waitForSelector('#cat-lista [data-caso="31"]'); assert.match(await a.page.textContent('#cat-lista [data-caso="31"]'), /Manual/);
  await a.page.waitForSelector('#suites-tabela [data-suite="1"]');
  await a.page.click('[data-sub=planos]'); await a.page.waitForSelector('#planos-tabela [data-plano="61"]');
  await a.page.click('[data-sub=runs]'); await a.page.waitForSelector('#runs-tabela [data-run-qase="71"]');
  await a.page.click('#run-nova'); await modal(a.page).locator('#run-casos input[data-caso="31"]').check(); await a.page.fill('#run-titulo', 'Run V40'); await a.page.click('#run-preparar'); await a.page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' });
  await a.page.click('[data-sub=runs]'); const run = a.page.locator('#runs-tabela [data-run]').filter({ hasText: 'Run V40' }); await run.waitFor(); assert.match(await run.textContent(), /ainda não criada no Qase/);
  await run.getByRole('button', { name: 'Abrir run Run V40' }).click(); await modal(a.page).waitFor(); assert.match(await modal(a.page).textContent(), /0 PASS|PASS/); assert.equal(await a.page.isDisabled('#qualidade-dialog [id^=run-pub-]'), true, 'publicar exige run no Qase');
  await captura(a, 'run-modal'); await fecharModal(a.page);
  assert.equal(naoGet(a.s).length, 0, 'preparar run é local');
  assert.deepEqual(a.erros, []);
});

test('Suporte com etapas e diagnóstico local; Ajuda pesquisável e agrupada, sem envio automático', async (t) => {
  const a = await preparar(t);
  await ir(a.page, 'suporte'); await a.page.waitForFunction(() => /v\d+\.\d+\.\d+/.test(document.querySelector('#sup-diagnostico-local')?.textContent || ''));
  assert.match(await a.page.textContent('#sup-diagnostico-local'), /Qualidade V40/); assert.equal(await a.page.isVisible('#sup-passos'), true);
  await a.page.selectOption('#sup-categoria', 'melhoria'); assert.equal(await a.page.isVisible('#sup-passos'), false, 'passos só para bug');
  await a.page.fill('#sup-titulo', 'Atalho para nova rotina'); await a.page.fill('#sup-descricao', 'Gostaria de um atalho.'); await a.page.check('#sup-consentimento'); await a.page.click('#sup-revisar'); await a.page.waitForSelector('#sup-previa');
  assert.equal(await a.page.getAttribute('.ds-passos-form span:nth-child(2)', 'aria-current'), 'step'); await captura(a, 'suporte');
  await ir(a.page, 'ajuda'); assert.ok((await a.page.locator('.ds-doc-grupo').count()) >= 5, 'índice agrupado');
  await a.page.fill('#ajuda-busca', 'MCP'); await a.page.waitForSelector('#ajuda-resultados:not([hidden]) .ds-doc-resultado'); assert.ok(await a.page.locator('#ajuda-resultados mark').count() > 0, 'trecho destacado');
  await a.page.locator('#ajuda-resultados .ds-doc-resultado button').first().click(); await a.page.waitForSelector('article h1'); assert.equal(await a.page.isVisible('#ajuda-resultados'), false);
  await a.page.fill('#ajuda-busca', 'zzzz-inexistente'); await a.page.getByText('Nada encontrado').waitFor(); await captura(a, 'ajuda');
  assert.equal(naoGet(a.s).length, 0); assert.deepEqual(a.erros, []);
});

test('Testes representa Qase e código: ligação só por anotação, tags, visão de código, conexões e permissões dos agentes', async (t) => {
  const f = await fixture(t);
  await f.write('tests/login.spec.ts', "import { qase } from 'playwright-qase-reporter';\ntest.describe('Login @auth', () => {\n  test(qase(31, 'editor grava @smoke'), async () => {\n    await test.step('Entrar como editor', async () => {});\n  });\n  test('rejeita senha @regression', async () => {\n    // Qase: SFQ-32\n  });\n  test('Caso fictício SFQ sem anotação', async () => {});\n});\n");
  const dados = novoDados(t), s = await servidorFixture(t), a = await abrir(t, dados);
  await a.app.evaluate((_, port) => { const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http'); process.getBuiltinModule('node:dns').promises.lookup = async () => ({ address: '93.184.216.34', family: 4 }); https.request = (url, opts, cb) => http.request({ hostname: '127.0.0.1', port, path: url.pathname + url.search, method: opts.method, headers: { ...opts.headers, 'x-fixture-host': url.hostname } }, cb); process.getBuiltinModule('node:module').syncBuiltinESMExports(); }, s.port);
  await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Testes V40', descricao: '' }))).data;
  const c = await a.page.evaluate((d) => window.prumo.servicoAdicionar(d), { servico: 'qase', nome: 'qase fixture', token: 'fixture-v40-secret' }); const rec = await a.page.evaluate((id) => window.prumo.servicoRecursos(id), c.data.id);
  await a.page.evaluate(([id, conta, r]) => window.prumo.servicoVincular(id, conta, r), [e.id, c.data.id, rec.data.recursos[0]]);
  await escolherPasta(a.app, f.root); assert.equal((await a.page.evaluate((id) => window.prumo.espacoPasta(id), e.id)).ok, true);
  await selecionar(a.page, e); await ir(a.page, 'testes'); await a.page.waitForSelector('#cat-resumo');
  const resumo = await a.page.textContent('#cat-resumo');
  assert.match(resumo, /1\s*casos carregados do Qase/); assert.match(resumo, /3\s*testes no código/); assert.match(resumo, /1\s*casos com código/); assert.match(resumo, /2\s*testes sem caso/);
  const caso = a.page.locator('#cat-lista tr[data-caso="31"]').first(); assert.match(await caso.textContent(), /login\.spec\.ts:3[\s\S]*Caso com código/);
  assert.match(await a.page.textContent('#cat-lista'), /Anota Qase SFQ-32, caso não encontrado/);
  const homonimo = a.page.locator('#cat-lista tr', { hasText: 'Caso fictício SFQ sem anotação' }).first(); assert.match(await homonimo.textContent(), /Código sem caso no Qase/, 'nome parecido com o caso não cria ligação');
  await a.page.locator('#cat-tipos label', { hasText: '@regression' }).click(); await a.page.waitForFunction(() => [...document.querySelectorAll('#cat-lista tbody tr')].every((r) => /rejeita senha/.test(r.textContent)));
  await a.page.locator('#cat-tipos label', { hasText: '@regression' }).click();
  // Modal do caso mostra o código que o implementa e leva à visão de código na linha certa.
  await caso.getByRole('button', { name: /^Abrir / }).click(); await modal(a.page).getByText('Código que implementa').waitFor();
  await modal(a.page).getByRole('button', { name: 'tests/login.spec.ts:3' }).click(); await a.page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' });
  await a.page.waitForSelector('.ds-ide-linhas [data-linha="3"][aria-current="true"]'); assert.equal(await a.page.getAttribute('[data-sub=ide]', 'aria-pressed'), 'true');
  assert.match(await a.page.textContent('.ds-ide-painel'), /Caso 31/); assert.match(await a.page.textContent('.ds-ide-painel'), /Entrar como Editor fictício|Entrar como editor/i);
  await a.page.waitForFunction(() => /executar testes: exige autorização/.test(document.querySelector('#ide-agentes')?.textContent || ''));
  assert.match(await a.page.textContent('#ide-agentes'), /branch, commit e PR: somente pessoa/, 'escrita no repositório continua sendo da pessoa');
  await captura(a, 'testes-codigo');
  // Leitura de arquivo é restrita a testes da pasta vinculada.
  const fora = await a.page.evaluate((id) => window.prumo.testesArquivo(id, 'src/app.mjs'), e.id); assert.equal(fora.ok, false);
  const travessia = await a.page.evaluate((id) => window.prumo.testesArquivo(id, '../x.spec.ts'), e.id); assert.equal(travessia.ok, false);
  assert.equal(naoGet(s).length, 0); assert.deepEqual(a.erros, []);
});

test('vínculos lidos do código mostram feature e cenário sem Qase e não inventam execução', async (t) => {
  const a = await preparar(t, { pasta: true });
  await a.f.write('tests/login.spec.ts', "describe('Login sintético', () => {\ntest('entra como editor', () => {});\n});\n");
  const removido = await a.page.evaluate((id) => window.prumo.servicoDesvincular(id, 'qase'), a.e.id);
  assert.equal(removido.ok, true);
  await ir(a.page, 'vinculos');
  await a.page.waitForSelector('#vinc-tabela');
  const tabela = await a.page.textContent('#vinc-tabela');
  assert.match(tabela, /Login sintético/); assert.match(tabela, /entra como editor/);
  assert.match(tabela, /Lido no código · sem execução/); assert.doesNotMatch(tabela, /Resultado observado/);
  const mapa = (await a.page.evaluate((id) => window.prumo.vinculosMapa(id), a.e.id)).data;
  assert.ok(mapa.arestas.some(x => x.origem === 'OBSERVADO_NO_CODIGO'));
  assert.ok(!mapa.arestas.some(x => x.origem === 'OBSERVADO'));
  assert.deepEqual(a.erros, []);
});
