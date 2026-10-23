import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fixture } from '../../../unitario/infra/fixtures.mjs';

import { repo, versao, exe, abas, novoDados, abrir, ir, vincularPasta, esperarPastaVinculada, raizDoProjetoAtual, mcp, atenderConfirmacoes } from '../../infra/janela.mjs';


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
  assert.deepEqual(visivel.chaves, ["abrirCadastroExterno","abrirRelease","abrirSite","acessoConfiguracao","acessoGithub","acessoGoogle","acessoSalvar","adicionarDemo","administracaoCodigo","administracaoMapa","agendaAutorizar","agendaEstado","agendaExcluir","agendaExecutar","agendaListar","agendaPermissoes","agendaPolitica","agendaRevogar","agendaRevogarPolitica","agendaSalvar","agentePessoalConsultar","agentePessoalExcluir","agentePessoalSalvar","agentePreferenciasSalvar","agentesEstado","agentesOrquestracoes","agentesPessoais","agentesPessoaisImportar","agentesRastrear","agentesSalvar","ajuda","assistenteAbertura","assistenteAgentes","assistenteAvaliar","assistenteConversar","autorizacaoDisponivel","autorizacaoEscolherSite","autorizacaoEstado","autorizarServico","casoLocalSalvar","chamadosAnexo","chamadosChave","chamadosConfiguracao","chamadosDetalhe","chamadosEstado","chamadosListar","chamadosResponder","conectar","conexoes","conhecimentoApagar","conhecimentoCriar","conhecimentoDecidir","conhecimentoEsquecer","conhecimentoEstado","conhecimentoListar","conhecimentoMostrar","conhecimentoVocabulario","contaCadastrar","contaCodigo","contaConfirmarEntrada","contaDuasEtapas","contaEntrar","contaGithubEstado","contaGithubIniciar","contaGoogleEstado","contaGoogleIniciar","contaImagemLink","contaPerfil","contaRecuperar","contaReenviarEntrada","contaSair","contaSenha","contaSessao","contextosAprovar","contextosConflito","contextosDesatualizar","contextosExcluir","contextosListar","contextosMcp","contextosObter","contextosSalvar","conversasListar","desvincular","diagnostico","escolherProjeto","escritaEstado","escritaHabilitar","espacoAssociar","espacoAutomacoes","espacoCriar","espacoEditar","espacoManual","espacoObter","espacoPasta","espacoTrazer","espacos","evidencias","excluirDados","execucoes","exportarLogs","exportarTela","githubConectar","githubConexaoEstado","historico","iaDelegacao","ideArquivo","ideArvore","ideBuscar","ideComandoExecutar","ideComandoParar","ideComandoSaida","ideCriarProjeto","ideCriarRepositorio","ideGitDiff","ideGitEstado","ideGravar","idePublicacao","idePublicar","info","instalarAtualizacao","integracoes","jiraDescobrir","jiraPrevia","jiraPublicar","logs","marcarVisualizada","metricasExecucoes","operacaoExecutar","operacoes","papeisExcluir","papeisListar","papeisSalvar","perfilObter","perfilSalvar","plataformaAgentes","plataformaSalvar","preferencias","projetos","projetosImportar","projetosRecursos","projetosVincular","propostaCriar","propostaDescartar","propostaEditar","propostaPublicar","propostaRevisar","propostaVincular","propostas","qaseCancelar","qaseConectar","qaseImportar","qasePrever","qasePreverConta","repositorioImportar","repositorioLocal","resumoDados","runAndamento","runApagar","runBugs","runCriar","runEditar","runEvidenciar","runEvidencias","runExecutar","runPolitica","runPreparar","runPublicar","runResultado","runResultados","runRevogarPolitica","runs","salvarPreferencias","servicoAceite","servicoAdicionar","servicoAlternar","servicoConferir","servicoConsultar","servicoDesvincular","servicoImportar","servicoRecursos","servicoRemover","servicoTrocarToken","servicoValidar","servicoVincular","servicos","skillsCriar","skillsDecidir","skillsImportar","skillsListar","suiteLocalSalvar","suporteAbrir","suporteAnexar","suporteChamado","suporteConsultar","suporteEnviar","suporteExportar","suporteMeu","suporteMeus","suportePreparar","testarIntegracao","testesArquivo","testesCatalogo","testesGravar","testesPipelines","usuariosAlterar","usuariosAtivar","usuariosCriar","usuariosDesbloquear","usuariosExcluir","usuariosListar","usuariosSenha","verificarAtualizacao","versoes","vinculosMapa","visao","vozEstado","vozPreparar","vozTranscrever","workerEstado","workerEventos","workerPausa"]);
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
  assert.match((await page.evaluate((root) => window.prumo.conectar(root, 'outro'), f.root)).error, /INVALID_ARGUMENTS/); // 'claude' agora é cliente válido (codex, claude, copilot, gemini)
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
  await ir(page, 'metricas'); assert.match(await page.textContent('#conteudo'), /Nenhum projeto selecionado/);
  // 2.19.0: a pasta entra num projeto do Prumo (bolha Pasta local). Sem manifesto, o Prumo propõe o contrato numa
  // confirmação nativa; cancelar não grava nada na pasta nem vincula.
  // 2.20.0: a proposta é a caixa de confirmação da janela; toda pergunta é recusada (Cancelar) e fica em conf.registro.
  const conf = atenderConfirmacoes(app, () => 'cancelar'); t.after(() => conf.parar());
  await vincularPasta(app, page, vazia, 'Fixture isolada');
  await conf.aguardar(1);
  assert.equal(conf.registro.length, 1, 'proposta de contrato mostrada'); assert.deepEqual(conf.registro[0].resposta, 'cancelar');
  assert.deepEqual(fs.readdirSync(vazia), []);
  const pastaDoProjeto = async () => (await page.evaluate(() => window.prumo.espacos())).data[0].pastaLocal ?? null;
  assert.equal(await pastaDoProjeto(), null, 'cancelar não vincula');
  // Manifesto inválido: recusado com explicação, sem alterar o arquivo.
  fs.writeFileSync(path.join(vazia, 'qa.project.json'), '{"schemaVersion":1}');
  await vincularPasta(app, page, vazia);
  await page.waitForSelector('#aviso.erro:not([hidden])');
  assert.match(await page.textContent('#aviso'), /qa\.project\.json/);
  assert.equal(fs.readFileSync(path.join(vazia, 'qa.project.json'), 'utf8'), '{"schemaVersion":1}');
  assert.equal(await pastaDoProjeto(), null, 'manifesto inválido não vincula');
  // Contrato válido: vincula a pasta ao projeto, que continua com o mesmo nome.
  await vincularPasta(app, page, f.root);
  await esperarPastaVinculada(page, f.root);
  assert.match(await page.textContent('#projeto-atual'), /Fixture isolada/);
});

