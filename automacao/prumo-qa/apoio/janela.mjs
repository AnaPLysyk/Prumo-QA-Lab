import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { caixaDeEmail, emailDa } from './caixa-de-email.mjs';

/**
 * Apoio comum aos testes da janela (Playwright sobre o Electron real). Não é um teste.
 * Por padrão abre o aplicativo em desenvolvimento; com PRUMO_APP_EXE usa o executável instalado.
 */
export const repo = path.resolve('.');
export const versao = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
export const exe = process.env.PRUMO_APP_EXE;
export const abas = ['inicio', 'projetos', 'contextos', 'tickets', 'testes', 'automacoes', 'runs', 'vinculos', 'agenda', 'metricas', 'logs', 'evidencias', 'conexoes', 'agentes', 'suporte', 'ajuda', 'administracao'];

// Cada teste tem seu diretório de dados; ao final os aplicativos abertos são fechados ANTES de apagá-lo.
const abertos = new Map();
export const novoDados = (t) => {
  // macOS pode expor /var como link para /private/var; a fixture usa o caminho físico, sem relaxar a proteção do produto.
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prumo dados desktop '))); abertos.set(d, []);
  t.after(async () => { for (const fechar of abertos.get(d)) await fechar().catch(() => {}); abertos.delete(d); fs.rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });
  return d;
};
/**
 * Conta de teste: o Prumo não abre sem entrar, então abrir() cria (ou usa) esta conta de Administrador. Use { semLogin: true } para testar a própria entrada.
 * O login nasce da parte do e-mail antes do @ (admin-teste); a pessoa entra com o e-mail ou com o login.
 */
