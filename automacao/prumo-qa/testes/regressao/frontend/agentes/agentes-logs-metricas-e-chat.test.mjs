import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, mcp } from '../../../apoio/janela.mjs';

// Contratos reais em Electron/IPC/MCP, sempre com perfil temporário e projeto
// sintético criado no próprio perfil. Sem banco, contas ou projetos externos.
async function prepare(t) {
  const dados = novoDados(t), a = await abrir(t, dados);
  await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  const r = await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'V36 isolado', descricao: 'Projeto sintético para teste de apresentação' }));
  assert.equal(r.ok, true); const e = r.data;
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click();
  await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'V36 isolado');
  return { ...a, dados, e };
}
async function capture(a, nome) {
  if (!process.env.PRUMO_V36_CAPTURAS) return;
  const folder = path.resolve(process.env.PRUMO_V36_CAPTURAS); fs.mkdirSync(folder, { recursive: true });
  await a.page.screenshot({ path: path.join(folder, nome + '.png'), fullPage: true });
}

test('agentes reais, prévia validada/persistida, descarte, confirmação nativa e Cérebro', async t => {
  const a = await prepare(t); await ir(a.page, 'agentes'); await a.page.waitForSelector('[data-agent="qa-geral"]');
  assert.equal(await a.page.locator('[data-agent-tab]').count(), 2);
  assert.equal(await a.page.locator('[data-agent]').count(), 8);
  await capture(a, 'agentes');
  await a.page.locator('#v36-clients summary').first().click();
  await a.page.waitForFunction(() => /Claude Code/.test(document.querySelector('#v36-client-panel').textContent));
  assert.match(await a.page.textContent('#v36-client-panel'), /Codex/);
  assert.match(await a.page.textContent('#v36-client-panel'), /não comprova|não confirma|CONFIGURAVEL|NÃO CONFIGURADO|NAO_CONFIGURADO/i);
  await a.page.locator('#v36-clients > summary').click();
  await a.page.click('[data-agent="qa-geral"]');
  assert.equal(await a.page.locator('#v36-agent-save').isDisabled(), true);
  await a.page.selectOption('[data-pol=propor_casos]', 'BLOQUEADO');
  assert.equal(await a.page.locator('#v36-agent-save').isEnabled(), true);
  await a.page.click('#v36-agent-cancel');
  assert.equal(await a.page.locator('#v36-agent-save').isDisabled(), true);
  assert.equal(await a.page.inputValue('[data-pol=propor_casos]'), 'PERMITIDO');
  await a.page.selectOption('[data-pol=propor_casos]', 'BLOQUEADO');
  await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await a.page.click('#v36-agent-save'); await a.page.waitForFunction(() => !document.querySelector('#v36-agent-save').disabled);
  assert.notEqual((await a.page.evaluate(id => window.prumo.agentesEstado(id), a.e.id)).data.configuracao.politicas.propor_casos, 'BLOQUEADO', 'cancelar confirmação nativa não persiste');
  await a.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await a.page.click('#v36-agent-save'); await a.page.waitForSelector('[data-agent="qa-geral"]');
  assert.equal((await a.page.evaluate(id => window.prumo.agentesEstado(id), a.e.id)).data.configuracao.politicas.propor_casos, 'BLOQUEADO');
  await a.page.click('[data-agent="qa-geral"]'); await capture(a, 'configuracao'); await a.page.click('#v36-brain-open');
  await a.page.click('[data-neuron="Skill"]'); assert.match(await a.page.textContent('.v36-brain-inspect'), /skills\/qa/); await capture(a, 'cerebro');
  await a.page.getByRole('button', { name: '← Configuração', exact: true }).click(); await a.page.getByRole('button', { name: '← Agentes', exact: true }).click();
  await a.page.click('#v36-agent-new'); await a.page.fill('#v36-agent-name', 'Prévia de QA'); await a.page.click('#v36-agent-save');
  assert.equal(await a.page.locator('.v36-dialog').count(), 0, 'campos obrigatórios impedem salvamento');
  await a.page.fill('#v36-agent-goal', 'Consultar contexto'); await a.page.fill('#v36-agent-instructions', '<script>throw Error("não executar")</script>');
  await a.page.click('#v36-agent-save'); await a.page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const pessoais = (id) => a.page.evaluate((x) => window.prumo.agentesPessoais(x).then((r) => r.data), id);
  assert.equal((await pessoais(a.e.id)).length, 0, 'cancelar não grava');
  await a.page.click('#v36-agent-save'); await a.page.getByRole('button', { name: 'Salvar agente', exact: true }).click();
  await a.page.waitForSelector('[data-agent^="pessoal-"]'); assert.match(await a.page.textContent('[data-agent^="pessoal-"]'), /Seu · só você vê/);
  assert.equal(await a.page.evaluate((id) => localStorage.getItem('prumo-v36-drafts-' + id), a.e.id), null, 'nada fica no armazenamento da janela, que é de todas as contas');
  await a.page.click('[data-agent^="pessoal-"]');
  await a.page.locator('#v36-agent-import').setInputFiles({ name: 'invalido.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"approved":true}') });
  await a.page.waitForFunction(() => /Importação recusada/.test(document.querySelector('#aviso').textContent));
  const imported = { version: 1, id: 'previa-importada', nome: 'Importada', descricao: '', objetivo: 'Ler dados', instrucoes: 'Somente leitura' };
  await a.page.locator('#v36-agent-import').setInputFiles({ name: 'agente.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await a.page.waitForFunction(() => document.querySelector('#v36-agent-name').value === 'Importada');
  assert.equal(await a.page.inputValue('#v36-agent-name'), 'Importada');
  assert.equal((await pessoais(a.e.id))[0].nome, 'Prévia de QA', 'importar só preenche formulário');
  await a.page.click('#v36-agent-cancel'); assert.equal(await a.page.inputValue('#v36-agent-name'), 'Prévia de QA');
  const exported = path.join(a.dados, 'previa.json');
  await a.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
  await a.page.getByRole('button', { name: 'Exportar JSON', exact: true }).click(); await a.page.waitForFunction(() => /Arquivo exportado/.test(document.querySelector('#aviso').textContent));
  assert.match(fs.readFileSync(exported, 'utf8'), /não executar/);
  const policies = (await a.page.evaluate(id => window.prumo.agentesEstado(id), a.e.id)).data; assert.equal(policies.especializacoes.length, 8, 'prévia não cria especialização no backend');
  await a.fechar(); const b = await abrir(t, a.dados); await ir(b.page, 'agentes'); await b.page.waitForSelector('[data-agent^="pessoal-"]');
  assert.match(await b.page.textContent('[data-agent^="pessoal-"]'), /Prévia de QA/); assert.deepEqual([...a.erros, ...b.erros], []);
});

test('MCP isolado e diario da conta alimentam terminal, filtros, graficos e painel', async t => {
  const a = await prepare(t);
  const out = await mcp(a.e.raizContextos, a.dados, [['contexto_projeto', {}], ['consultar_evidencias', {}]]);
  assert.ok(out.every(r => !r.isError));
  await ir(a.page, 'logs'); await a.page.waitForSelector('.v36-log-line'); assert.equal(await a.page.locator('.v36-log-line').count(), 4); await capture(a, 'logs');
  await a.page.fill('#v36-logs-busca', 'NOT_VERIFIED'); assert.equal(await a.page.locator('.v36-log-line').count(), 1);
  await a.page.locator('.v36-log-line').first().click(); assert.match(await a.page.textContent('.v36l-detalhe'), /contexto_projeto/);
  await a.page.click('#v36-logs-limpar'); await a.page.check('#acompanhar');
  await mcp(a.e.raizContextos, a.dados, [['consultar_evidencias', {}]]);
  await a.page.waitForFunction(() => document.querySelectorAll('.v36-log-line').length === 6, null, { timeout: 8000 });
  await ir(a.page, 'metricas'); await a.page.waitForSelector('#v36-met-graficos [data-grafico]'); await capture(a, 'metricas');
  assert.equal(await a.page.locator('#v36-met-graficos [data-grafico]').count(), 3, 'três gráficos padrão do protótipo');
  await a.page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await a.page.getByLabel('Buscar atividade', { exact: true }).fill('contexto_projeto'); assert.match(await a.page.textContent('#v36-met-resumo'), /^1 registros nos filtros atuais/);
  for (const [name, ext, pattern] of [['Exportar JSON', 'json', /contexto_projeto/], ['Exportar CSV', 'csv', /Horário,Tipo,Resultado/]]) { const exported = path.join(a.dados, 'metricas.' + ext); await a.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported); await a.page.getByRole('button', { name: 'Exportar dados filtrados', exact: true }).click(); await a.page.getByRole('menuitem', { name, exact: true }).click(); await a.page.waitForFunction(() => /Arquivo exportado/.test(document.querySelector('#aviso').textContent)); assert.match(fs.readFileSync(exported, 'utf8'), pattern); }
  await ir(a.page, 'agentes'); await a.page.click('[data-agent-tab=activity]'); await a.page.waitForSelector('[data-activity]'); assert.equal(await a.page.locator('[data-activity]').count(), 3); await capture(a, 'atividades');
  assert.doesNotMatch(await a.page.textContent('#conteudo'), /\bnull\b/, 'aviso opcional ausente não vira texto na tela');
  // v41: canvas com janela por cliente observado, hub por ferramenta e linhas só entre registros existentes.
  assert.equal(await a.page.locator('.pa-janela.pa-cliente').count(), 1, 'um cliente observado = uma janela');
  assert.equal(await a.page.locator('.pa-hub.pa-ferramenta').count(), 2, 'contexto_projeto e consultar_evidencias');
  assert.equal(await a.page.locator('.pa-aresta-folha').count(), 3, 'uma linha por operação registrada');
  assert.equal(await a.page.locator('.pa-janela.pa-orquestrador, .pa-janela.pa-worker, .pa-janela.pa-externo').count(), 0, 'sem conversa nem execução, nada é inferido');
  const zoom = async () => Number((await a.page.textContent('.pa-zoom-txt')).replace('%', ''));
  const z0 = await zoom(); await a.page.getByRole('button', { name: 'Aproximar', exact: true }).click(); assert.ok(await zoom() > z0, 'aproximar aumenta o zoom');
  await a.page.focus('.pa-viewport'); await a.page.keyboard.press('-'); await a.page.keyboard.press('-'); assert.ok(await zoom() < z0 * 1.25, 'teclado afasta');
  await a.page.getByRole('button', { name: 'Ajustar à tela', exact: true }).click(); await a.page.waitForFunction((z) => document.querySelector('.pa-zoom-txt').textContent === z + '%', z0);
  await a.page.locator('[data-activity]').first().click(); assert.match(await a.page.textContent('.v36-dialog[open]'), /client/); await a.page.getByRole('button', { name: 'Fechar', exact: true }).click();
  assert.deepEqual(a.erros, []);
});

