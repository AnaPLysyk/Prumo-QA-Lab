import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, primeiroAcesso, CONTA_DE_TESTE } from '../../../apoio/janela.mjs';

// O Prumo abre direto na tela de entrada e não deixa usar nada sem entrar: primeiro acesso numa instalação nova, login nas seguintes.
const recusado = (r, codigo) => { assert.equal(r.ok, false); assert.match(String(r.error), new RegExp('^' + codigo)); };

test('instalação nova: abre no primeiro acesso, nada responde e nenhuma tela aparece até criar a conta de Administrador', { timeout: 120000 }, async (t) => {
  const a = await abrir(t, novoDados(t), [], {}, { semLogin: true }); const p = a.page;
  assert.equal(await p.locator('dialog#entrada[open]').count(), 1); await p.waitForSelector('#entrada-login');
  assert.equal(await p.locator('#primeiro-nome').count(), 0, 'abre em Entrar, não direto no cadastro'); assert.equal(await p.locator('#entrada-ir-recuperar').count(), 1, 'Esqueci a senha sempre aparece na entrada (2.17)');
  await p.fill('#entrada-login', 'alguem'); await p.fill('#entrada-senha', 'qualquer-senha-123'); await p.click('#entrada-enviar'); await p.waitForSelector('#entrada-erro:not([hidden])'); assert.match(await p.textContent('#entrada-erro'), /não existe conta/i);
  // OAuth não configurado não pede segredos técnicos no cadastro: pertence à Administração.
  assert.equal(await p.locator('#entrada-github, #entrada-google, #provedor-id, #provedor-segredo').count(), 0);
  assert.equal(await p.locator('#entrada-idioma').count(), 1); assert.equal(await p.locator('#entrada-site').count(), 1);
  assert.equal((await p.evaluate(() => window.prumo.contaSessao())).data.entradaGithub, false);
  await p.selectOption('#entrada-idioma', 'en'); await p.waitForFunction(() => document.querySelector('#entrada-titulo')?.textContent === 'Sign in'); assert.equal(await p.locator('#entrada-github').count(), 0);
  await p.selectOption('#entrada-idioma', 'pt-BR'); await p.waitForFunction(() => document.querySelector('#entrada-titulo')?.textContent === 'Entrar');
  await p.click('#entrada-ir-cadastro'); await p.waitForSelector('#primeiro-nome'); await p.click('#entrada-voltar'); await p.waitForSelector('#entrada-login'); await p.click('#entrada-ir-cadastro'); await p.waitForSelector('#primeiro-nome');
  assert.equal(await p.isVisible('#nav'), false, 'o menu fica escondido atrás da entrada'); assert.equal(await p.locator('#entrada-fechar').count(), 0);
  await p.keyboard.press('Escape'); assert.equal(await p.locator('dialog#entrada[open]').count(), 1, 'Esc não fecha a entrada');
  const canais = await p.evaluate(async () => [await window.prumo.espacos(), await window.prumo.servicos(), await window.prumo.usuariosListar(), await window.prumo.papeisListar(), await window.prumo.acessoConfiguracao(), await window.prumo.workerEstado()].map((r) => ({ ok: r.ok, error: String(r.error ?? '') })));
  for (const r of canais) { assert.equal(r.ok, false); assert.match(r.error, /^LOGIN_SETUP_REQUIRED/); }
  const sessao = (await p.evaluate(() => window.prumo.contaSessao())).data; assert.equal(sessao.loginAtivo, false); assert.ok(Object.values(sessao.telas).every((n) => n === 'NENHUM'));
  await primeiroAcesso(p); assert.equal(await p.locator('dialog#entrada[open]').count(), 0); assert.ok((await p.evaluate(() => window.prumo.espacos())).ok);
  assert.deepEqual(a.erros.filter((e) => !/LOGIN_SETUP_REQUIRED/.test(e)), []);
});

test('instalação com conta: abre direto no login, recusa sem sessão e só entra com a senha certa', { timeout: 120000 }, async (t) => {
  const dados = novoDados(t);
  const primeira = await abrir(t, dados, [], {}, { semLogin: true }); await primeiroAcesso(primeira.page); await primeira.fechar();
  const a = await abrir(t, dados, [], {}, { semLogin: true }); const p = a.page;
  await p.waitForSelector('#entrada[open] #entrada-login'); assert.equal(await p.locator('#primeiro-nome').count(), 0, 'já existe conta: não oferece criar outra do zero');
  recusado(await p.evaluate(() => window.prumo.espacos()), 'SESSION_REQUIRED');
  await p.fill('#entrada-login', CONTA_DE_TESTE.login); await p.fill('#entrada-senha', 'senha-errada-123'); await p.click('#entrada-enviar');
  await p.waitForSelector('#entrada-erro:not([hidden])'); assert.equal(await p.locator('dialog#entrada[open]').count(), 1);
  await p.fill('#entrada-senha', CONTA_DE_TESTE.senha); await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]);
  await p.waitForSelector('#conta-botao'); assert.equal(await p.locator('dialog#entrada[open]').count(), 0); assert.ok((await p.evaluate(() => window.prumo.espacos())).ok);
});
