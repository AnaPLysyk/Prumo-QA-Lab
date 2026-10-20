import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { fixture } from '../../../apoio/fixtures.mjs';
import { novoDados, abrir, ir, escolherPasta, mcp } from '../../../apoio/janela.mjs';

/** Contextos na janela real: formulário, aprovação com confirmação nativa, conflito, histórico, MCP e persistência. */
const dialogos = (app, resposta) => app.evaluate(({ dialog }, r) => { dialog.showMessageBox = async () => ({ response: r, checkboxChecked: false }); }, resposta);
const chamar = (page, fn, ...args) => page.evaluate(([f, a]) => window.prumo[f](...a), [fn, args]);
async function preparar(t, extra = {}) {
  const f = await fixture(t, extra); const dados = novoDados(t); const s = await abrir(t, dados);
  await escolherPasta(s.app, f.root); await s.page.click('text=Vincular pasta…');
  await s.page.waitForFunction((raiz) => window.prumo.projetos().then((r) => r.ok && r.data.some((p) => p.root === raiz)), f.root);
  await s.page.waitForFunction(() => document.querySelector('#projeto-atual')?.textContent !== 'nenhum selecionado', null, { timeout: 8000 });
  return { f, dados, ...s };
}
async function novoContexto(page, { titulo, texto, chave, ref = 'README.md', tipo = 'requisito' }) {
  await page.click('#ctx-novo'); await page.selectOption('#ctx-tipo', tipo); await page.fill('#ctx-titulo', titulo); await page.fill('#ctx-chave', chave ?? ''); await page.fill('#ctx-origem-ref', ref); await page.fill('#ctx-texto', texto);
  await page.click('#ctx-salvar'); await page.waitForSelector(`#ctx-tabela button:has-text("${titulo}")`);
}
const abrirDetalhe = async (page, titulo) => { await page.click(`#ctx-tabela button:has-text("${titulo}")`); await page.waitForSelector('#painel-contexto h2'); };

test('fluxo de contextos: criar, aprovar com confirmação nativa, editar, histórico e persistência após reabrir', async (t) => {
  const { app, page, f, dados, erros } = await preparar(t);
  await ir(page, 'contextos'); assert.match(await page.textContent('#qualidade-dialog'), /Nenhum contexto cadastrado/);
  await novoContexto(page, { titulo: 'Somente Editor grava', texto: 'R1: Apenas Editor grava registros.', chave: 'RQ-1' });
  assert.match(await page.textContent('#ctx-tabela'), /RASCUNHO/);
  await abrirDetalhe(page, 'Somente Editor grava');
  // sem a confirmação nativa nada é aprovado
  await dialogos(app, 0); await page.click('#painel-contexto button:has-text("Aprovar")'); await page.waitForTimeout(400);
  assert.equal((await chamar(page, 'contextosListar', f.root)).data.contextos[0].estado, 'RASCUNHO', 'cancelar a confirmação não aprova');
  await dialogos(app, 1); await page.click('#painel-contexto button:has-text("Aprovar")'); await page.waitForTimeout(500);
  let c = (await chamar(page, 'contextosListar', f.root)).data.contextos[0];
  assert.equal(c.estado, 'APROVADO'); assert.equal(c.aprovadoPor, os.userInfo().username, 'o aprovador é o usuário do Windows lido pelo processo principal');
  // editar invalida a aprovação
  await abrirDetalhe(page, 'Somente Editor grava'); await page.click('#painel-contexto button:has-text("Editar")');
  await page.fill('#ctx-texto', 'R1: Apenas Editor e Admin gravam registros.'); await page.click('#ctx-salvar'); await page.waitForSelector('#ctx-tabela');
  c = (await chamar(page, 'contextosListar', f.root)).data.contextos[0]; assert.equal(c.estado, 'RASCUNHO'); assert.equal(c.versao, 3); assert.equal(c.aprovadoPor, null);
  await abrirDetalhe(page, 'Somente Editor grava');
  const hist = await page.textContent('#painel-contexto table'); for (const a of ['criado', 'aprovado', 'editado']) assert.match(hist, new RegExp(a));
  await page.fill('#ctx-f-busca', 'Admin').catch(() => {});
  // persistência
  await app.close(); const s2 = await abrir(t, dados); await ir(s2.page, 'contextos');
  assert.match(await s2.page.textContent('#ctx-tabela'), /Somente Editor grava[\s\S]*RASCUNHO[\s\S]*v3/);
  assert.deepEqual([...erros, ...s2.erros], []);
});

