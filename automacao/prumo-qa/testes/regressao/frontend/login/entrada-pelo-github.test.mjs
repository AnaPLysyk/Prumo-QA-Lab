import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, ativarPelaApi, novoDados } from '../../../apoio/janela.mjs';

// Tela de entrada com o login ligado: o botão do GitHub só existe quando o OAuth App está configurado; ao clicar o Prumo abre a página de
// autorização do GitHub (o navegador é um double do runner: nada é aberto nem enviado) e Cancelar volta à entrada sem sessão nem conexão.
const ENV = { PRUMO_GITHUB_CLIENT_ID: 'Iv1.cliente-de-teste', PRUMO_GITHUB_CLIENT_SECRET: 'segredo-de-teste-xyz' };
async function comLoginLigado(t, env) {
  const a = await abrir(t, novoDados(t), [], env, { semLogin: true });
  assert.equal((await ativarPelaApi(a.page, { login: 'admin', nome: 'Admin Teste', senha: 'senha-forte-123' })).ok, true);
  await a.page.evaluate(() => window.prumo.contaSair()); await a.page.reload(); await a.page.waitForSelector('#entrada-login');
  return a;
}

test('sem OAuth App configurado a tela de entrada não mostra o botão do GitHub', { timeout: 120000 }, async (t) => {
  const a = await comLoginLigado(t, {});
  assert.equal(await a.page.locator('#entrada-github').count(), 0); await a.page.click('#entrada-ir-cadastro'); assert.equal(await a.page.locator('#entrada-github').count(), 0);
  assert.deepEqual(a.erros, []);
});

test('com o OAuth App configurado: botão em Entrar e em Criar conta, abre a autorização e Cancelar volta sem nada habilitado', { timeout: 120000 }, async (t) => {
  const a = await comLoginLigado(t, ENV);
  await a.app.evaluate(({ shell }) => { globalThis.__abertas = []; shell.openExternal = async (u) => { globalThis.__abertas.push(u); }; });
  await a.page.locator('#entrada-github').getByText('Entrar com o GitHub').waitFor();
  await a.page.click('#entrada-ir-cadastro'); await a.page.locator('#entrada-github').getByText('Cadastrar com o GitHub').waitFor(); await a.page.click('#entrada-voltar');
  await a.page.click('#entrada-github'); await a.page.locator('#entrada-github-espera').waitFor();
  const abertas = await a.app.evaluate(() => globalThis.__abertas); assert.equal(abertas.length, 1);
  const u = new URL(abertas[0]); assert.equal(u.origin + u.pathname, 'https://github.com/login/oauth/authorize'); assert.equal(u.searchParams.get('client_id'), ENV.PRUMO_GITHUB_CLIENT_ID); assert.equal(u.searchParams.get('code_challenge_method'), 'S256'); assert.doesNotMatch(abertas[0], /segredo-de-teste/);
  assert.match(u.searchParams.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  await a.page.click('#entrada-github-cancelar'); await a.page.waitForSelector('#entrada-login');
  const s = (await a.page.evaluate(() => window.prumo.contaSessao())).data; assert.equal(s.usuario, null, 'sem sessão'); assert.equal((await a.page.evaluate(() => window.prumo.servicos())).ok, false, 'sem sessão nenhum canal de trabalho atende');
  assert.deepEqual(a.erros, []);
});

test('primeiro acesso: sem nenhuma conta o Prumo não abre; Criar conta com o GitHub (na entrada e no primeiro acesso) abre a autorização e Cancelar volta ao primeiro acesso', { timeout: 120000 }, async (t) => {
  const a = await abrir(t, novoDados(t), [], ENV, { semLogin: true });
  await a.app.evaluate(({ shell }) => { globalThis.__abertas = []; shell.openExternal = async (u) => { globalThis.__abertas.push(u); }; });
  await a.page.waitForSelector('#entrada-login'); assert.equal(await a.page.textContent('#entrada-github'), 'Criar conta com o GitHub', 'sem contas o botão cria a primeira conta, não entra');
  await a.page.click('#entrada-github'); await a.page.locator('#entrada-github-espera').waitFor(); await a.page.click('#entrada-github-cancelar'); await a.page.waitForSelector('#primeiro-nome');
  await a.page.click('#entrada-voltar'); await a.page.waitForSelector('#entrada-login');
  await a.page.click('#entrada-ir-cadastro'); await a.page.waitForSelector('#primeiro-nome');
  await a.page.click('#entrada-github'); await a.page.locator('#entrada-github-espera').waitFor();
  const abertas = await a.app.evaluate(() => globalThis.__abertas); assert.equal(abertas.length, 2); for (const u of abertas) assert.match(u, /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  await a.page.click('#entrada-github-cancelar'); await a.page.waitForSelector('#primeiro-nome');
  const s = (await a.page.evaluate(() => window.prumo.contaSessao())).data; assert.equal(s.loginAtivo, false, 'nenhuma conta foi criada'); assert.equal(await a.page.locator('dialog#entrada[open]').count(), 1, 'a janela continua na entrada');
  assert.deepEqual(a.erros, []);
});

test('Google: o botão só aparece com o aplicativo do Google configurado, abre a autorização do Google e Cancelar volta sem sessão', { timeout: 120000 }, async (t) => {
  const a = await comLoginLigado(t, { PRUMO_GOOGLE_CLIENT_ID: 'cliente-google-de-teste.apps', PRUMO_GOOGLE_CLIENT_SECRET: 'segredo-google-de-teste' });
  await a.app.evaluate(({ shell }) => { globalThis.__abertas = []; shell.openExternal = async (u) => { globalThis.__abertas.push(u); }; });
  assert.equal(await a.page.locator('#entrada-github').count(), 0, 'só o provedor configurado aparece');
  await a.page.locator('#entrada-google').getByText('Entrar com o Google').waitFor();
  await a.page.click('#entrada-google'); await a.page.locator('#entrada-google-espera').waitFor();
  const abertas = await a.app.evaluate(() => globalThis.__abertas); assert.equal(abertas.length, 1); const u = new URL(abertas[0]);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth'); assert.equal(u.searchParams.get('client_id'), 'cliente-google-de-teste.apps'); assert.doesNotMatch(abertas[0], /segredo-google/);
  await a.page.click('#entrada-google-cancelar'); await a.page.waitForSelector('#entrada-login');
  assert.equal((await a.page.evaluate(() => window.prumo.contaSessao())).data.usuario, null);
  assert.deepEqual(a.erros, []);
});
