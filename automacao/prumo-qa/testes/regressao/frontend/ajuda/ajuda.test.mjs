import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { iniciarAtividade } from '../../../../dist/logs/regras/iniciarAtividade.js';
import { criarEvidenciaInicial } from '../../../../dist/testes/regras/criarEvidenciaInicial.js';
import { salvarEvidencia } from '../../../../dist/testes/banco/salvarEvidencia.js';
import { fixture } from '../../../apoio/fixtures.mjs';
import { versao, exe, novoDados, abrir, ir, escolherPasta, mcp } from '../../../apoio/janela.mjs';
import { esquemasIpc } from '../../../../dist/aplicativo/api/catalogoDeContratos.js';

/** Ajuda 2.3 na janela real: central, versões, integrações técnicas, atualização, privacidade, exportação, exclusão e diagnóstico. */
const abrirAjuda = async (page, titulo) => { await ir(page, 'ajuda'); await page.click(`.indice button:has-text("${titulo}")`); await page.waitForTimeout(300); };
const dialogos = (app, resposta, salvar) => app.evaluate(({ dialog }, [r, destino]) => {
  dialog.showMessageBox = async () => ({ response: r, checkboxChecked: false });
  dialog.showSaveDialog = async () => ({ canceled: !destino, filePath: destino });
}, [resposta, salvar]);
async function vincular(app, page, root) { await escolherPasta(app, root); await page.click('text=Vincular pasta…'); await page.waitForSelector('table'); }
const chamar = (page, fn, ...args) => page.evaluate(([f, a]) => window.prumo[f](...a), [fn, args]);
// Uma conta autenticada tem diario proprio; MCP iniciado sem sessao nao recebe esse escopo.
const dadosDaConta = async (page, dados) => {
  const s = await chamar(page, 'contaSessao');
  assert.ok(s.ok && s.data.usuario?.id, 'conta autenticada');
  return path.join(dados, 'usuarios', s.data.usuario.id);
};
async function registrarAtividadeDaConta(page, dados, raiz, ferramenta, status = 'OK') {
  const base = await dadosDaConta(page, dados);
  const projeto = await carregarProjeto(raiz);
  iniciarAtividade(projeto, ferramenta, { origin: 'MCP', client: 'sdk' }, {}, { base }).finalizar({ status });
}


test('central de ajuda: guia completo, perguntas frequentes expansíveis e tudo offline', async (t) => {
  const dados = novoDados(t);
  const { page, erros } = await abrir(t, dados, ['--proxy-server=127.0.0.1:9']);
  await ir(page, 'ajuda');
  const indice = await page.locator('.indice button').allTextContents();
  for (const t of ['O que é o Prumo QA', 'Como funciona', 'Como instalar', 'Como vincular um projeto', 'Como conectar uma IA', 'O que o Prumo faz sem IA e o que depende dela', 'Como interpretar os resultados', 'Problemas comuns', 'Perguntas frequentes', 'Versões', 'Atualizações', 'Integrações técnicas', 'Privacidade e dados', 'Política de privacidade (rascunho)', 'Segurança e limitações'])
    assert.ok(indice.includes(t), 'índice sem: ' + t);
  await page.click('.indice button:has-text("Como funciona")');
  assert.match(await page.textContent('article'), /Projeto \(qa\.project\.json\) → IA .* → MCP → núcleo do Prumo/);
  await page.click('.indice button:has-text("Perguntas frequentes")');
  assert.ok((await page.locator('details.faq').count()) >= 8);
  const primeira = page.locator('details.faq').first();
  assert.equal(await primeira.getAttribute('open'), null, 'perguntas começam recolhidas');
  await primeira.locator('summary').click();
  assert.notEqual(await primeira.getAttribute('open'), null); assert.match(await primeira.textContent(), /Não\. O Prumo confere as regras do projeto/);
  await page.click('.indice button:has-text("Problemas comuns")');
  const problemas = await page.textContent('article');
  for (const termo of ['A conexão MCP não aparece', 'O projeto não tem contrato', 'Não aparecem logs', 'BLOCKED', 'Windows bloqueou']) assert.match(problemas, new RegExp(termo));
  assert.deepEqual(erros, []);
});

