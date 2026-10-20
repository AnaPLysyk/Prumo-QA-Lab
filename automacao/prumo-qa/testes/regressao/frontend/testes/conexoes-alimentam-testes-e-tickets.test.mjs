import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir, escolherPasta } from '../../../apoio/janela.mjs';
import { servidorFixture } from '../../../apoio/servicos-fixtures.mjs';
import { fixture } from '../../../apoio/fixtures.mjs';

// Qase conectado alimenta Testes (Repositório, Runs e Planos) e Jira alimenta Tickets; sem as conexões as duas abas seguem usáveis com
// dados locais. Janela real; perfil e serviços sintéticos (servidor local no lugar do Qase e do Jira).
async function preparar(t) {
  const s = await servidorFixture(t), a = await abrir(t, novoDados(t));
  await a.app.evaluate((_, port) => {
    const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http');
    process.getBuiltinModule('node:dns').promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
    https.request = (url, opts, cb) => http.request({ hostname: '127.0.0.1', port, path: url.pathname + url.search, method: opts.method, headers: { ...opts.headers, 'x-fixture-host': url.hostname } }, cb);
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
  }, s.port);
  await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  const selecionar = async (e) => { await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click(); await a.page.waitForFunction((n) => document.querySelector('#projeto-atual')?.textContent === n, e.nome); };
  return { s, a, selecionar };
}
const criar = async (page, nome) => (await page.evaluate((n) => window.prumo.espacoCriar({ nome: n, descricao: 'sintético' }), nome)).data;
const sub = async (page, k) => { await ir(page, 'testes'); await page.click(`[data-sub=${k}]`); await page.locator(`[data-sub=${k}][aria-pressed=true], [data-sub=${k}].ativo, [data-sub=${k}][aria-selected=true]`).first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => {}); };
async function conectar(page, e, servico, extras) {
  const c = (await page.evaluate((d) => window.prumo.servicoAdicionar(d), { servico, nome: servico + ' simulado', token: 'fixture-secret-abas', ...extras })).data;
  const r = (await page.evaluate((id) => window.prumo.servicoRecursos(id), c.id)).data.recursos[0];
  assert.equal((await page.evaluate(([x, y, z]) => window.prumo.servicoVincular(x, y, z), [e.id, c.id, r])).ok, true);
}

test('Qase conectado: casos e suites vão para Testes › Repositório, runs para Runs e planos para Planos', { timeout: 120000 }, async (t) => {
  const { a, selecionar } = await preparar(t); const e = await criar(a.page, 'Qase Lab');
  await conectar(a.page, e, 'qase'); await selecionar(e);
  await sub(a.page, 'repositorio'); await a.page.getByText('Caso fictício SFQ').first().waitFor(); await a.page.getByText('Suite SFQ').first().waitFor();
  await sub(a.page, 'runs'); await a.page.getByText('Run fictício SFQ').first().waitFor();
  await sub(a.page, 'planos'); await a.page.getByText('Plano SFQ').first().waitFor();
  assert.deepEqual(a.erros, []);
});

test('Jira conectado: tickets vão para a aba Tickets', { timeout: 120000 }, async (t) => {
  const { a, selecionar } = await preparar(t); const e = await criar(a.page, 'Jira Lab');
  await conectar(a.page, e, 'jira', { instancia: 'https://lab.atlassian.net', usuario: 'fixture@example.test' }); await selecionar(e);
  await ir(a.page, 'tickets'); await a.page.locator('#tk-lista').getByText('SMART-1').first().waitFor();
  assert.deepEqual(a.erros, []);
});

test('sem Qase: Testes funciona com dados locais (proposta de caso, plano e run), sem erro nem estado de falha', { timeout: 120000 }, async (t) => {
  const { a, selecionar } = await preparar(t); const e = await criar(a.page, 'Sem Qase'); await selecionar(e);
  await sub(a.page, 'repositorio'); await a.page.locator('#pr-nova').waitFor();
  await sub(a.page, 'planos'); await a.page.locator('#plano-novo').waitFor();
  await sub(a.page, 'runs'); await a.page.locator('#runs-area').waitFor();
  assert.equal(await a.page.locator('[data-estado=erro], .ds-estado-erro').count(), 0);
  assert.deepEqual(a.erros, []);
});

// Sem Qase a run usa os testes do código da pasta vinculada (ids locais) e fica só neste computador.
test('sem Qase: prepara uma run com testes do código, declara resultado manual e o Qase recusa casos locais', { timeout: 120000 }, async (t) => {
  const { a, selecionar } = await preparar(t); const e = await criar(a.page, 'Sem Qase run'); const f = await fixture(t);
  await f.write('tests/login.spec.ts', "describe('Login', () => {\n  test('entra como editor', () => {});\n});\n");
  await escolherPasta(a.app, f.root); assert.equal((await a.page.evaluate((id) => window.prumo.espacoPasta(id), e.id)).ok, true); await selecionar(e);
  await sub(a.page, 'runs'); await a.page.locator('#run-nova').click();
  await a.page.locator('#run-titulo').fill('Rodada local'); await a.page.locator('#run-casos label', { hasText: 'entra como editor' }).locator('input').check();
  await a.page.locator('#run-preparar').click(); await a.page.getByText('Rodada local').first().waitFor();
  const run = (await a.page.evaluate((id) => window.prumo.runs(id), e.id)).data[0];
  assert.equal(run.casos.length, 1); assert.ok(run.casos[0].casoId >= 1e9, 'id local, fora da faixa do Qase');
  assert.equal((await a.page.evaluate(([id, c]) => window.prumo.runResultado(id, c, 'FAIL', 'falhou à mão'), [run.id, run.casos[0].casoId])).ok, true);
  const criar2 = await a.page.evaluate((id) => window.prumo.runCriar(id), run.id); assert.equal(criar2.ok, false);
  assert.deepEqual(a.erros, []);
});