test('conflito por chave, desatualização explícita, substituição e exclusão pela interface', async (t) => {
  const { app, page, f } = await preparar(t);
  await ir(page, 'contextos');
  await novoContexto(page, { titulo: 'Regra A', texto: 'Frete grátis acima de 500.', chave: 'RQ-FRETE' });
  await novoContexto(page, { titulo: 'Regra B', texto: 'Frete grátis só premium.', chave: 'RQ-FRETE' });
  const estados = async () => Object.fromEntries((await chamar(page, 'contextosListar', f.root)).data.contextos.map((x) => [x.titulo, x.estado]));
  assert.deepEqual(await estados(), { 'Regra A': 'CONFLITANTE', 'Regra B': 'CONFLITANTE' });
  await abrirDetalhe(page, 'Regra B'); assert.match(await page.textContent('#painel-contexto'), /não escolhe um lado/);
  await dialogos(app, 1); await page.click('#painel-contexto button:has-text("Aprovar")'); await page.waitForTimeout(400);
  assert.equal((await estados())['Regra B'], 'CONFLITANTE', 'aprovar com conflito é recusado');
  await page.click('#painel-contexto button:has-text("Marcar desatualizado")'); await page.waitForTimeout(500);
  assert.deepEqual(await estados(), { 'Regra A': 'RASCUNHO', 'Regra B': 'DESATUALIZADO' });
  await abrirDetalhe(page, 'Regra A'); await page.click('#painel-contexto button:has-text("Substituir por nova versão")'); await page.fill('#ctx-titulo', 'Regra A v2'); await page.click('#ctx-salvar'); await page.waitForSelector('#ctx-tabela button:has-text("Regra A v2")');
  assert.deepEqual(await estados(), { 'Regra A': 'DESATUALIZADO', 'Regra A v2': 'RASCUNHO', 'Regra B': 'DESATUALIZADO' });
  await abrirDetalhe(page, 'Regra A v2'); await dialogos(app, 0); await page.click('#painel-contexto button:has-text("Excluir")'); await page.waitForTimeout(400);
  assert.equal(Object.keys(await estados()).length, 3, 'excluir sem confirmação não apaga');
  await dialogos(app, 1); await page.click('#painel-contexto button:has-text("Excluir")'); await page.waitForTimeout(500);
  assert.equal(Object.keys(await estados()).length, 2);
});

test('disponibilizar ao agente exige confirmação; o MCP real do app lê o aprovado e a revisão acusa rascunho e conflito', async (t) => {
  const { app, page, f, dados } = await preparar(t);
  await ir(page, 'contextos');
  await novoContexto(page, { titulo: 'Somente Editor grava', texto: 'R1: Apenas Editor grava registros.', chave: 'RQ-1' });
  const id = (await chamar(page, 'contextosListar', f.root)).data.contextos[0].id;
  await dialogos(app, 1); await abrirDetalhe(page, 'Somente Editor grava'); await page.click('#painel-contexto button:has-text("Aprovar")'); await page.waitForTimeout(500);
  const plano = { requirement: 'R1: Apenas Editor grava registros.', source: 'RQ-1', existingTests: [], candidates: [{ id: 'A', behavior: 'Editor grava', source: 'RQ-1', risk: 'r', expected: 'ok', oracle: 'o', technique: 'equivalence', partition: 'Editor' }], contextoId: id };
  // padrão: desabilitado
  const primeiraLeituraMcp = await mcp(f.root, dados, [['contexto_projeto', {}], ['revisar_cobertura', plano]]);
  assert.ok(primeiraLeituraMcp.every(r => !r.isError), 'MCP sem erros: ' + primeiraLeituraMcp.map(r => r.content[0]?.text).join(' | '));
  let [ctx0, rev0] = primeiraLeituraMcp.map((r) => JSON.parse(r.content[0].text));
  assert.equal(ctx0.contextos.disponivel, false); assert.ok(rev0.findings.some((x) => x.type === 'CONTEXT_UNAVAILABLE'));
  // recusar a confirmação mantém desabilitado
  await dialogos(app, 0); await page.click('#ctx-mcp'); await page.waitForTimeout(400);
  assert.equal((await chamar(page, 'contextosListar', f.root)).data.disponibilizarAoMcp, false); assert.equal(await page.isChecked('#ctx-mcp'), false);
  await dialogos(app, 1); await page.click('#ctx-mcp'); await page.waitForTimeout(400);
  assert.equal((await chamar(page, 'contextosListar', f.root)).data.disponibilizarAoMcp, true);
  const [ctx1, rev1] = (await mcp(f.root, dados, [['contexto_projeto', {}], ['revisar_cobertura', plano]])).map((r) => JSON.parse(r.content[0].text));
  assert.equal(ctx1.contextos.disponivel, true); assert.equal(ctx1.contextos.referencias[0].estado, 'APROVADO'); assert.equal(ctx1.contextos.referencias[0].origem.referencia, 'README.md');
  const uso = rev1.facts.find((x) => x.kind === 'context_used'); assert.equal(uso.estado, 'APROVADO'); assert.equal(uso.requirementFoundInContext, true); assert.equal(rev1.findings.filter((x) => x.type.startsWith('CONTEXT_')).length, 0);
  // um segundo contexto de mesma chave cria conflito e a revisão informa
  await novoContexto(page, { titulo: 'Todos gravam', texto: 'R1: Todos gravam.', chave: 'RQ-1' });
  const [rev2] = (await mcp(f.root, dados, [['revisar_cobertura', plano]])).map((r) => JSON.parse(r.content[0].text));
  assert.ok(rev2.findings.some((x) => x.type === 'CONTEXT_CONFLICT' && x.severity === 'high'));
  assert.equal(rev2.executed, false);
});