test('Versões: histórico offline com detalhes expansíveis e versão instalada correta', async (t) => {
  const dados = novoDados(t);
  const { app, page } = await abrir(t, dados, ['--proxy-server=127.0.0.1:9']);
  await app.evaluate(() => { globalThis.fetch = async () => { throw new Error('Rede simulada indisponível'); }; });
  await abrirAjuda(page, 'Versões');
  const todas = page.locator('details.versao'); assert.ok((await todas.count()) >= 5, 'histórico de 2.0.0 até a versão instalada');
  const aberta = page.locator('details.versao[open]'); assert.equal(await aberta.count(), 1);
  assert.match(await aberta.locator('summary').textContent(), new RegExp(versao.replaceAll('.', '\\.') + ' — [\\s\\S]*instalada'));
  const antiga = todas.filter({ hasText: '2.0.0 — Núcleo de engenharia de qualidade' }).first(); assert.match(await antiga.locator('summary').textContent(), /2\.0\.0 — Núcleo de engenharia de qualidade/);
  await antiga.locator('summary').click();
  const texto = await antiga.textContent();
  for (const t of ['Diferencial:', 'Funcionalidades', 'Segurança', 'Compatibilidade', 'Limitações conhecidas', 'Migração de dados:', 'Sem release oficial publicada']) assert.ok(texto.includes(t), t);
  const v22 = await todas.filter({ hasText: '2.2.0 — Aplicativo Windows' }).first().textContent();
  assert.match(v22, /publicada/); assert.match(v22, /2026-10-10/); assert.match(v22, /releases\/tag\/v2\.2\.0/);
  assert.match(await page.textContent('article'), /sem data de publicação|planejada|publicada/);
});

test('Integrações técnicas: catálogo de IPC e MCP corresponde ao código e filtra por tipo', async (t) => {
  const dados = novoDados(t);
  const { page } = await abrir(t, dados);
  await abrirAjuda(page, 'Integrações técnicas');
  const total = Object.keys(esquemasIpc).length;
  assert.equal(await page.locator('details.operacao').count(), total + 8);
  await page.selectOption('#filtro-tipo', 'MCP'); assert.equal(await page.locator('details.operacao').count(), 8);
  await page.selectOption('#filtro-tipo', 'IPC'); assert.equal(await page.locator('details.operacao').count(), total);
  const logs = page.locator('details.operacao', { hasText: 'prumo:projeto:logs' }).first(); await logs.locator('summary').click();
  const t1 = await logs.textContent();
  for (const trecho of ['Tipo', 'IPC', 'prumo:projeto:logs', 'Interface > Logs', 'backend/logs/api/projetoLogs.ts > listarLogsDoProjeto', 'Projeto selecionado + filtros', 'Projeto previamente vinculado', 'Consulta local; não altera o projeto']) assert.ok(t1.includes(trecho), trecho);
  await page.selectOption('#filtro-tipo', 'MCP');
  const exec = page.locator('details.operacao', { hasText: 'executar_validacao' }); await exec.locator('summary').click();
  const t2 = await exec.textContent();
  assert.match(t2, /autenticação humana nativa do Windows/); assert.match(t2, /approved:true da IA não existe/); assert.match(t2, /capability, solicitarAprovacao/);
  assert.doesNotMatch(await page.textContent('article'), /https?:\/\//);
});

test('Atualizações: release mais nova, igual, inexistente e indisponível; abrir página só com confirmação e só a oficial', async (t) => {
  if (exe) return t.skip('servidor de teste só é aceito fora do pacote; o instalado é coberto por verificação real na demonstração');
  const pedidos = []; let modo = 'nova';
  const srv = http.createServer((req, res) => {
    pedidos.push({ m: req.method, u: req.url, c: req.headers.cookie, a: req.headers.authorization, ua: req.headers['user-agent'] });
    if (modo === '404') { res.writeHead(404); return res.end('{}'); }
    const tag = modo === 'nova' ? 'v99.0.0' : 'v' + versao;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ tag_name: tag, html_url: 'https://evil.example/x', body: '## O que mudou\n- Item novo importante', draft: false, prerelease: false }));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); t.after(() => srv.close());
  const dados = novoDados(t);
  const { app, page } = await abrir(t, dados, [], { PRUMO_UPDATE_TEST_URL: `http://127.0.0.1:${srv.address().port}/latest` });
  assert.match((await chamar(page, 'abrirRelease')).error, /NO_VERIFIED_RELEASE/);
  await abrirAjuda(page, 'Atualizações');
  assert.equal(pedidos.length, 0, 'nada é consultado sem o clique');
  await page.click('text=Verificar atualizações');
  await page.waitForSelector('text=Abrir página oficial…');
  let txt = await page.textContent('article');
  assert.match(txt, /ATUALIZAÇÃO DISPONÍVEL/); assert.match(txt, /99\.0\.0/); assert.match(txt, /Item novo importante/); assert.match(txt, /instalador não é assinado/);
  assert.equal(pedidos.length, 1); assert.equal(pedidos[0].m, 'GET'); assert.equal(pedidos[0].c, undefined); assert.equal(pedidos[0].a, undefined); assert.equal(pedidos[0].ua, 'PrumoQA/' + versao);
  assert.doesNotMatch(JSON.stringify(pedidos), /Users|AppData|prumo dados|projects/i);
  // abrir: cancelar não abre; confirmar abre somente a URL oficial reconstruída da tag
  await app.evaluate(({ shell }) => { globalThis.__abertas = []; shell.openExternal = async (u) => { globalThis.__abertas.push(u); }; });
  await dialogos(app, 0); await page.click('text=Abrir página oficial…'); await page.waitForTimeout(300);
  assert.deepEqual(await app.evaluate(() => globalThis.__abertas), []);
  await dialogos(app, 1); await page.click('text=Abrir página oficial…'); await page.waitForTimeout(300);
  assert.deepEqual(await app.evaluate(() => globalThis.__abertas), ['https://github.com/AnaPLysyk/Prumo-Qa/releases/tag/v99.0.0']);
  modo = 'igual'; await page.click('text=Verificar atualizações'); await page.waitForSelector('text=já usa a versão mais recente');
  assert.equal(await page.locator('text=Abrir página oficial…').count(), 0);
  assert.match((await chamar(page, 'abrirRelease')).error, /NO_VERIFIED_RELEASE/, 'sem atualização disponível não há o que abrir');
  modo = '404'; await page.click('text=Verificar atualizações'); await page.waitForSelector('text=ainda não publicou nenhuma release');
  srv.close(); await page.click('text=Verificar atualizações');
  await page.waitForSelector('text=Isto não significa que não exista uma atualização'); assert.match(await page.textContent('#consulta-nao-concluida'), /ainda não sabemos se há atualização/); assert.equal(await page.locator('text=já usa a versão mais recente').count(), 0, 'falha de consulta nunca vira "atualizado"');
  await ir(page, 'projetos'); assert.match(await page.textContent('#conteudo'), /Projetos/, 'aplicativo segue utilizável');
});

