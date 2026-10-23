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

test('Qase: vários projetos escolhidos aparecem no seletor, cada um com a sua conexão (cabo) e dá para trocar entre eles', async (t) => {
  const dados = novoDados(t), s = await servidorFixture(t);
  const a = await abrir(t, dados); await instrumentar(a.app, s.port); const conf = atenderConfirmacoes(a.app, () => 'confirmar'); t.after(() => conf.parar());
  await a.page.locator('#projetos-vazio').waitFor();
  await a.page.getByRole('button', { name: 'Importar do Qase' }).click();
  await a.page.getByRole('button', { name: 'Conectar conta do Qase' }).click();
  await a.page.getByRole('textbox', { name: 'Token de acesso' }).fill('fixture-token-qase-varios');
  await a.page.click('#qase-conectar');
  // 2.19: um projeto por vez. O primeiro vira projeto novo; o segundo entra por Importar › Qase › Escolher › Criar projeto.
  await a.page.locator('.proj-vinculo', { hasText: 'SFQ' }).first().getByRole('button', { name: 'Escolher' }).click();
  await a.page.locator('.ds-proj-workspace').waitFor();
  const [primeiro] = (await a.page.evaluate(() => window.prumo.espacos())).data;
  await a.page.click('#projeto-importar'); await a.page.click('#espaco-importar-qase');
  await a.page.locator('.proj-vinculo', { hasText: 'CQA' }).first().getByRole('button', { name: 'Escolher' }).click();
  await a.page.click('#importar-criar');
  // O painel de importação abre dentro da própria bancada: espera o segundo projeto existir de fato (a importação passa pela confirmação).
  // (waitForFunction com função assíncrona não espera: a Promise já conta como verdadeira; consulta de verdade a cada 100 ms.)
  for (let i = 0; i < 300 && (await a.page.evaluate(() => window.prumo.espacos().then((r) => (r.data || []).length))) < 2; i++) await a.page.waitForTimeout(100);
  const projetos = (await a.page.evaluate(() => window.prumo.espacos())).data;
  assert.equal(projetos.length, 2, 'os dois projetos viram projetos Prumo');
  await a.page.locator(`.ds-proj-workspace[data-espaco="${projetos.find((p) => p.id !== primeiro.id).id}"]`).waitFor();
  // O seletor do menu lista os dois; o aberto tem o cabo do Qase conectado.
  await a.page.locator('#projeto-botao').click();
  const opcoes = await a.page.locator('#projeto-lista button[data-seletor-item="projeto"]').allTextContents();
  assert.equal(opcoes.length, 2);
  await a.page.locator('.ds-proj-cabo[data-servico="qase"][data-ativo="sim"]').waitFor();
  const atual = await a.page.locator('#projeto-atual').textContent();
  const outro = opcoes.find((o) => o.trim() !== atual.trim());
  await a.page.locator('#projeto-lista button[data-seletor-item="projeto"]', { hasText: outro.trim() }).click();
  await a.page.waitForFunction((n) => document.querySelector('#projeto-atual')?.textContent === n, outro.trim());
  await a.page.locator('.ds-proj-cabo[data-servico="qase"][data-ativo="sim"]').waitFor(); // o outro projeto tem a sua própria conexão
  // Cada projeto começa em só leitura e mostra o modo; o modo "integrado" é escolhido por projeto (pede confirmação).
  await a.page.locator('.ds-proj-modulo[data-servico="qase"]').getByText('só leitura').waitFor();
  // O modo é um par de botões (Só ver | Integrado); o projeto começa em Só ver.
  await a.page.locator('.ds-proj-modulo[data-servico="qase"]').getByRole('button', { name: 'Integrado', exact: true }).waitFor();
  assert.equal(await a.page.locator('.ds-proj-modulo[data-servico="qase"]').getByRole('button', { name: 'Só ver', exact: true }).getAttribute('aria-pressed'), 'true');
  // Token salvo fica trancado: só dá para trocar por outro, e o antigo nunca aparece na tela.
  await a.page.locator('.ds-proj-modulo[data-servico="qase"] .ds-proj-modulo-emblema').click();
  await a.page.getByRole('tab', { name: 'Contas e permissões' }).click();
  await a.page.getByRole('button', { name: 'Trocar token' }).click();
  await a.page.getByRole('textbox', { name: /Novo token/ }).fill('fixture-token-qase-novo');
  await a.page.getByRole('button', { name: 'Guardar novo token' }).click();
  await a.page.waitForFunction(() => !document.querySelector('[id^="conta-novo-token-"]'));
  await a.page.locator('.ds-proj-workspace').waitFor();
  assert.doesNotMatch(await a.page.textContent('body'), /fixture-token-qase-(varios|novo)/);
  assert.ok(!s.pedidos.some((x) => x.metodo !== 'GET'));
  assert.deepEqual(a.erros, []);
});
