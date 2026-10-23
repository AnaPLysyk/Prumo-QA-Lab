import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { caixaDeEmail, emailDa } from '../../unitario/infra/caixa-de-email.mjs';

/**
 * Apoio comum aos testes da janela (Playwright sobre o Electron real). Não é um teste.
 * Por padrão abre o aplicativo em desenvolvimento; com PRUMO_APP_EXE usa o executável instalado.
 */
export const repo = path.resolve('.');
export const versao = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
export const exe = process.env.PRUMO_APP_EXE;
export const abas = ['inicio', 'projetos', 'contextos', 'tickets', 'testes', 'automacoes', 'runs', 'vinculos', 'agenda', 'metricas', 'logs', 'evidencias', 'agentes', 'suporte', 'ajuda', 'administracao'];

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
  const app = await electron.launch({ executablePath: exe ?? electronPath, args: exe ? extra : [path.join(repo, 'site/scripts/desktop-entry.cjs'), ...extra], env });
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
  // 2.20: o botão Evidências CLI/MCP saiu de Runs; a aba segue acessível pelo mesmo caminho interno que os Logs usam.
  if (aba === 'evidencias') { await ir(page, 'execucoes'); await page.evaluate(() => { estado.jobId = undefined; return mostrar('evidencias'); }); await page.waitForSelector('#qualidade-dialog[open]'); return; }
  if (virtuais[aba]) { const [pai, sub] = virtuais[aba]; await ir(page, pai); if (sub === 'pipelines') { await page.click('[data-sub=ide]'); await page.click('[data-ide-modo=pipelines]'); await page.waitForFunction(() => document.querySelector('[data-ide-modo=pipelines]')?.getAttribute('aria-pressed') === 'true'); await page.waitForTimeout(150); return; } await page.click(`[data-sub=${sub}]`); await page.waitForFunction((s) => document.querySelector(`[data-sub=${s}]`)?.getAttribute('aria-pressed') === 'true', sub); await page.waitForTimeout(150); return; } await page.click(`[data-aba=${aba}]`); await page.waitForFunction((a) => document.querySelector(`[data-aba=${a}]`)?.getAttribute('aria-current') === 'page', aba); await page.waitForTimeout(150); };
/** Troca o projeto pelo seletor do menu, inclusive quando a seção está recolhida. */
export async function usarProjeto(page, id) {
  await ir(page, 'projetos');
  if (await page.locator('#nav [data-aba="projetos"]').getAttribute('data-projeto') === id) return;
  if (await page.getAttribute('#projeto-botao', 'aria-expanded') !== 'true') await page.click('#projeto-botao');
  await page.locator(`#projeto-lista [data-seletor-item="projeto"][data-projeto="${id}"]`).click();
  await page.waitForFunction(id => document.querySelector('#nav [data-aba="projetos"]')?.dataset.projeto === id, id);
}
/** Abre as contas e permissões do projeto na própria tela Projetos (a antiga aba Conexões não existe).
 * 2.19.0: uma bancada por vez; o rodapé dela tem "Contas e permissões", que abre o painel sobre a bancada. */
export async function abrirConexoes(page, projetoId) {
  await usarProjeto(page, projetoId);
  await page.locator(`[data-espaco="${projetoId}"]`).waitFor();
  await page.locator('.ds-proj-workspace-rodape').getByRole('button', { name: 'Contas e permissões', exact: true }).click();
  const painel = page.locator('#projeto-painel:not([hidden])');
  await painel.locator('#cx-servicos').waitFor({ timeout: 15000 });
  return painel;
}

export const escolherPasta = (app, pasta) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, pasta);
/** 2.19.0: não há mais "Vincular pasta…" solto; a pasta entra por um projeto do Prumo. Sem projeto, cria um projeto manual;
 * depois usa a bolha Pasta local da bancada › Escolher pasta, como a pessoa faria (o diálogo nativo é o de escolherPasta).
 * Não espera o resultado: quem chama confere o vínculo, o aviso ou a confirmação que o seu caso exige. */
