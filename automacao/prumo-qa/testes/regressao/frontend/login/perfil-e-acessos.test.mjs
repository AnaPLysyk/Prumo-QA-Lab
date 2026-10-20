// Visão completa do acesso na janela real, sempre com os dois perfis: Administrador e usuário comum (Analista de QA).
// Cobre "Minha conta" (nome e senha), o menu de cada um e o que cada um não pode fazer. Dados sintéticos, sem serviço externo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { primeiroAcesso, abrir, novoDados, ir } from '../../../apoio/janela.mjs';

const capturas = path.join('tmp', 'evidencias', 'telas');
const capturar = (page, nome) => { fs.mkdirSync(capturas, { recursive: true }); return page.screenshot({ path: path.join(capturas, nome + '.png') }); };
const recarregou = (page) => page.waitForFunction(() => document.readyState === 'complete' && (document.querySelector('#entrada[open]') || document.querySelector('[data-aba=inicio][aria-current=page], #tela-sem-acesso, #conteudo > *')));
const SENHA_ADMIN = 'Prumo-admin-2026'; const SENHA_ADMIN_NOVA = 'Prumo-admin-2027'; const SENHA_QA = 'Analista-firme-26';

async function sair(p) { await p.click('#conta-botao'); await Promise.all([p.waitForEvent('load'), p.click('#conta-sair')]); await recarregou(p); await p.waitForSelector('#entrada[open] #entrada-login'); }
async function entrar(p, login, senha) { await p.fill('#entrada-login', login); await p.fill('#entrada-senha', senha); await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]); await recarregou(p); await p.waitForSelector('#conta-botao'); }

test('Minha conta: primeiro acesso sem nada liberado, como Administrador e como usuário comum', async (t) => {
  const dados = novoDados(t); const a = await abrir(t, dados, [], {}, { semLogin: true }); const p = a.page;
  await p.emulateMedia({ reducedMotion: 'reduce' });

  // 1. Primeiro acesso: o Prumo não abre sem conta; nada responde até criar o Administrador.
  await p.waitForSelector('#entrada[open] #entrada-login');
  assert.match(String((await p.evaluate(() => window.prumo.espacos())).error), /^LOGIN_SETUP_REQUIRED/);
  await capturar(p, 'perfil-primeiro-acesso');

  // 2. Administrador: cria a conta e já entra, vê tudo, troca o nome e a senha em Minha conta.
  await primeiroAcesso(p, { nome: 'Ana Admin', login: 'ana.admin', senha: SENHA_ADMIN });
  assert.match(await p.textContent('#conta-botao'), /Ana Admin/);
  for (const aba of ['administracao', 'testes', 'conexoes', 'agentes', 'projetos']) assert.equal(await p.isVisible(`[data-aba=${aba}]`), true, 'Administrador vê ' + aba);
  await capturar(p, 'perfil-administrador-menu');
  await p.click('#conta-botao'); await p.click('#conta-minha'); await p.locator('#qualidade-dialog[open]').waitFor();
  assert.match(await p.textContent('#qualidade-dialog'), /ana\.admin/); assert.match(await p.textContent('#qualidade-dialog'), /Administrador/);
  await p.fill('#minha-nome', 'Ana Lysyk'); await p.click('#minha-salvar-nome');
  await p.waitForFunction(() => /Ana Lysyk/.test(document.querySelector('#conta-botao')?.textContent || ''));
  await capturar(p, 'perfil-administrador-minha-conta');
  await p.fill('#minha-atual', SENHA_ADMIN); await p.fill('#minha-nova', SENHA_ADMIN_NOVA); await p.fill('#minha-confirma', SENHA_ADMIN_NOVA);
  await p.click('#minha-trocar-senha'); await p.waitForFunction(() => /Senha trocada/.test(document.querySelector('#aviso')?.textContent || ''));
  await p.keyboard.press('Escape'); await sair(p); await p.fill('#entrada-login', 'ana.admin'); await p.fill('#entrada-senha', SENHA_ADMIN); await p.click('#entrada-enviar');
  await p.waitForSelector('#entrada-erro:not([hidden])'); assert.match(await p.textContent('#entrada-erro'), /incorretos/i, 'a senha antiga deixou de valer');
  await entrar(p, 'ana.admin', SENHA_ADMIN_NOVA);

  // 3. Administrador cria o usuário comum (Analista de QA) com senha temporária.
  await ir(p, 'administracao'); await p.waitForSelector('#adm-usuarios');
  await p.click('#adm-nova-conta'); await p.fill('#nova-nome', 'Carla QA'); await p.fill('#nova-login', 'carla'); await p.selectOption('#nova-papel', 'qa');
  await p.click('#nova-criar'); await p.waitForSelector('#adm-segredo');
  const temporaria = (await p.textContent('#adm-segredo')).trim(); await p.click('#adm-segredo-fechar'); await p.waitForSelector('[data-conta=carla]');
  await sair(p);

  // 4. Usuário comum: primeiro acesso troca a senha; não vê Administração; Minha conta funciona; o backend recusa o que não é dela.
  await p.fill('#entrada-login', 'carla'); await p.fill('#entrada-senha', temporaria); await p.click('#entrada-enviar'); await p.waitForSelector('#trocar-atual');
  await p.fill('#trocar-atual', temporaria); await p.fill('#trocar-nova', SENHA_QA); await p.fill('#trocar-confirma', SENHA_QA);
  await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]); await recarregou(p); await p.waitForSelector('#conta-botao');
  assert.match(await p.textContent('#conta-botao'), /Carla QA/);
  assert.equal(await p.isHidden('[data-aba=administracao]'), true, 'usuário comum não vê Administração');
  for (const aba of ['testes', 'tickets', 'projetos', 'agentes']) assert.equal(await p.isVisible(`[data-aba=${aba}]`), true, 'usuário comum vê ' + aba);
  await capturar(p, 'perfil-usuario-comum-menu');
  await p.click('#conta-botao'); await p.click('#conta-minha'); await p.locator('#qualidade-dialog[open]').waitFor();
  assert.match(await p.textContent('#qualidade-dialog'), /carla/); assert.match(await p.textContent('#qualidade-dialog'), /Analista de QA/);
  await p.fill('#minha-nome', 'Carla Souza'); await p.click('#minha-salvar-nome');
  await p.waitForFunction(() => /Carla Souza/.test(document.querySelector('#conta-botao')?.textContent || ''));
  await capturar(p, 'perfil-usuario-comum-minha-conta');
  await p.keyboard.press('Escape');
  const recusa = await p.evaluate(async () => (await window.prumo.usuariosListar()).error);
  assert.match(recusa, /^PERMISSION_DENIED: a tela Administração é só para contas marcadas como admin/);
  await p.evaluate(() => { void mostrar('administracao'); }); await p.waitForSelector('#tela-sem-acesso');
  assert.deepEqual(a.erros, []);
});