test('Atualizações com falha simulada de rede: aplicativo continua utilizável sem consultar serviço externo', async (t) => {
  const dados = novoDados(t);
  const { app, page } = await abrir(t, dados, ['--proxy-server=127.0.0.1:9']);
  await app.evaluate(() => { globalThis.fetch = async () => { throw new Error('Rede simulada indisponível'); }; });
  await abrirAjuda(page, 'Atualizações');
  assert.match(await page.textContent('article'), /v?\d+\.\d+\.\d+/);
  assert.match(await page.textContent('article'), /endereço IP\. Isto não é anonimato/);
  await page.click('text=Verificar atualizações');
  await page.waitForSelector('article .estado', { timeout: 20000 });
  const estado = (await page.textContent('article .estado')).trim();
  assert.equal(estado, 'CONSULTA NÃO CONCLUÍDA');
  if (estado === 'CONSULTA NÃO CONCLUÍDA') assert.match(await page.textContent('article'), /O aplicativo continua disponível para uso local/);
  if (estado !== 'ATUALIZAÇÃO DISPONÍVEL') assert.equal(await page.locator('text=Abrir página oficial…').count(), 0);
  await ir(page, 'projetos'); assert.match(await page.textContent('#conteudo'), /Projetos/);
});

test('Privacidade e dados: resumo real, exportação, exclusão separada por escopo com confirmação e sem tocar o projeto', async (t) => {
  const f = await fixture(t); const dados = novoDados(t);
  const { app, page } = await abrir(t, dados);
  await vincular(app, page, f.root);
  await mcp(f.root, dados, [['contexto_projeto', {}]]);
  await registrarAtividadeDaConta(page, dados, f.root, 'executar_validacao', 'BLOCKED');
  const projeto = await carregarProjeto(f.root);
  const job = randomUUID(); const agora = new Date().toISOString();
  await salvarEvidencia(projeto, criarEvidenciaInicial(projeto, 'unit', job, agora));
  await abrirAjuda(page, 'Privacidade e dados');
  const painel = await page.textContent('article');
  assert.ok(painel.includes(dados)); assert.match(painel, /Projetos vinculados: 1/); assert.match(painel, /Sem retenção automática/); assert.match(painel, /não recebe as conversas/); assert.match(painel, /processo principal consulta atualizações.*chamados públicos no GitHub oficial/i); assert.match(painel,/nenhum dado de projeto é enviado/);
  assert.match(painel, /historico/); assert.match(painel, /vinculos/);
  // exportar
  const destino = path.join(dados, 'exportado.json');
  await dialogos(app, 1, destino); await page.click('#exportar-dados'); await page.waitForTimeout(500);
  const exportado = JSON.parse(fs.readFileSync(destino, 'utf8')); assert.equal(exportado.events.length, 4);
  assert.doesNotMatch(JSON.stringify(exportado), /prumo espaço|AppData/i);
  // cancelar não apaga
  await dialogos(app, 0); await page.click('#excluir-historico'); await page.waitForSelector('text=Cancelado; nada foi excluído.');
  assert.equal((await chamar(page, 'visao', f.root)).data.metrics.totalOperations, 2);
  // excluir só evidências: histórico permanece
  const antes = (await chamar(page, 'evidencias', f.root)).data.results.length; assert.equal(antes, 1);
  await dialogos(app, 1); await page.click('#excluir-evidencias'); await page.waitForSelector('text=Excluídos: 1 arquivo(s).');
  assert.equal((await chamar(page, 'evidencias', f.root)).data.results.length, 0);
  assert.equal((await chamar(page, 'visao', f.root)).data.metrics.totalOperations, 2, 'histórico não foi tocado');
  // excluir histórico: código e vínculo permanecem
  await page.click('#excluir-historico'); await page.waitForSelector('text=Excluídos: 2 arquivo(s).');
  assert.equal((await chamar(page, 'visao', f.root)).data.metrics.totalOperations, 0);
  assert.equal((await chamar(page, 'projetos')).data.length, 1, 'vínculo mantido');
  for (const arq of ['qa.project.json', 'README.md', 'src/app.mjs', 'tests/test.mjs']) assert.ok(fs.existsSync(path.join(f.root, arq)), arq);
  // MCP conectado à conta atual registra uma operação após a limpeza, no escopo autenticado.
  await mcp(f.root, dados, [['consultar_evidencias', {}]]);
  assert.equal((await chamar(page, 'visao', f.root)).data.metrics.totalOperations, 1);
});