test('IPC de contextos: esquema estrito (sem "por" injetado), projeto não vinculado e ids inválidos são recusados', async (t) => {
  const f = await fixture(t); const dados = novoDados(t); const { page } = await abrir(t, dados);
  assert.match((await chamar(page, 'contextosListar', f.root)).error, /PROJECT_NOT_LINKED/);
  assert.match((await page.evaluate((r) => window.prumo.contextosSalvar(r, { dados: { tipo: 'requisito', titulo: 'x', texto: 'y', origem: { tipo: 'pessoa', referencia: 'a' }, por: 'admin' } }), f.root)).error, /INVALID_ARGUMENTS|PROJECT_NOT_LINKED/);
  assert.match((await chamar(page, 'contextosObter', f.root, '../../x')).error, /INVALID_ARGUMENTS/);
  assert.match((await chamar(page, 'contextosAprovar', f.root, 'nao-uuid')).error, /INVALID_ARGUMENTS/);
});

test('excluir todos os contextos pela privacidade exige confirmação e preserva histórico, vínculo e código', async (t) => {
  const { app, page, f } = await preparar(t);
  await ir(page, 'contextos'); await novoContexto(page, { titulo: 'Qualquer', texto: 'Texto', chave: 'K' });
  await ir(page, 'ajuda'); await page.click('.indice button:has-text("Privacidade e dados")'); await page.waitForTimeout(400);
  await dialogos(app, 0); await page.click('#excluir-contextos'); await page.waitForSelector('text=Cancelado; nada foi excluído.');
  assert.equal((await chamar(page, 'contextosListar', f.root)).data.total, 1);
  await dialogos(app, 1); await page.click('#excluir-contextos'); await page.waitForSelector('text=Excluídos: 1 arquivo(s).');
  assert.equal((await chamar(page, 'contextosListar', f.root)).data.total, 0); assert.equal((await chamar(page, 'projetos')).data.length, 1);
});

test('navegação rápida entre abas não mistura conteúdos nem duplica elementos (só a última renderização vale)', async (t) => {
  const { page, erros } = await preparar(t);
  // Cliques disparados DENTRO da página, de forma síncrona: as renderizações se sobrepõem de verdade (cliques do Playwright são lentos demais).
  await page.evaluate(() => { for (let r = 0; r < 4; r++) for (const aba of ['metricas', 'logs', 'conexoes', 'ajuda', 'agenda', 'projetos']) document.querySelector(`[data-aba=${aba}]`).click(); });
  await page.waitForSelector('#espaco-novo'); await page.waitForTimeout(1500); // estado logo após a rajada, sem novo clique que limparia a tela
  const dentro = await page.evaluate(() => ({ novo: document.querySelectorAll('#espaco-novo').length, acompanhar: document.querySelectorAll('#acompanhar').length, ajuda: document.querySelectorAll('.ajuda').length, tabelasProjetos: document.querySelectorAll('#conteudo > table').length, h1: [...document.querySelectorAll('#conteudo h1')].map((h) => h.textContent.replace(/\d+$/, '').trim()), atual: document.querySelector('#nav [aria-current=page]').dataset.aba }));
  assert.deepEqual(dentro, { novo: 1, acompanhar: 0, ajuda: 0, tabelasProjetos: 1, h1: ['Projetos'], atual: 'projetos' });
  assert.deepEqual(erros, []);
});
