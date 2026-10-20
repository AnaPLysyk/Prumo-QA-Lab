import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fixture } from '../../../apoio/fixtures.mjs';

import { repo, versao, exe, abas, novoDados, abrir, ir, escolherPasta, mcp } from '../../../apoio/janela.mjs';


test('janela nativa abre com identidade, versão e as sete seções sem erros', async (t) => {
  const dados = novoDados(t);
  const { page, erros } = await abrir(t, dados);
  assert.equal(await page.title(), 'Prumo QA');
  assert.equal((await page.textContent('#versao')).trim(), 'v' + versao);
  assert.equal(await page.locator('#nav button').count(), abas.length - 4, 'Runs, vínculos e automações ficam em Testes; Contextos fica dentro de Agentes.');
  for (const aba of abas) { await ir(page, aba); assert.ok((await page.textContent('#conteudo h1')).length > 0, aba); }
  assert.deepEqual(erros, []);
});

test('segurança da janela: isolamento, sem Node na página, ponte mínima e sem rede', async (t) => {
  const dados = novoDados(t);
  const { app, page } = await abrir(t, dados);
  const prefs = await app.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox, webSecurity: p.webSecurity }; });
  assert.deepEqual(prefs, { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true });
  const visivel = await page.evaluate(() => ({ require: typeof require, process: typeof process, ipc: typeof window.ipcRenderer, chaves: Object.keys(window.prumo).sort(), congelado: Object.isFrozen(window.prumo) }));
  assert.equal(visivel.require, 'undefined'); assert.equal(visivel.process, 'undefined'); assert.equal(visivel.ipc, 'undefined'); assert.ok(visivel.congelado);
  assert.deepEqual(visivel.chaves, ["abrirRelease","abrirSite","acessoConfiguracao","acessoGithub","acessoGoogle","acessoSalvar","adicionarDemo","administracaoCodigo","administracaoMapa","agendaAutorizar","agendaEstado","agendaExcluir","agendaExecutar","agendaListar","agendaPermissoes","agendaPolitica","agendaRevogar","agendaRevogarPolitica","agendaSalvar","agentePessoalExcluir","agentePessoalSalvar","agentesEstado","agentesOrquestracoes","agentesPessoais","agentesPessoaisImportar","agentesRastrear","agentesSalvar","ajuda","assistenteAbertura","assistenteAgentes","assistenteAvaliar","assistenteConversar","casoLocalSalvar","chamadosAnexo","chamadosChave","chamadosConfiguracao","chamadosDetalhe","chamadosEstado","chamadosListar","chamadosResponder","conectar","conexoes","conhecimentoApagar","conhecimentoCriar","conhecimentoDecidir","conhecimentoEsquecer","conhecimentoEstado","conhecimentoListar","conhecimentoMostrar","conhecimentoVocabulario","contaCadastrar","contaCodigo","contaConfirmarEntrada","contaDuasEtapas","contaEntrar","contaGithubEstado","contaGithubIniciar","contaGoogleEstado","contaGoogleIniciar","contaPerfil","contaRecuperar","contaReenviarEntrada","contaSair","contaSenha","contaSessao","contextosAprovar","contextosConflito","contextosDesatualizar","contextosExcluir","contextosListar","contextosMcp","contextosObter","contextosSalvar","conversasListar","desvincular","diagnostico","escolherProjeto","escritaEstado","escritaHabilitar","espacoAssociar","espacoAutomacoes","espacoCriar","espacoEditar","espacoObter","espacoPasta","espacoTrazer","espacos","evidencias","excluirDados","execucoes","exportarLogs","exportarTela","historico","iaDelegacao","info","instalarAtualizacao","integracoes","jiraPrevia","jiraPublicar","logs","marcarVisualizada","metricasExecucoes","operacaoExecutar","operacoes","papeisExcluir","papeisListar","papeisSalvar","perfilObter","perfilSalvar","plataformaAgentes","plataformaSalvar","preferencias","projetos","propostaCriar","propostaDescartar","propostaEditar","propostaPublicar","propostaRevisar","propostaVincular","propostas","qaseCancelar","qaseImportar","qasePrever","qasePreverConta","repositorioLocal","resumoDados","runBugs","runCriar","runExecutar","runPolitica","runPreparar","runPublicar","runResultado","runRevogarPolitica","runs","salvarPreferencias","servicoAceite","servicoAdicionar","servicoConferir","servicoConsultar","servicoDesvincular","servicoImportar","servicoRecursos","servicoRemover","servicoValidar","servicoVincular","servicos","skillsCriar","skillsDecidir","skillsImportar","skillsListar","suiteLocalSalvar","suporteAbrir","suporteAnexar","suporteChamado","suporteConsultar","suporteEnviar","suporteExportar","suporteMeu","suporteMeus","suportePreparar","testarIntegracao","testesArquivo","testesCatalogo","testesGravar","testesPipelines","usuariosAlterar","usuariosAtivar","usuariosCriar","usuariosDesbloquear","usuariosExcluir","usuariosListar","usuariosSenha","verificarAtualizacao","versoes","vinculosMapa","visao","workerEstado","workerEventos","workerPausa"]);
  // Rede: CSP e filtro de requisições impedem qualquer saída; a navegação para fora também é bloqueada.
  assert.equal(await page.evaluate(() => fetch('https://example.com/').then(() => 'saiu', () => 'bloqueado')), 'bloqueado');
  await page.evaluate(() => { location.href = 'https://example.com/'; }); await page.waitForTimeout(500);
  assert.match(page.url(), /^file:/);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
});

