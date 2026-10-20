import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';
import { servidorFixture } from '../../../apoio/servicos-fixtures.mjs';

// 2.9: telas de integração na janela real. Serviços são um servidor local sintético; nenhum projeto externo é tocado.
const confirmar = (app, resposta = 1) => app.evaluate(({ dialog }, r) => { dialog.showMessageBox = async () => ({ response: r, checkboxChecked: false }); }, resposta);
const instrumentar = (app, port) => app.evaluate((_, p) => {
  const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http'), dns = process.getBuiltinModule('node:dns');
  dns.promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
  https.request = (url, opcoes, callback) => http.request({ hostname: '127.0.0.1', port: p, path: url.pathname + url.search, method: opcoes.method, headers: { ...opcoes.headers, 'x-fixture-host': url.hostname } }, callback);
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
}, port);

async function preparar(t) {
  const dados = novoDados(t), s = await servidorFixture(t); const a = await abrir(t, dados); await instrumentar(a.app, s.port); await confirmar(a.app);
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'SMART-LAB', descricao: 'sintético' }))).data;
  for (const [servico, instancia, usuario, indice] of [['jira', 'https://lab.atlassian.net', 'fixture@example.test', 0], ['qase', undefined, undefined, 0]]) {
    const conta = (await a.page.evaluate((d) => window.prumo.servicoAdicionar(d), { servico, nome: servico + ' simulado', ...(instancia ? { instancia, usuario } : {}), token: 'fixture-secret-29' })).data;
    const recursos = (await a.page.evaluate((id) => window.prumo.servicoRecursos(id), conta.id)).data.recursos;
    assert.ok((await a.page.evaluate(([x, y, z]) => window.prumo.servicoVincular(x, y, z), [e.id, conta.id, recursos[indice]])).ok);
  }
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click();
  await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'SMART-LAB');
  return { dados, s, a, e };
}

test('navegação: telas novas abrem sem erro e sem botão decorativo (cada controle chama o backend ou explica por que está indisponível)', async (t) => {
  const { a } = await preparar(t);
  for (const aba of ['runs', 'vinculos', 'agentes', 'conexoes', 'tickets', 'testes', 'automacoes']) { await ir(a.page, aba); assert.ok((await a.page.textContent('#conteudo')).length > 40, aba); }
  await ir(a.page, 'conexoes'); assert.equal(await a.page.locator('[data-escrita]').count(), 3);
  assert.match(await a.page.textContent('[data-escrita=jira]'), /somente leitura/, 'escrita nasce desligada');
  await ir(a.page, 'tickets'); assert.ok(await a.page.locator('[data-escrita-desligada=jira]').count(), 'aviso claro: escrita desligada');
  assert.deepEqual(a.erros, []);
});

test('Conexões: habilitar escrita exige confirmação nativa; recusar mantém somente leitura', async (t) => {
  const { a, e } = await preparar(t);
  await ir(a.page, 'conexoes'); await confirmar(a.app, 0); await a.page.click('#escrita-jira');
  await a.page.waitForTimeout(400); assert.match(await a.page.textContent('[data-escrita=jira]'), /somente leitura/);
  assert.equal((await a.page.evaluate((id) => window.prumo.escritaEstado(id), e.id)).data.servicos.find((x) => x.servico === 'jira').escrita, false);
  await confirmar(a.app, 1); await a.page.click('#escrita-jira');
  await a.page.waitForFunction(() => /escrita habilitada/.test(document.querySelector('[data-escrita=jira]')?.textContent || ''));
  assert.deepEqual(a.erros, []);
});