export const CONTA_DE_TESTE = { email: 'admin-teste@prumo.test', login: 'admin-teste', nome: 'Admin Teste', senha: 'Senha-de-teste-2026' };
/** Local de dados usado pelo aplicativo depois de autenticar a conta de teste. */
export async function dadosDaConta(page, dados) {
  const resposta = await page.evaluate(() => window.prumo.contaSessao());
  if (!resposta?.ok || !resposta.data?.usuario?.id) throw new Error('TEST_ACCOUNT_SESSION_REQUIRED');
  return path.join(dados, 'usuarios', resposta.data.usuario.id);
}
/** Primeiro acesso pela tela, como a pessoa faria: nome, e-mail e senha, o código que chega na caixa de e-mail e pronto, já dentro. */
export async function primeiroAcesso(page, conta = CONTA_DE_TESTE) {
  const caixa = await caixaDeEmail(); const email = emailDa(conta);
  await page.waitForSelector('#entrada[open]');
  if (!(await page.locator('#primeiro-nome').count())) await page.click('#entrada-ir-cadastro');
  await page.waitForSelector('#primeiro-nome');
  await page.fill('#primeiro-nome', conta.nome); await page.fill('#primeiro-email', email); await page.fill('#primeiro-senha', conta.senha); await page.fill('#primeiro-confirma', conta.senha);
  await page.click('#entrada-enviar'); await page.waitForSelector('#confirmar-codigo');
  await page.fill('#confirmar-codigo', caixa.ultimoCodigo(email));
  await Promise.all([page.waitForEvent('load'), page.click('#entrada-enviar')]); await page.waitForSelector('#conta-botao');
}
/** Cria a primeira conta pelos canais, sem a tela (o código vem da caixa de e-mail dos testes). */
export async function ativarPelaApi(page, conta = CONTA_DE_TESTE) {
  const caixa = await caixaDeEmail(); const email = emailDa(conta);
  const pedido = await page.evaluate((e) => window.prumo.contaCodigo(e, 'CADASTRO'), email); if (!pedido.ok) return pedido;
  return page.evaluate(([e, n, s, c]) => window.prumo.usuariosAtivar(e, n, s, c), [email, conta.nome, conta.senha, caixa.ultimoCodigo(email)]);
}
export async function abrir(t, dados, extra = [], envExtra = {}, opcoes = {}) {
  // VS Code/Claude definem ELECTRON_RUN_AS_NODE; com ele o Electron viraria Node puro e não abriria janela.
  // O envio de e-mail vai sempre para a caixa local dos testes, nunca para o serviço real.
  const env = { ...process.env, PRUMO_SEM_AVISO_AUTOMATICO: '1', PRUMO_SERVICO: (await caixaDeEmail()).url, PRUMO_DATA_DIR: dados, ...envExtra }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: exe ?? electronPath, args: exe ? extra : [path.join(repo, 'testes/apoio/desktop-entry.cjs'), ...extra], env });
  let fechado = false;
  const fechar = async () => { if (!fechado) { fechado = true; await app.close(); } };
  abertos.get(dados).push(fechar);
  const page = await app.firstWindow();
  const erros = []; page.on('pageerror', (e) => erros.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.waitForSelector('#nav button', { state: 'attached' });
  if (opcoes.semLogin) { await page.waitForSelector('dialog#entrada[open]'); return { app, page, erros, fechar }; }
  // O Prumo abre na entrada (primeiro acesso ou login). Os testes partem da janela já dentro, com a conta de teste.
  await page.waitForFunction(() => document.querySelector('dialog#entrada[open]') || document.querySelector('[data-aba=inicio][aria-current=page]'));
  if (await page.locator('dialog#entrada[open]').count()) {
    const ativo = (await page.evaluate(() => window.prumo.contaSessao())).data.loginAtivo; const c = CONTA_DE_TESTE;
    const r = ativo ? await page.evaluate(([l, s]) => window.prumo.contaEntrar(l, s), [c.login, c.senha]) : await ativarPelaApi(page, c);
    if (!r.ok) throw new Error('A conta de teste não entrou: ' + JSON.stringify(r.error));
    await page.reload();
  }
  // Espera a primeira tela: antes disso os listeners do menu ainda não existem e um clique se perde (corrida da 2.9/v39).
  try { await page.waitForSelector('[data-aba=inicio][aria-current=page]'); }
  catch (erro) {
    const vista = await page.evaluate(() => ({ entrada: document.querySelector('#entrada-titulo')?.textContent, aviso: document.querySelector('#aviso')?.textContent })).catch(() => ({}));
    throw new Error('A janela não iniciou: ' + JSON.stringify({ erros, vista }), { cause: erro });
  }
  // A janela abre em Início (2.8). Os testes anteriores partem de Projetos; Início tem teste próprio (desktop-agenda.test.mjs).
  if (!opcoes.inicio) await ir(page, 'projetos');
  return { app, page, erros, fechar };
}
const virtuais = { runs: ['testes', 'runs'], execucoes: ['testes', 'runs'], automacoes: ['testes', 'pipelines'], vinculos: ['testes', 'repositorio'], rastreabilidade: ['testes', 'repositorio'] };
export const ir = async (page, aba) => {
  // Detalhes abrem em modal (v39/v40): fecha-o como a pessoa faria antes de usar o menu.
  if (await page.locator('#qualidade-dialog[open]').count()) { await page.keyboard.press('Escape'); await page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' }); }
  // v40: Contextos fica dentro de Agentes (modal), como Evidências fica dentro de Execuções.
  if (aba === 'contextos') { await ir(page, 'agentes'); await page.click('#agentes-contextos'); await page.waitForSelector('#qualidade-dialog[open] .ds-contextos > :not(.ds-estado)'); return; }
  if (aba === 'evidencias') { await ir(page, 'execucoes'); await page.click('#exec-evidencias'); await page.waitForSelector('#qualidade-dialog[open]'); return; }
  if (virtuais[aba]) { const [pai, sub] = virtuais[aba]; await ir(page, pai); if (sub === 'pipelines') { await page.click('[data-sub=ide]'); await page.click('[data-ide-modo=pipelines]'); await page.waitForFunction(() => document.querySelector('[data-ide-modo=pipelines]')?.getAttribute('aria-pressed') === 'true'); await page.waitForTimeout(150); return; } await page.click(`[data-sub=${sub}]`); await page.waitForFunction((s) => document.querySelector(`[data-sub=${s}]`)?.getAttribute('aria-pressed') === 'true', sub); await page.waitForTimeout(150); return; } await page.click(`[data-aba=${aba}]`); await page.waitForFunction((a) => document.querySelector(`[data-aba=${a}]`)?.getAttribute('aria-current') === 'page', aba); await page.waitForTimeout(150); };
export const escolherPasta = (app, pasta) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, pasta);
export async function mcp(root, dados, chamadas) {
  const client = new Client({ name: 'codex-desktop-test', version: '1.0.0' });
  // Instalado: o servidor roda no runtime embutido do aplicativo (sem Node.js na máquina), como configura src/conexoes.ts.
  const transport = exe
    ? new StdioClientTransport({ command: exe, args: [path.join(path.dirname(exe), 'resources', 'app', 'dist', 'mcp.js'), root], env: { ...(dados ? { PRUMO_DATA_DIR: dados } : {}), ELECTRON_RUN_AS_NODE: '1' } })
    : new StdioClientTransport({ command: process.execPath, args: ['--require', path.join(repo, 'testes/apoio/conhecimento-hook.cjs'), path.join(repo, 'dist/mcp.js'), root], env: dados ? { PRUMO_DATA_DIR: dados } : {} });
  try {
    await client.connect(transport);
    const out = []; for (const [name, args] of chamadas) out.push(await client.callTool({ name, arguments: args }));
    return out;
  } finally {
    // Um handshake recusado também precisa encerrar o subprocesso MCP, sem deixar processo pendurado no teste.
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

/** Abre o popover de ajustes (tema, idioma, cor) se ainda não estiver aberto. */
export const ajustes = async (page) => {
  if (!(await page.isVisible('#controles'))) await page.click('#ajustes');
  // 2.13: as Configurações têm abas (Meu perfil, Aparência, Assistente); tema e idioma ficam em Aparência.
  if (!(await page.isVisible('#tema'))) await page.click('[data-ajustes-aba=aparencia]');
  await page.waitForSelector('#tema', { state: 'visible' });
};