test('IPC: argumentos inválidos, raiz não vinculada e remetente estranho são recusados', async (t) => {
  const dados = novoDados(t);
  const f = await fixture(t);
  const { app, page } = await abrir(t, dados);
  const r1 = await page.evaluate((root) => window.prumo.visao(root), f.root);
  assert.equal(r1.ok, false); assert.match(r1.error, /PROJECT_NOT_LINKED/);
  assert.match((await page.evaluate(() => window.prumo.visao('..\\..\\Windows'))).error, /PROJECT_NOT_LINKED/);
  assert.match((await page.evaluate(() => window.prumo.logs(42, {}))).error, /INVALID_ARGUMENTS/);
  assert.match((await page.evaluate((root) => window.prumo.logs(root, { limit: -5 }), f.root)).error, /INVALID_ARGUMENTS|PROJECT_NOT_LINKED/);
  assert.match((await page.evaluate((root) => window.prumo.conectar(root, 'claude'), f.root)).error, /INVALID_ARGUMENTS/);
  assert.match((await page.evaluate(() => window.prumo.evidencias('x', '../../etc')).then((r) => r.error ?? '')), /INVALID_ARGUMENTS/);
  // Outra página (não a nossa) com o mesmo preload não consegue usar os canais.
  const outra = path.join(dados, 'outra-pagina.html'); fs.writeFileSync(outra, '<p>outra pagina</p>');
  const estranho = await app.evaluate(async ({ BrowserWindow }, [preload, pagina]) => {
    const w = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } });
    await w.loadFile(pagina);
    const r = await w.webContents.executeJavaScript('window.prumo.info()'); w.destroy(); return r;
  }, [path.join(repo, 'backend', 'aplicativo', 'preload.cjs'), outra]);
  assert.equal(estranho.ok, false); assert.match(estranho.error, /IPC_SENDER_REJECTED/);
  // A URL correta em outra janela também não concede a identidade da janela principal.
  const copia = await app.evaluate(async ({ BrowserWindow }, [preload, pagina]) => {
    const w = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } });
    try {
      await w.loadFile(pagina);
      return await w.webContents.executeJavaScript('window.prumo.info()');
    } finally { w.destroy(); }
  }, [path.join(repo, 'backend', 'aplicativo', 'preload.cjs'), path.join(repo, 'dist/renderer/index.html')]);
  assert.equal(copia.ok, false); assert.match(copia.error, /IPC_SENDER_REJECTED/);
});