test('Tickets: filtro, detalhe e comentário idempotente pela interface (única escrita é o POST de comentário)', async (t) => {
  const { a, s } = await preparar(t);
  await ir(a.page, 'conexoes'); await a.page.click('#escrita-jira'); await a.page.waitForFunction(() => /escrita habilitada/.test(document.querySelector('[data-escrita=jira]')?.textContent || ''));
  await ir(a.page, 'tickets'); await a.page.fill('#tk-q', 'SMART'); await a.page.click('#tk-buscar'); await a.page.waitForSelector('#tk-tabela [data-ticket="SMART-1"]');
  const jql = decodeURIComponent(s.pedidos.filter((p) => p.caminho.includes('/search/jql')).at(-1).caminho);
  assert.match(jql, /project[+ ]=[+ ]11[+ ]AND/, 'o JQL é sempre restrito ao projeto vinculado'); assert.match(jql, /SMART/);
  await a.page.locator('#tk-tabela [data-ticket="SMART-1"]').getByRole('button', { name: 'Abrir' }).click(); await a.page.waitForSelector('#tk-painel');
  await a.page.fill('#tk-comentario', 'Falha reproduzida no ambiente de teste.'); await a.page.click('#tk-comentar');
  await a.page.waitForSelector('[data-resultado-operacao="CONFIRMADA"]'); assert.equal(s.comentarios.length, 1);
  assert.match(JSON.stringify(s.comentarios[0].body), /prumo-[0-9a-f]{10}/, 'marcador de idempotência no comentário');
  await a.page.click('#tk-comentar'); await a.page.waitForFunction(() => document.querySelectorAll('[data-resultado-operacao]').length >= 2); assert.equal(s.comentarios.length, 1, 'repetir não duplica');
  assert.deepEqual([...new Set(s.pedidos.filter((p) => p.metodo !== 'GET').map((p) => p.metodo + ' ' + p.caminho))], ['POST /rest/api/3/issue/SMART-1/comment']);
  assert.deepEqual(a.erros, []);
});

test('Tickets locais: criar sem Jira, classificar, vincular a ticket existente e a falha de run aparecer classificada; nada é escrito no Jira', async (t) => {
  const { a, s, e } = await preparar(t);
  await ir(a.page, 'tickets'); await a.page.click('#tk-novo-local'); await a.page.selectOption('#tkl-classificacao', 'MELHORIA'); await a.page.fill('#tkl-resumo', 'Mostrar total no cabeçalho da lista'); await a.page.click('#tkl-salvar');
  await a.page.waitForSelector('#tk-tabela [data-origem="prumo"]'); assert.match(await a.page.textContent('#tk-tabela [data-origem="prumo"]'), /Melhoria/);
  const base = await a.page.evaluate((id) => window.prumo.propostas(id), e.id); assert.equal(base.data.length, 1); assert.equal(base.data[0].estado, 'RASCUNHO'); assert.equal(base.data[0].remoto, null);
  await a.page.locator('#tk-tabela [data-origem="prumo"]').getByRole('button', { name: 'Abrir' }).click(); await a.page.waitForSelector('#tkl-painel');
  await a.page.selectOption('#tkl-nova-classificacao', 'OUTRO_BUG'); await a.page.click('#tkl-classificar'); await a.page.waitForSelector('#tk-tabela [data-origem="prumo"]'); assert.match(await a.page.textContent('#tk-tabela [data-origem="prumo"]'), /Outro bug/);
  await a.page.locator('#tk-tabela [data-origem="prumo"]').getByRole('button', { name: 'Abrir' }).click(); await a.page.fill('#tkl-chave', 'smart-1'); await a.page.click('#tkl-vincular');
  await a.page.waitForFunction(() => /Vinculada/.test(document.querySelector('#tk-tabela [data-origem="prumo"]')?.textContent || '')); assert.match(await a.page.textContent('#tk-tabela [data-origem="prumo"]'), /SMART-1/);
  const depois = (await a.page.evaluate((id) => window.prumo.propostas(id), e.id)).data[0]; assert.equal(depois.estado, 'VINCULADA'); assert.equal(depois.remoto.chave, 'SMART-1');
  assert.equal(s.pedidos.filter((p) => p.metodo !== 'GET').length, 0, 'criar, classificar e vincular não escrevem no Jira');
  assert.deepEqual(a.erros, []);
});

test('Testes: proposta é rascunho, revisão exige os quatro itens e confirmação nativa, e nada sai sem escrita habilitada', async (t) => {
  const { a, s } = await preparar(t);
  await ir(a.page, 'testes'); await a.page.click('[data-sub=repositorio]'); await a.page.click('#pr-nova'); await a.page.fill('#pr-titulo', 'Login rejeita senha incorreta'); await a.page.fill('#pr-descricao', 'Valida a mensagem de erro.');
  await a.page.fill('.passo-acao', 'Informar usuário válido e senha errada'); await a.page.fill('.passo-esperado', 'Mensagem de credenciais inválidas'); await a.page.fill('#pr-requisito', 'RQ-12'); await a.page.fill('#pr-risco', 'Acesso indevido');
  await a.page.click('#pr-salvar'); await a.page.waitForSelector('[data-proposta]');
  assert.match(await a.page.textContent('[data-proposta]'), /RASCUNHO/);
  const antes = s.pedidos.filter((p) => p.metodo !== 'GET').length; assert.equal(antes, 0, 'salvar rascunho não escreve em lugar nenhum');
  await a.page.getByRole('button', { name: /^Publicar/ }).click(); await a.page.waitForFunction(() => /revis|desligad|habilit/i.test(document.querySelector('#aviso')?.textContent || ''));
  assert.equal(s.pedidos.filter((p) => p.metodo !== 'GET').length, 0, 'publicar sem revisão e sem escrita habilitada não envia nada');
  await a.page.getByRole('button', { name: 'Descartar' }).click(); await a.page.waitForSelector('#pr-vazia');
  assert.deepEqual(a.erros, []);
});

