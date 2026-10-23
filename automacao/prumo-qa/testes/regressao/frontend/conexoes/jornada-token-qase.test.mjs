/** Jornada pedida: token do Qase → projetos da conta → selecionar → projeto vinculado em Projetos, casos em Testes e defeitos em Tickets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir, abrirConexoes, usarProjeto, atenderConfirmacoes } from '../../infra/janela.mjs';
import { servidorFixture } from '../../../../site/scripts/servicos-fixtures.mjs';

// Mesmo desvio de rede da demonstração de dois projetos: api.qase.io responde pelo servidor sintético local.
const instrumentar = (app, port) => app.evaluate((_, p) => {
  const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http'), dns = process.getBuiltinModule('node:dns');
  dns.promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
  https.request = (url, opcoes, callback) => http.request({ hostname: '127.0.0.1', port: p, path: url.pathname + url.search, method: opcoes.method, headers: { ...opcoes.headers, 'x-fixture-host': url.hostname } }, callback);
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
}, port);

test('Qase: conectar pelo token lista os projetos; o escolhido vira projeto vinculado com casos em Testes e defeitos em Tickets', async (t) => {
  const dados = novoDados(t), s = await servidorFixture(t);
  const a = await abrir(t, dados); await instrumentar(a.app, s.port); const conf = atenderConfirmacoes(a.app, () => 'confirmar'); t.after(() => conf.parar());
  const texto = (sel) => a.page.textContent(sel);

  await ir(a.page, 'projetos');
  await a.page.locator('#projetos-vazio').waitFor();
  await a.page.click('#espaco-importar-qase');
  await a.page.getByRole('button', { name: 'Conectar conta do Qase' }).click();
  await a.page.locator('#conexao-token').waitFor();
  // O formulário abre só com o serviço escolhido (sem seletor de serviço).
  assert.equal(await a.page.locator('#conexao-servico').count(), 0);
  await a.page.fill('#conexao-token', 'fixture-token-qase-jornada'); await a.page.click('#qase-conectar');
  // 2.19: dentro de um fluxo de importação o botão só conecta a conta; os projetos aparecem como lista de recursos com "Escolher".
  await a.page.locator('.proj-vinculo', { hasText: 'SFQ' }).first().waitFor();
  assert.equal(await a.page.locator('.proj-vinculo').count(), 2, 'a conta lista os dois projetos');
  assert.match(await a.page.locator('.proj-vinculo', { hasText: 'SFQ' }).first().textContent(), /QaseSFQ[\s\S]*SFQ/, 'cada item mostra nome e código');
  assert.match(await a.page.locator('.proj-vinculo', { hasText: 'CQA' }).first().textContent(), /CID-QA/);
  assert.equal(await a.page.locator('#conexao-token').count(), 0, 'o campo do token some da tela'); assert.doesNotMatch(await texto('body'), /fixture-token-qase-jornada/, 'o token não fica na tela');

  await a.page.locator('.proj-vinculo', { hasText: 'SFQ' }).first().getByRole('button', { name: 'Escolher' }).click();
  // O título "Projetos" já estava na tela: espera a importação (que passa pela confirmação) terminar e a bancada abrir.
  await a.page.waitForFunction(async () => ((await window.prumo.espacos()).data || []).length > 0);
  await a.page.locator('.ds-proj-workspace').waitFor();
  const projetos = (await a.page.evaluate(() => window.prumo.espacos())).data;
  assert.equal(projetos.length, 1, 'só o projeto escolhido é importado');
  const p = projetos[0]; assert.equal(p.nome, 'QaseSFQ'); assert.deepEqual(p.vinculos.map((v) => [v.servico, v.recurso.chave]), [['qase', 'SFQ']]);
  assert.doesNotMatch(await texto('body'), /fixture-token-qase-jornada/);

  await usarProjeto(a.page, p.id);
  await a.page.waitForFunction((n) => document.querySelector('#projeto-atual')?.textContent === n, 'QaseSFQ');

  // 2.20: com suítes do Qase a lista vem agrupada e a suíte recolhida só monta os casos ao abrir; a busca mostra a lista plana.
  await ir(a.page, 'testes'); await a.page.waitForSelector('#cat-busca', { timeout: 15000 }); await a.page.fill('#cat-busca', 'Caso fictício SFQ');
  await a.page.waitForFunction(() => document.querySelector('#cat-lista')?.textContent.includes('Caso fictício SFQ'), null, { timeout: 15000 });
  await ir(a.page, 'tickets'); await a.page.waitForSelector('[data-origem="qase"][data-defeito="91"]', { timeout: 15000 });
  assert.match(await texto('#tk-lista'), /Defeito fictício SFQ/);
  assert.ok(!s.pedidos.some((x) => x.metodo !== 'GET'), 'conectar e importar não escrevem nada no Qase');
  assert.deepEqual(a.erros, []);
});