test('projetos com e sem manifesto: diagnóstico sem alterar a pasta e vínculo só para contrato válido', async (t) => {
  const dados = novoDados(t);
  const f = await fixture(t);
  const vazia = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo sem manifesto '));
  t.after(() => fs.rmSync(vazia, { recursive: true, force: true }));
  const { app, page } = await abrir(t, dados);
  assert.match(await page.textContent('#conteudo'), /Nenhuma pasta vinculada/);
  await ir(page, 'metricas'); assert.match(await page.textContent('#conteudo'), /Nenhum projeto selecionado/);
  await ir(page, 'projetos');
  // 2.10.2: sem manifesto, o Prumo propõe o contrato numa confirmação nativa; cancelar não grava nada na pasta.
  await app.evaluate(({ dialog }) => { globalThis.__propostas = 0; dialog.showMessageBox = async () => { globalThis.__propostas++; return { response: 0, checkboxChecked: false }; }; });
  await escolherPasta(app, vazia); await page.click('text=Vincular pasta…');
  for (let i = 0; i < 50 && !(await app.evaluate(() => globalThis.__propostas)); i++) await page.waitForTimeout(100);
  assert.equal(await app.evaluate(() => globalThis.__propostas), 1, 'proposta de contrato mostrada');
  assert.deepEqual(fs.readdirSync(vazia), []);
  assert.match(await page.textContent('#conteudo'), /Nenhuma pasta vinculada/);
  // Manifesto inválido continua só com diagnóstico, sem alterar o arquivo.
  fs.writeFileSync(path.join(vazia, 'qa.project.json'), '{"schemaVersion":1}');
  await page.click('text=Vincular pasta…'); await page.waitForSelector('.nota');
  assert.match(await page.textContent('.nota'), /MANIFESTO INV[AÁ]LIDO[\s\S]*qa\.project\.json/);
  assert.equal(fs.readFileSync(path.join(vazia, 'qa.project.json'), 'utf8'), '{"schemaVersion":1}');
  await escolherPasta(app, f.root); await page.click('text=Vincular pasta…');
  await page.waitForSelector('table');
  assert.match(await page.textContent('#projeto-atual'), /Fixture isolada/);
  assert.match(await page.textContent('tbody'), /INTEGRADO[\s\S]*unit/);
});

test('fluxo ponta a ponta: MCP real aparece em logs ao vivo, métricas e histórico; execução protegida fica BLOCKED; persiste após reiniciar', async (t) => {
  const dados = novoDados(t);
  const f = await fixture(t);
  const plano = JSON.parse(fs.readFileSync('backend/projetos/exemplos/plano-demo.json', 'utf8'));
  const primeira = await abrir(t, dados);
  await escolherPasta(primeira.app, f.root); await primeira.page.click('text=Vincular pasta…'); await primeira.page.waitForSelector('table');
  await ir(primeira.page, 'metricas');
  assert.match(await primeira.page.textContent('.grade'), /0interações registradas/);
  await ir(primeira.page, 'logs'); await primeira.page.check('#acompanhar');
  assert.match(await primeira.page.textContent('#conteudo'), /Nenhum registro/);
  // Sessão MCP independente iniciada fora da janela.
  const respostas = await mcp(f.root, dados, [['contexto_projeto', {}], ['revisar_cobertura', plano], ['executar_validacao', { capability: 'unit' }]]);
  assert.ok(respostas.every((r) => !r.isError));
  assert.equal(JSON.parse(respostas[2].content[0].text).status, 'BLOCKED');
  await primeira.page.waitForFunction(() => document.querySelectorAll('#v36-terminal .v36-log-line').length >= 6, null, { timeout: 8000 });
  const logs = await primeira.page.textContent('#v36-terminal');
  assert.match(logs, /contexto_projeto/); assert.match(logs, /revisar_cobertura/); assert.match(logs, /BLOCKED/);
  await primeira.page.fill('#v36-logs-busca', 'BLOCKED'); await primeira.page.waitForTimeout(300);
  assert.equal(await primeira.page.locator('#v36-terminal .v36-log-line').count(), 1);
  await ir(primeira.page, 'metricas');
  const m = await primeira.page.textContent('.grade');
  assert.match(m, /3interações registradas/); assert.match(m, /3chamadas via MCP/); assert.match(m, /1revisões de cobertura/); assert.match(m, /1BLOCKED/); assert.match(m, /0PASS/);
  await ir(primeira.page, 'logs'); await primeira.page.waitForSelector('.v36-log-line'); assert.equal(await primeira.page.locator('.v36-log-line').count() >= 3, true);
  // A tentativa bloqueada gerou evidência real BLOCKED (não executada), sem qualquer PASS.
  await ir(primeira.page, 'evidencias');
  // O modal abre com "Consultando evidência…": espera o conteúdo real (no CI a consulta é mais lenta).
  await primeira.page.waitForFunction(() => /BLOCKED/.test(document.querySelector('#qualidade-dialog')?.textContent ?? ''), null, { timeout: 15000 });
  const ev = await primeira.page.textContent('#qualidade-dialog');
  assert.match(ev, /unit\s*BLOCKED/); assert.match(ev, /HUMAN_APPROVAL_REQUIRED/); assert.match(ev, /não executado/); assert.doesNotMatch(ev, /PASS|null/);
  await primeira.fechar();

  // Com o Electron encerrado, o MCP não pode reutilizar a sessão anterior.
  await assert.rejects(() => mcp(f.root, dados, [['consultar_evidencias', {}]]));

  const segunda = await abrir(t, dados);
  await ir(segunda.page, 'metricas');
  assert.match(await segunda.page.textContent('#projeto-atual'), /Fixture isolada/, 'projeto selecionado e vínculo preservados');
  assert.match(await segunda.page.textContent('.grade'), /3interações registradas/, 'histórico preservado; tentativa sem sessão não cria novo registro');
  assert.deepEqual([...primeira.erros, ...segunda.erros], []);
});