test('Agentes: matriz real, política salva com confirmação e vínculos mostram lacunas sem inventar relação', async (t) => {
  const { a, e } = await preparar(t);
  await ir(a.page, 'agentes'); await a.page.waitForSelector('#ag-matriz'); assert.ok(await a.page.locator('#ag-especializacoes input').count() >= 8);
  assert.match(await a.page.textContent('[data-cap=executar_testes]'), /autoriza/i);
  await a.page.selectOption('[data-pol=propor_bugs]', 'BLOQUEADO'); await a.page.click('#ag-salvar'); await a.page.waitForFunction(() => /Permissões salvas|Permissions saved/.test(document.querySelector('#aviso')?.textContent || ''));
  const estado = (await a.page.evaluate((id) => window.prumo.agentesEstado(id), e.id)).data; assert.equal(estado.matriz.find((c) => c.id === 'propor_bugs').estado, 'BLOQUEADO');
  await ir(a.page, 'vinculos'); await a.page.waitForSelector('#vinc-aviso'); assert.ok(await a.page.locator('#vinc-lacunas, #vinc-tabela').count());
  assert.deepEqual(a.erros, []);
});

test('Testes: sem integração aparecem só os testes do repositório, agrupados por feature e classificados; filtro por tipo funciona', async (t) => {
  const { fixture } = await import('../../../apoio/fixtures.mjs'); const { escolherPasta } = await import('../../../apoio/janela.mjs');
  const fs = await import('node:fs/promises'); const path = await import('node:path');
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'tests/e2e'), { recursive: true });
  await fs.writeFile(path.join(f.root, 'tests/e2e/login.spec.ts'), "import { test } from '@playwright/test';\ntest.describe('Login', () => {\n  test('entra com senha válida @smoke', async ({ page }) => { await page.goto('/'); });\n  test('rejeita senha incorreta', async ({ page }) => { await page.goto('/'); });\n});\n");
  await fs.writeFile(path.join(f.root, 'src/soma.test.ts'), "describe('Soma', () => { it('soma dois números', () => {}); });\n");
  const dados = novoDados(t); const a = await abrir(t, dados);
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'REPO-LAB', descricao: 'sintético' }))).data;
  await escolherPasta(a.app, f.root); assert.ok((await a.page.evaluate((id) => window.prumo.espacoPasta(id), e.id)).ok);
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click();
  await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'REPO-LAB');
  // v40: Visão geral agrupa por tag/feature/nível; filtro por tag e por nível sobre a leitura estática do repositório.
  await ir(a.page, 'testes'); await a.page.waitForSelector('#cat-resumo');
  assert.equal(await a.page.locator('#casos-tabela').count(), 0, 'sem Qase vinculado não há a tabela de casos do Qase');
  await a.page.selectOption('#cat-agrupar', 'feature'); await a.page.waitForSelector('#cat-lista [data-feature="Login"]');
  assert.deepEqual((await a.page.locator('#cat-lista [data-feature]').evaluateAll((n) => n.map((x) => x.dataset.feature))).sort(), ['Login', 'Soma']);
  assert.match(await a.page.textContent('#cat-resumo'), /3\s*testes no código/); assert.match(await a.page.textContent('#cat-aviso'), /leitura estática/);
  const linhas = () => a.page.evaluate(() => [...document.querySelectorAll('#cat-lista tbody tr')].map((r) => r.textContent));
  await a.page.locator('#cat-tipos label', { hasText: '@smoke' }).click(); await a.page.waitForFunction(() => document.querySelectorAll('#cat-lista tbody tr').length === 1);
  assert.match((await linhas())[0], /senha válida/);
  await a.page.locator('#cat-tipos label', { hasText: '@smoke' }).click(); await a.page.selectOption('#cat-nivel', 'unitario');
  await a.page.waitForFunction(() => document.querySelectorAll('#cat-lista tbody tr').length === 1); assert.match((await linhas())[0], /soma dois/);
  assert.deepEqual(a.erros, []);
});