export async function vincularPasta(app, page, pasta, nome = 'Projeto do teste') {
  await escolherPasta(app, pasta);
  await ir(page, 'projetos');
  if (await page.locator('#projetos-vazio').count()) {
    await page.click('#espaco-novo'); await page.fill('#espaco-nome', nome); await page.click('#espaco-salvar');
    await page.waitForFunction(n => document.querySelector('#projeto-atual')?.textContent === n, nome);
    const fechar = page.getByRole('button', { name: 'Fechar painel e voltar à bancada' });
    if (await fechar.isVisible()) await fechar.click();
  }
  await page.locator('.ds-proj-modulo[data-servico="local"] .ds-proj-modulo-emblema').click();
  await page.locator('#projeto-painel:not([hidden])').getByRole('button', { name: 'Escolher pasta', exact: true }).click();
}
/** Espera o projeto atual ficar com a pasta indicada (comparação sem diferenciar maiúsculas, como no Windows). */
/** Raiz do projeto selecionado (a de contextos do Prumo): é nela que o MCP, os Logs, as Métricas e a Privacidade trabalham. */
export const raizDoProjetoAtual = (page) => page.evaluate(() => window.prumo.espacos().then((r) => {
  const nome = document.querySelector('#projeto-atual')?.textContent;
  return (r.data.find((e) => e.nome === nome) || r.data[0])?.raizContextos ?? null;
}));
// Consulta de verdade: waitForFunction com função que devolve Promise não espera (a Promise já conta como verdadeira).
export async function esperarPastaVinculada(page, pasta, ms = 15000) {
  const fim = Date.now() + ms;
  for (;;) {
    const ok = await page.evaluate((p) => window.prumo.espacos().then((r) => r.ok && r.data.some((e) => String(e.pastaLocal || '').toLowerCase() === p.toLowerCase())), pasta);
    if (ok) return;
    if (Date.now() > fim) throw new Error('LAB_PASTA_NAO_VINCULADA: ' + pasta);
    await page.waitForTimeout(100);
  }
}
export async function mcp(root, dados, chamadas) {
  const client = new Client({ name: 'codex-desktop-test', version: '1.0.0' });
  // Instalado: o servidor roda no runtime embutido do aplicativo (sem Node.js na máquina), como configura src/conexoes.ts.
  const transport = exe
    ? new StdioClientTransport({ command: exe, args: [path.join(path.dirname(exe), 'resources', 'app', 'dist', 'mcp.js'), root], env: { ...(dados ? { PRUMO_DATA_DIR: dados } : {}), ELECTRON_RUN_AS_NODE: '1' } })
    : new StdioClientTransport({ command: process.execPath, args: ['--require', path.join(repo, 'testes/unitario/infra/conhecimento-hook.cjs'), path.join(repo, 'dist/mcp.js'), root], env: dados ? { PRUMO_DATA_DIR: dados } : {} });
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

/**
 * Atende as caixas de confirmação do aplicativo como a pessoa faria. Cada uma é outra página (caixa-de-confirmacao.html):
 * um WebContentsView sobre a janela (que o Playwright não lista como janela) ou uma janela solta com o app na bandeja.
 * Por isso a caixa é procurada entre os webContents do Electron. Ela só aceita resposta depois de um instante na tela
 * (400 ms, 700 ms se apaga algo); o botão de cancelar é o primeiro e o de confirmar, o último.
 * `decidir(info)` devolve 'confirmar' ou 'cancelar'. `registro` guarda título, mensagem e detalhe de cada pergunta, na ordem em que apareceram.
 */
export function atenderConfirmacoes(app, decidir = () => 'confirmar') {
  const registro = []; const vistos = new Set(); let ativo = true;
  const lerCaixa = (id) => app.evaluate(({ webContents }, alvo) => {
    const w = webContents.fromId(alvo);
    if (!w || w.isDestroyed()) return null;
    return w.executeJavaScript(`(() => { if (!document.querySelector('.cc-cartao:not([hidden])')) return null; return { titulo: document.querySelector('#cc-titulo')?.textContent || '', mensagem: document.querySelector('#cc-mensagem')?.textContent || '', detalhe: document.querySelector('#cc-detalhe')?.textContent || '', botoes: [...document.querySelectorAll('.cc-botoes button')].map((b) => b.textContent.trim()) }; })()`);
  }, id);
  const clicar = (id, cancelar) => app.evaluate(({ webContents }, { alvo, primeiro }) => {
    const w = webContents.fromId(alvo);
    if (!w || w.isDestroyed()) return false;
    return w.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.cc-botoes button')]; (${primeiro} ? b[0] : b[b.length - 1])?.click(); return true; })()`);
  }, { alvo: id, primeiro: cancelar });
  const ciclo = (async () => {
    while (ativo) {
      try {
        const ids = await app.evaluate(({ webContents }) => webContents.getAllWebContents().filter((w) => !w.isDestroyed() && /caixa-de-confirmacao/.test(w.getURL())).map((w) => w.id));
        for (const id of ids) {
          if (vistos.has(id)) continue;
          const info = await lerCaixa(id); if (!info) continue;
          vistos.add(id);
          const resposta = decidir(info) === 'cancelar' ? 'cancelar' : 'confirmar';
          registro.push({ ...info, resposta });
          await new Promise((r) => setTimeout(r, 900));
          await clicar(id, resposta === 'cancelar');
        }
      } catch { /* o app saiu ou a caixa fechou sozinha */ }
      await new Promise((r) => setTimeout(r, 150));
    }
  })();
  /** Espera a n-ésima pergunta aparecer, ser respondida e a página reagir (a caixa leva ~1 s entre aparecer e responder). */
  const aguardar = async (n, ms = 30000) => {
    for (let i = 0; i < ms / 100 && registro.length < n; i++) await new Promise((r) => setTimeout(r, 100));
    if (registro.length < n) throw new Error(`A confirmação ${n} não apareceu (vistas: ${registro.length}).`);
    await new Promise((r) => setTimeout(r, 1300));
  };
  return { registro, aguardar, parar: async () => { ativo = false; await ciclo; } };
}
