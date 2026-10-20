/** Jornada pedida: token do Qase → projetos da conta → selecionar → projeto vinculado em Projetos, casos em Testes e defeitos em Tickets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';
import { servidorFixture } from '../../../apoio/servicos-fixtures.mjs';

// Mesmo desvio de rede da demonstração de dois projetos: api.qase.io responde pelo servidor sintético local.
const instrumentar = (app, port) => app.evaluate((_, p) => {
  const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http'), dns = process.getBuiltinModule('node:dns');
  dns.promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
  https.request = (url, opcoes, callback) => http.request({ hostname: '127.0.0.1', port: p, path: url.pathname + url.search, method: opcoes.method, headers: { ...opcoes.headers, 'x-fixture-host': url.hostname } }, callback);
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
}, port);
const confirmar = (app) => app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });

test('Qase: conectar pelo token lista os projetos; o escolhido vira projeto vinculado com casos em Testes e defeitos em Tickets', async (t) => {
  const dados = novoDados(t), s = await servidorFixture(t);
  const a = await abrir(t, dados); await instrumentar(a.app, s.port); await confirmar(a.app);
  const texto = (sel) => a.page.textContent(sel);

  await ir(a.page, 'conexoes'); await a.page.click('#conexao-nova');
  assert.equal(await a.page.inputValue('#conexao-servico'), 'qase');
  await a.page.fill('#conexao-token', 'fixture-token-qase-jornada'); await a.page.click('#qase-conectar');
  await a.page.waitForSelector('#qase-projetos-lista input[data-codigo="SFQ"]');
  const itens = await a.page.$$eval('#qase-projetos-lista .cx-item', (l) => l.map((x) => x.textContent.trim())); assert.deepEqual(itens, ['QaseSFQSFQ', 'CID-QACQA'], 'cada item mostra nome e código');
  assert.equal(await a.page.inputValue('#conexao-token'), '', 'o token não fica na tela');

  await a.page.check('#qase-projetos-lista input[data-codigo="SFQ"]'); await a.page.click('#qase-importar');
  await a.page.waitForFunction(() => document.querySelector('#conteudo h1')?.textContent === 'Projetos');
  const projetos = (await a.page.evaluate(() => window.prumo.espacos())).data;
  assert.equal(projetos.length, 1, 'só o projeto escolhido é importado');
  const p = projetos[0]; assert.equal(p.nome, 'QaseSFQ'); assert.deepEqual(p.vinculos.map((v) => [v.servico, v.recurso.chave]), [['qase', 'SFQ']]);
  assert.doesNotMatch(await texto('body'), /fixture-token-qase-jornada/);

  await a.page.locator(`[data-espaco="${p.id}"]`).getByRole('button', { name: /Selecionar projeto|Projeto selecionado/ }).click();
  await a.page.waitForFunction((n) => document.querySelector('#projeto-atual')?.textContent === n, 'QaseSFQ');

  await ir(a.page, 'testes'); await a.page.waitForFunction(() => document.querySelector('#conteudo')?.textContent.includes('Caso fictício SFQ'), null, { timeout: 15000 });
  await ir(a.page, 'tickets'); await a.page.waitForSelector('[data-origem="qase"][data-defeito="91"]', { timeout: 15000 });
  assert.match(await texto('#tk-lista'), /Defeito fictício SFQ/);
  assert.ok(!s.pedidos.some((x) => x.metodo !== 'GET'), 'conectar e importar não escrevem nada no Qase');
  assert.deepEqual(a.erros, []);
});