test('fluxo ponta a ponta: MCP real aparece em logs ao vivo, métricas e histórico; execução protegida fica BLOCKED; persiste após reiniciar', async (t) => {
  const dados = novoDados(t);
  const f = await fixture(t);
  const plano = JSON.parse(fs.readFileSync('backend/projetos/exemplos/plano-demo.json', 'utf8'));
  const primeira = await abrir(t, dados);
  await vincularPasta(primeira.app, primeira.page, f.root, 'Fixture isolada'); await esperarPastaVinculada(primeira.page, f.root);
  // 2.19.0: MCP, Logs e Métricas trabalham na raiz do projeto do Prumo.
  const raiz = await raizDoProjetoAtual(primeira.page);
  await ir(primeira.page, 'metricas');
  assert.match(await primeira.page.textContent('.grade'), /0interações registradas/);
  await ir(primeira.page, 'logs'); await primeira.page.check('#acompanhar');
  // Antes da sessão MCP só há as ações do próprio Prumo (criar o projeto e ligar a pasta), nenhuma ferramenta MCP.
  assert.doesNotMatch(await primeira.page.textContent('#conteudo'), /contexto_projeto|revisar_cobertura|executar_validacao/);
  // Sessão MCP independente iniciada fora da janela.
  const respostas = await mcp(raiz, dados, [['contexto_projeto', {}], ['revisar_cobertura', plano], ['executar_validacao', { capability: 'unit' }]]);
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
  // 2.19.0: o MCP do projeto trabalha na raiz do Prumo, que é somente leitura: a validação fica BLOCKED por política,
  // nada é executado e nenhuma evidência é gravada; a janela de Evidências não inventa resultado.
  const execucao = JSON.parse(respostas[2].content[0].text);
  assert.equal(execucao.executed, false); assert.match(execucao.reason, /POLICY_BLOCKED/);
  await ir(primeira.page, 'evidencias');
  await primeira.page.waitForFunction(() => /Nenhuma evidência/.test(document.querySelector('#qualidade-dialog')?.textContent ?? ''), null, { timeout: 15000 });
  assert.doesNotMatch(await primeira.page.textContent('#qualidade-dialog'), /\bPASS\b|null/);
  await primeira.fechar();

  // Com o Electron encerrado, o MCP não pode reutilizar a sessão anterior.
  await assert.rejects(() => mcp(raiz, dados, [['consultar_evidencias', {}]]));

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
  await vincularPasta(app, page, f.root); await esperarPastaVinculada(page, f.root);
  for (const aba of abas) {
    await ir(page, aba); await page.locator('#conteudo h1').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    // A IDE (Código e Pipelines) usa a tela inteira, sem título: ali vale a área da IDE desenhada.
    if (aba === 'automacoes') assert.equal(await page.locator('#sub-conteudo.ds-ide-cheio').count(), 1, aba + ' sem a área da IDE');
    else assert.ok(await page.locator('#conteudo h1').count() > 0, aba + ' sem título');
  }
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
  await vincularPasta(app, page, f.root); await esperarPastaVinculada(page, f.root);
  await ir(page, 'agentes');
  // 2.19.0: a proposta de configuração MCP fica em Agentes › Políticas do projeto › Clientes MCP.
  await page.click('[data-agent-tab="policies"]'); await page.locator('#v36-politicas-conectar .ia-mcp-ia').first().waitFor();
  await page.waitForFunction(() => /mcp.js/.test(document.querySelector('#v36-politicas-conectar')?.textContent || ''));
  const texto = await page.textContent('#conteudo');
  assert.match(texto, /Codex/); assert.match(texto, /Claude Code/); assert.match(texto, /mcp\.js/); assert.match(texto, /O Prumo precisa estar aberto e com você conectado/, 'com login obrigatório o MCP depende do Prumo aberto');
  assert.equal(antes(codex), antesCodex);
  // A janela roda no Electron: o comando proposto usa o próprio executável em modo Node embutido (instalado: Prumo QA.exe).
  assert.ok(texto.includes('ELECTRON_RUN_AS_NODE=1'));
  if (exe) assert.ok(texto.includes(path.basename(exe)));
});