test('exclusão não é possível sem confirmação nativa nem para projeto não vinculado ou escopo inventado', async (t) => {
  const f = await fixture(t); const dados = novoDados(t);
  const { app, page } = await abrir(t, dados);
  await dialogos(app, 1);
  assert.match((await chamar(page, 'excluirDados', 'historico', f.root)).error, /PROJECT_NOT_LINKED/);
  assert.match((await chamar(page, 'excluirDados', 'tudo', f.root)).error, /INVALID_ARGUMENTS/);
  assert.match((await page.evaluate((r) => window.prumo.excluirDados('historico', r), '..\\..')).error, /PROJECT_NOT_LINKED|INVALID_ARGUMENTS/);
  assert.ok(fs.existsSync(f.root));
});

test('diagnóstico IPC: erros ficam registrados sem argumentos; polling não gera diagnóstico nem evento de QA', async (t) => {
  const f = await fixture(t); const dados = novoDados(t);
  const { app, page } = await abrir(t, dados);
  await vincular(app, page, f.root);
  await mcp(f.root, dados, [['contexto_projeto', {}]]);
  const base = (await chamar(page, 'visao', f.root)).data.metrics.totalOperations; assert.equal(base, 1);
  const eventosAntes = (await chamar(page, 'diagnostico')).data.events.length; // inclui o vínculo (ação rara, registrada)
  await ir(page, 'logs'); await page.check('#acompanhar'); await page.waitForTimeout(5200); // ~2 ciclos de atualização
  await page.uncheck('#acompanhar');
  assert.equal((await chamar(page, 'visao', f.root)).data.metrics.totalOperations, base, 'atualizar a tela não conta como análise');
  assert.equal((await chamar(page, 'diagnostico')).data.events.length, eventosAntes, 'consultas frequentes bem-sucedidas não geram diagnóstico');
  const segredo = 'C:\\Users\\segredo\\projeto-privado';
  assert.match((await chamar(page, 'visao', segredo)).error, /PROJECT_NOT_LINKED/);
  await page.click('#ver-diagnostico'); await page.waitForSelector('text=Diagnóstico da interface >> nth=1').catch(() => {});
  const tabela = await page.textContent('#conteudo');
  assert.match(tabela, /projeto:visao/); assert.match(tabela, /PROJECT_NOT_LINKED/); assert.doesNotMatch(tabela, /segredo|projeto-privado/);
  const pastaDiagnostico = path.join(await dadosDaConta(page, dados), 'diagnostico');
  const bruto = fs.readdirSync(pastaDiagnostico).map((n) => fs.readFileSync(path.join(pastaDiagnostico, n), 'utf8')).join('');
  assert.doesNotMatch(bruto, /segredo|projeto-privado|Users/); assert.match(bruto, /"correlationId":"[0-9a-f-]{36}"/);
  assert.equal((await chamar(page, 'visao', f.root)).data.metrics.totalOperations, base, 'diagnóstico fica fora das métricas de QA');
  await dialogos(app, 1); await abrirAjuda(page, 'Privacidade e dados');
  await page.click('#excluir-diagnostico'); await page.waitForSelector('text=Excluídos:');
  assert.equal((await chamar(page, 'diagnostico')).data.events.length, 0);
});