test('funciona sem internet: proxy inexistente não impede nenhuma seção', async (t) => {
  const dados = novoDados(t);
  const f = await fixture(t);
  const { app, page, erros } = await abrir(t, dados, ['--proxy-server=127.0.0.1:9']);
  await escolherPasta(app, f.root); await page.click('text=Vincular pasta…'); await page.waitForSelector('table');
  for (const aba of abas) { await ir(page, aba); assert.ok((await page.textContent('#conteudo h1')).length > 0); }
  assert.deepEqual(erros, []);
});

test('ajuda: documentos locais, versão e documentos jurídicos marcados como rascunho', async (t) => {
  const dados = novoDados(t);
  const { page } = await abrir(t, dados);
  await ir(page, 'ajuda');
  const titulos = await page.locator('.indice button').allTextContents();
  assert.ok(titulos.length >= 18);
  for (const alvo of ['Política de privacidade', 'Termos de uso', 'Sobre']) {
    await page.click(`.indice button:has-text("${alvo}")`);
    const corpo = await page.textContent('article'); assert.ok(corpo.length > 100);
    if (alvo !== 'Sobre') assert.match(corpo, /rascunho/i); else assert.match(corpo, new RegExp('versão ' + versao.replaceAll('.', '\\.')));
  }
});

test('conexões: proposta de configuração visível, sem alterar clientes de IA', async (t) => {
  const dados = novoDados(t);
  const f = await fixture(t);
  const { app, page } = await abrir(t, dados);
  const antes = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : null);
  const codex = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'); const antesCodex = antes(codex);
  await escolherPasta(app, f.root); await page.click('text=Vincular pasta…'); await page.waitForSelector('table');
  await ir(page, 'agentes');
  const texto = await page.textContent('#conteudo');
  assert.match(texto, /Codex/); assert.match(texto, /Claude Code/); assert.match(texto, /mcp\.js/); assert.match(texto, /continua funcionando mesmo com esta janela fechada/);
  assert.equal(antes(codex), antesCodex);
  // A janela roda no Electron: o comando proposto usa o próprio executável em modo Node embutido (instalado: Prumo QA.exe).
  assert.ok(texto.includes('ELECTRON_RUN_AS_NODE=1'));
  if (exe) assert.ok(texto.includes(path.basename(exe)));
});