test('Home, robô original, chat lateral e flutuante, reflow/zoom e redução de movimento', async t => {
  const a = await prepare(t); await ir(a.page, 'inicio'); await a.page.waitForSelector('#chat-input'); await capture(a, 'inicio');
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await a.page.fill('#chat-input', 'Qual a situação do projeto?'); await a.page.locator('#chat-form button').click();
  await a.page.waitForFunction(() => document.querySelectorAll('#chat-msgs .msg.prumo').length >= 1);
  assert.match(await a.page.getAttribute('#v36-chat-open img', 'src'), /robo-original.png/);
  assert.equal(await a.page.locator('#v36-chat-open').isVisible(), false, 'no Início a conversa ocupa a tela; o atalho flutuante some');
  await ir(a.page, 'logs'); await a.page.click('#v36-chat-open');
  assert.match(await a.page.textContent('#v36-float-panel #chat-msgs'), /Qual a situação do projeto\?/, 'a mesma conversa do Início continua no painel');
  const antes = await a.page.locator('#v36-float-panel .msg.prumo').count();
  await a.page.fill('#v36-float-panel #chat-input', 'Qual a situação?'); await a.page.locator('#v36-float-panel button[type=submit]').click();
  await a.page.waitForFunction(n => document.querySelectorAll('#v36-float-panel .msg.prumo').length > n, antes); await capture(a, 'chat-flutuante');
  await a.page.click('#v36-chat-dock'); assert.equal(await a.page.evaluate(() => document.body.classList.contains('v36-encaixado')), true); await capture(a, 'chat-lateral');
  await ir(a.page, 'logs'); assert.equal(await a.page.locator('#v36-float-panel').isVisible(), true, 'lateral encaixada acompanha a navegação');
  await a.page.getByRole('button', { name: 'Fechar chat', exact: true }).click(); assert.equal(await a.page.locator('#v36-float-panel').isVisible(), false);
  assert.equal(await a.page.evaluate(() => document.body.classList.contains('v36-encaixado')), false);
  await ir(a.page, 'inicio'); assert.equal(await a.page.locator('#conteudo #chat-msgs').count(), 1, 'conversa volta ao Início');
  for (const zoom of [1, 2, 4]) {
    await a.app.evaluate(({ BrowserWindow }, z) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 900); w.webContents.setZoomFactor(z); }, zoom);
    for (const aba of ['inicio', 'metricas', 'logs', 'agentes']) { await ir(a.page, aba); assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${aba} zoom ${zoom}`); }
    await a.page.click('[data-agent=qa-geral]'); assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'configuração sem overflow global');
    assert.equal(await a.page.locator('.v36-agent-form').evaluate(el => getComputedStyle(el).overflowY), 'auto'); assert.equal(await a.page.evaluate(() => { const r = document.querySelector('.v36a-perfil .v36-robo'); if (r) return r.dataset.movimento; const p = document.querySelector('.v36a-perfil .v36-portrait'); return p && getComputedStyle(p).animationName === 'none' ? 'parado' : 'vivo'; }), 'parado', 'movimento reduzido para o rosto 3D');
    await a.page.click('#v36-brain-open'); assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Cérebro sem overflow global');
  }
  assert.deepEqual(a.erros, []);
});

test('exportação nativa recusa tipo, tamanho e extensão arbitrários; cancelar não grava', async t => {
  const a = await prepare(t); const target = path.join(a.dados, 'recusado.exe');
  assert.match((await a.page.evaluate(() => window.prumo.exportarTela('executavel', '{}'))).error, /INVALID_ARGUMENTS/);
  assert.match((await a.page.evaluate(() => window.prumo.exportarTela('agente', 'x'.repeat(2 * 1024 * 1024 + 1)))).error, /INVALID_ARGUMENTS/);
  assert.match((await a.page.evaluate(() => window.prumo.exportarTela('agente', 'é'.repeat(1024 * 1024 + 1)))).error, /EXPORT_FORMAT_INVALID/);
  assert.match((await a.page.evaluate(() => window.prumo.exportarTela('agente', 'não é JSON'))).error, /EXPORT_FORMAT_INVALID/);
  await a.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, target);
  assert.match((await a.page.evaluate(() => window.prumo.exportarTela('agente', '{}'))).error, /EXPORT_FORMAT_INVALID/); assert.equal(fs.existsSync(target), false);
  await a.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath }); }, path.join(a.dados, 'cancelado.json'));
  assert.equal((await a.page.evaluate(() => window.prumo.exportarTela('agente', '{}'))).data.exported, false); assert.equal(fs.existsSync(path.join(a.dados, 'cancelado.json')), false);
  assert.deepEqual(a.erros, []);
});

test('Agentes sempre disponível e Conexões distribui MCP (Claude/Codex) e testes (Qase/Jira)', async t => {
  const sem = await abrir(t, novoDados(t)); await ir(sem.page, 'agentes');
  await sem.page.waitForSelector('#v36-orquestrador-sempre');
  assert.equal(await sem.page.locator('#v36-agentes-conexoes').count(), 1, 'sem projeto a tela de Agentes ainda leva a Conexões');
  await sem.page.click('#v36-agentes-conexoes'); await sem.page.waitForSelector('#integracoes-agentes');
  for (const id of ['claude', 'codex', 'qase', 'jira', 'github']) assert.equal(await sem.page.locator(`#integracoes-agentes [data-integracao="${id}"]`).count(), 1, id);
  await sem.page.click('#integracao-abrir-agentes'); await sem.page.waitForSelector('#v36-orquestrador-sempre');
  await sem.fechar();
  const a = await prepare(t); await ir(a.page, 'agentes'); await a.page.waitForSelector('#v36-agentes-integracoes');
  await a.page.click('#v36-agentes-integracoes'); await a.page.waitForSelector('#integracao-claude');
  await a.page.click('#integracao-codex'); await a.page.waitForFunction(() => /Codex/.test(document.querySelector('#conexao-mcp-painel')?.textContent || ''));
  await a.page.click('#integracao-conectar-qase'); assert.equal(await a.page.inputValue('#conexao-servico'), 'qase');
  assert.deepEqual(a.erros, []);
});
