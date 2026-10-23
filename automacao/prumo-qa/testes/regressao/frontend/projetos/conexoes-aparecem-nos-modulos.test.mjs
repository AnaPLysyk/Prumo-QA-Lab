import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir, abrirConexoes, usarProjeto, atenderConfirmacoes } from '../../infra/janela.mjs';
import { servidorFixture } from '../../../../site/scripts/servicos-fixtures.mjs';

// Conecta GitHub e Jira nas configurações de Projetos; confere vínculos e recursos em Testes (IDE/pipelines
// do repositório) e Tickets. Janela real; perfil e serviços sintéticos (servidor local no lugar de api.github.com e do Jira).
async function preparar(t) {
  const s = await servidorFixture(t), a = await abrir(t, novoDados(t));
  await a.app.evaluate((_, port) => {
    const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http');
    process.getBuiltinModule('node:dns').promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
    https.request = (url, opts, cb) => http.request({ hostname: '127.0.0.1', port, path: url.pathname + url.search, method: opts.method, headers: { ...opts.headers, 'x-fixture-host': url.hostname } }, cb);
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
  }, s.port);
  const conf = atenderConfirmacoes(a.app, () => 'confirmar'); t.after(() => conf.parar());
  return { s, a, conf };
}
// 2.19: GitHub e Jira conectam pelo navegador; o token manual fica em "Configuração avançada" (details fechado). A conta Jira se chama "Jira · <site>".
const conectar = async (page, conf, projetoId, servico, nome, extras = {}) => {
  const antes = conf.registro.length;
  await abrirConexoes(page, projetoId); await page.click('#conexao-nova');
  await page.selectOption('#conexao-servico', servico); await page.evaluate(() => { document.querySelector('#github-token-avancado').open = true; });
  if (servico === 'github') await page.fill('#conexao-nome', nome);
  if (extras.instancia) { await page.evaluate(() => { document.querySelector('#jira-dados').open = true; }); await page.fill('#conexao-instancia', extras.instancia); await page.fill('#conexao-usuario', extras.usuario); }
  await page.fill('#conexao-token', 'fixture-secret-conexoes'); await page.click(servico === 'github' ? '#github-token-salvar' : '#conexao-salvar');
  await conf.aguardar(antes + 1); // salvar a conta pede confirmação e recarrega Projetos (o painel fecha)
  await abrirConexoes(page, projetoId); await page.locator('[data-conta]', { hasText: nome }).waitFor(); // 2.15: a conta é uma linha sob o serviço, não um cartão
};

test('GitHub conectado no projeto lista os repositórios, vincula e aparece em Testes', { timeout: 120000 }, async (t) => {
  const { s, a, conf } = await preparar(t);
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Repos Lab', descricao: 'sintético' }))).data;
  await usarProjeto(a.page, e.id);
  await a.page.locator(`[data-espaco="${e.id}"] [data-servico="github"] .ds-proj-porta`).click();
  await a.page.getByText('Nenhuma conta do GitHub conectada').waitFor();
  await conectar(a.page, conf, e.id, 'github', 'GitHub simulado');
  await a.page.getByRole('button', { name: 'Fechar painel e voltar à bancada' }).click();
  await a.page.locator(`[data-espaco="${e.id}"] [data-servico="github"] .ds-proj-porta`).click();
  const painel = a.page.locator(`[data-espaco="${e.id}"] .repos-github`);
  await painel.getByText('empresa/automacao-smart').waitFor();
  await painel.getByText('empresa/automacao-cid').waitFor();
  await painel.locator('li', { hasText: 'empresa/automacao-smart' }).getByRole('button', { name: 'Escolher este' }).click();
  await a.page.waitForFunction(id => document.querySelector(`[data-espaco="${id}"] .ds-proj-modulo[data-servico="github"]`)?.dataset.vinculado === 'sim', e.id);
  await usarProjeto(a.page, e.id);
  await a.page.waitForFunction(() => /Repos Lab/.test(document.querySelector('#projeto-atual')?.textContent || ''));
  // 2.20: a IDE abre o repositório do GitHub em leitura e oferece trazer uma cópia para editar.
  await ir(a.page, 'testes'); await a.page.click('[data-sub=ide]');
  await a.page.getByRole('button', { name: 'Trazer o repositório do GitHub', exact: true }).waitFor();
  assert.match(await a.page.textContent('#conteudo'), /Repositório do GitHub em leitura/);
  assert.ok(s.pedidos.every((p) => p.metodo === 'GET'), 'só leituras no GitHub');
  assert.deepEqual(a.erros, []);
});

test('Jira conectado ao projeto aparece em Tickets', { timeout: 120000 }, async (t) => {
  const { a, conf } = await preparar(t);
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'SMART-LAB', descricao: 'sintético' }))).data;
  await conectar(a.page, conf, e.id, 'jira', 'Jira · lab', { instancia: 'https://lab.atlassian.net', usuario: 'fixture@example.test' });
  const conta = (await a.page.evaluate(() => window.prumo.servicos())).data.find((c) => c.servico === 'jira');
  const recursos = (await a.page.evaluate((id) => window.prumo.servicoRecursos(id), conta.id)).data.recursos;
  assert.equal((await a.page.evaluate(([x, y, z]) => window.prumo.servicoVincular(x, y, z), [e.id, conta.id, recursos[0]])).ok, true);
  await usarProjeto(a.page, e.id);
  await a.page.waitForFunction(() => /SMART-LAB/.test(document.querySelector('#projeto-atual')?.textContent || ''));
  await ir(a.page, 'tickets');
  await a.page.locator('#tk-lista').getByText('SMART-1').first().waitFor();
  assert.deepEqual(a.erros, []);
});
