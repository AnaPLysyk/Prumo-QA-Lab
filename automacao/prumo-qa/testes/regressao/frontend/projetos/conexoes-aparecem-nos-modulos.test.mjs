import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';
import { servidorFixture } from '../../../apoio/servicos-fixtures.mjs';

// Conecta GitHub e Jira pela tela Conexões e confere que aparecem em Projetos (lista de repositórios e vínculo), Testes (IDE/pipelines
// do repositório) e Tickets. Janela real; perfil e serviços sintéticos (servidor local no lugar de api.github.com e do Jira).
async function preparar(t) {
  const s = await servidorFixture(t), a = await abrir(t, novoDados(t));
  await a.app.evaluate((_, port) => {
    const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http');
    process.getBuiltinModule('node:dns').promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
    https.request = (url, opts, cb) => http.request({ hostname: '127.0.0.1', port, path: url.pathname + url.search, method: opts.method, headers: { ...opts.headers, 'x-fixture-host': url.hostname } }, cb);
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
  }, s.port);
  await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  return { s, a };
}
const conectar = async (page, servico, nome, extras = {}) => {
  await ir(page, 'conexoes'); await page.click('#conexao-nova');
  await page.selectOption('#conexao-servico', servico); await page.fill('#conexao-nome', nome);
  if (extras.instancia) { await page.fill('#conexao-instancia', extras.instancia); await page.fill('#conexao-usuario', extras.usuario); }
  await page.fill('#conexao-token', 'fixture-secret-conexoes'); await page.click('#conexao-salvar');
  await page.locator('[data-conta]', { hasText: nome }).waitFor(); // 2.15: a conta é uma linha sob o serviço, não um cartão
};

test('GitHub conectado em Conexões lista os repositórios em Projetos, vincula e aparece em Testes', { timeout: 120000 }, async (t) => {
  const { s, a } = await preparar(t);
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Repos Lab', descricao: 'sintético' }))).data;
  await ir(a.page, 'projetos');
  await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: /Escolher repositório do GitHub/ }).click();
  await a.page.getByText('Nenhuma conexão do GitHub ativa').waitFor();
  await conectar(a.page, 'github', 'GitHub simulado');
  await ir(a.page, 'projetos');
  await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: /Escolher repositório do GitHub/ }).click();
  const painel = a.page.locator(`[data-espaco="${e.id}"] .repos-github`);
  await painel.getByText('empresa/automacao-smart').waitFor(); await painel.getByText('empresa/automacao-cid').waitFor();
  await painel.locator('li', { hasText: 'empresa/automacao-smart' }).getByRole('button', { name: 'Vincular', exact: true }).click();
  await a.page.locator(`[data-espaco="${e.id}"] .proj-vinculo[data-servico="github"]`, { hasText: 'empresa/automacao-smart' }).waitFor();
  await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: /Selecionar projeto/ }).click();
  await a.page.waitForFunction(() => /Repos Lab/.test(document.querySelector('#projeto-atual')?.textContent || ''));
  await ir(a.page, 'testes'); await a.page.click('[data-sub=ide]');
  await a.page.locator('#ide-trazer').waitFor();
  assert.ok(s.pedidos.every((p) => p.metodo === 'GET'), 'só leituras no GitHub');
  assert.deepEqual(a.erros, []);
});

test('Jira conectado em Conexões e vinculado ao projeto aparece em Tickets', { timeout: 120000 }, async (t) => {
  const { a } = await preparar(t);
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'SMART-LAB', descricao: 'sintético' }))).data;
  await conectar(a.page, 'jira', 'Jira simulado', { instancia: 'https://lab.atlassian.net', usuario: 'fixture@example.test' });
  const conta = (await a.page.evaluate(() => window.prumo.servicos())).data.find((c) => c.servico === 'jira');
  const recursos = (await a.page.evaluate((id) => window.prumo.servicoRecursos(id), conta.id)).data.recursos;
  assert.equal((await a.page.evaluate(([x, y, z]) => window.prumo.servicoVincular(x, y, z), [e.id, conta.id, recursos[0]])).ok, true);
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: /Selecionar projeto/ }).click();
  await a.page.waitForFunction(() => /SMART-LAB/.test(document.querySelector('#projeto-atual')?.textContent || ''));
  await ir(a.page, 'tickets');
  await a.page.locator('#tk-lista').getByText('SMART-1').first().waitFor();
  assert.deepEqual(a.erros, []);
});
