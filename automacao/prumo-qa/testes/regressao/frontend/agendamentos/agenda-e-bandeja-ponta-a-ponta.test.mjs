import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, escolherPasta, exe, dadosDaConta } from '../../../apoio/janela.mjs';
import { servidorFixture } from '../../../apoio/servicos-fixtures.mjs';
import { fixture } from '../../../apoio/fixtures.mjs';
import { autorizarEscopo } from '../../../../dist/agendamentos/autorizacoes/autorizarEscopo.js';
import { escopoDeCapability } from '../../../../dist/testes/regras/escopoDeCapability.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/criarRotina.js';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';

/**
 * Demonstração ponta a ponta da 2.8 (26 passos), com projeto sintético temporário e um Jira simulado.
 * Honestidade: o consentimento humano de execução (Windows CredUI) não existe em teste automatizado; a AUTORIZAÇÃO usada aqui é gravada
 * pelo runner com um solicitador simulado, exatamente como o broker devolveria. O restante (agenda, worker, processo, evidência,
 * histórico, comentário, bandeja e encerramento) é real. O projeto é criado pelo teste; nenhum projeto externo é lido ou executado.
 */
const confirmar = (app) => app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
const instrumentar = (app, port) => app.evaluate((_, p) => {
  const https = process.getBuiltinModule('node:https'), http = process.getBuiltinModule('node:http'), dns = process.getBuiltinModule('node:dns');
  dns.promises.lookup = async () => ({ address: '93.184.216.34', family: 4 });
  https.request = (url, opcoes, callback) => http.request({ hostname: '127.0.0.1', port: p, path: url.pathname + url.search, method: opcoes.method, headers: { ...opcoes.headers, 'x-fixture-host': url.hostname } }, callback);
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
}, port);
const solicitador = async (esc) => ({ subject: 'pessoa-simulada-pelo-runner', method: 'Windows-CredUI-LogonUser', scopeHash: esc.scopeHash, at: new Date().toISOString() });
const autorizarExecucao = async (projeto, espacoId, capability, ambiente, opcoes, base, solicitar, agora = new Date()) =>
  autorizarEscopo(projeto, espacoId, capability, ambiente, await escopoDeCapability(projeto, capability), opcoes, base, solicitar, agora);
const esperar = async (fn, ms, msg) => { const fim = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > fim) throw new Error('tempo esgotado: ' + msg); await new Promise((r) => setTimeout(r, 500)); } };

test('demonstração: agenda real no laboratório, bandeja, evidência, Jira simulado, isolamento, pausa e saída', { timeout: 240000 }, async (t) => {
  const passos = []; const passo = (n, d, extra = {}) => passos.push({ numero: n, descricao: d, estado: 'PASS', ...extra });
  const dados = novoDados(t); const s = await servidorFixture(t);
  const laboratorio = await fixture(t, { id: 'laboratorio-sintetico', name: 'Laboratório sintético' });
  await laboratorio.write('src/app.mjs', `export const podeGravar = papel => papel === 'Editor';
export const total = valores => valores.reduce((s, valor) => s + valor, 0);
export const validarNome = nome => typeof nome === 'string' && nome.trim().length > 0;
`);
  await laboratorio.write('tests/test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import { podeGravar, total, validarNome } from '../src/app.mjs';
for (const [papel, esperado] of [['Editor', true], ['Leitor', false], ['Administrador', false], ['', false]])
  test('permissão ' + (papel || 'vazia'), () => assert.equal(podeGravar(papel), esperado));
for (const [valores, esperado] of [[[], 0], [[1, 2], 3], [[-1, 1], 0]])
  test('total ' + JSON.stringify(valores), () => assert.equal(total(valores), esperado));
for (const [nome, esperado] of [['QA', true], ['', false], ['  ', false], [null, false]])
  test('nome ' + JSON.stringify(nome), () => assert.equal(validarNome(nome), esperado));
`);
  const lab = laboratorio.root; const outro = await fixture(t);
  const a = await abrir(t, dados, [], {}, { inicio: true }); await instrumentar(a.app, s.port); await confirmar(a.app);
  const pastaDaConta = await dadosDaConta(a.page, dados);
  assert.equal(await a.page.getAttribute('[data-aba=inicio]', 'aria-current'), 'page'); passo(1, 'Prumo aberto na tela Início');
  // 2. Projetos do laboratório e outro projeto independente
  const criar = async (nome, pasta) => { const e = (await a.page.evaluate((n) => window.prumo.espacoCriar({ nome: n, descricao: 'demonstração 2.8' }), nome)).data; await escolherPasta(a.app, pasta); const r = await a.page.evaluate((id) => window.prumo.espacoPasta(id), e.id); assert.equal(r.ok, true, JSON.stringify(r)); return e; };
  const eLab = await criar('PRUMO-LAB', lab); const eOutro = await criar('OUTRO-PROJETO', outro.root);
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${eLab.id}"]`).getByRole('button', { name: 'Selecionar projeto', exact: true }).click(); await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'PRUMO-LAB');
  passo(2, 'Projeto Prumo PRUMO-LAB selecionado (projeto sintético criado em temporário)');
  // 3. Jira simulado vinculado
  const conta = (await a.page.evaluate(() => window.prumo.servicoAdicionar({ servico: 'jira', nome: 'Jira simulado', instancia: 'https://lab.atlassian.net', usuario: 'fixture@example.test', token: 'fixture-secret-28' }))).data;
  const recursos = (await a.page.evaluate((id) => window.prumo.servicoRecursos(id), conta.id)).data.recursos; assert.ok((await a.page.evaluate(([x, y, z]) => window.prumo.servicoVincular(x, y, z), [eLab.id, conta.id, recursos[0]])).ok);
  passo(3, 'Jira simulado (servidor controlado) vinculado ao projeto');
  // 4. Capability de smoke
  const auto = (await a.page.evaluate((id) => window.prumo.espacoAutomacoes(id), eLab.id)).data; assert.ok(auto.capacidades.includes('unit')); assert.equal(auto.readOnly, false); passo(4, 'Capability "unit" (smoke do laboratório) identificada pelo contrato', { capacidades: auto.capacidades });
  // Autorização prévia (consentimento humano simulado pelo runner) e política de publicação aprovada pela interface (confirmação nativa simulada)
  // O aplicativo roda os comandos "node" com ELECTRON_RUN_AS_NODE (faz parte do escopo). Para o runner calcular o MESMO escopo que o app,
  // ele se apresenta como Electron só durante o cálculo; na produção a autorização nasce dentro do próprio aplicativo.
  Object.defineProperty(process.versions, 'electron', { value: '0.0.0-runner', configurable: true });
  try { const projeto = await carregarProjeto(lab); await autorizarExecucao(projeto, eLab.id, 'unit', 'teste', { dias: 1, maxUsos: 5 }, pastaDaConta, solicitador); } finally { delete process.versions.electron; }
  const pol = await a.page.evaluate((id) => window.prumo.agendaPolitica({ espacoId: id, tickets: ['SMART-1'], tipos: ['smoke'], dias: 1, maxPublicacoes: 3 }), eLab.id); assert.equal(pol.ok, true, JSON.stringify(pol));
  // 5. Criar agendamento pela interface (a cada 1 minuto, ancorado na criação)
  await ir(a.page, 'agenda'); await a.page.click('#rotina-nova'); await a.page.fill('#rotina-nome', 'Smoke do laboratório'); await a.page.selectOption('#rotina-tipo', 'smoke'); await a.page.waitForFunction(() => document.querySelector('#rotina-capability').value === 'unit');
  await a.page.fill('#rotina-ticket', 'SMART-1'); await a.page.selectOption('#rotina-ambiente', 'teste'); await a.page.selectOption('#rotina-freq', 'intervalo'); await a.page.fill('#rotina-minutos', '1'); await a.page.fill('#rotina-fuso', 'UTC');
  await a.page.click('#rotina-salvar'); const card = a.page.locator('[data-rotina]'); await card.first().waitFor();
  // 6. Próxima execução
  const lista = (await a.page.evaluate(() => window.prumo.agendaListar())).data; assert.equal(lista.length, 1); const rotina = lista[0]; assert.ok(rotina.proximaExecucao); assert.ok(Date.parse(rotina.proximaExecucao) > Date.now() - 1000);
  assert.equal(await a.page.locator('#rotinas-tabela th').filter({ hasText: 'Próxima execução' }).count(), 1); assert.equal(await card.first().locator('td').nth(4).textContent(), await a.page.evaluate((em) => hora(em), rotina.proximaExecucao)); assert.ok(rotina.autorizacoes.some((x) => x.estado === 'VIGENTE')); passo(5, 'Rotina criada pela interface'); passo(6, 'Próxima execução calculada', { proxima: rotina.proximaExecucao });
  // 7-8. Fechar a janela; Prumo e worker seguem na bandeja
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false); passo(7, 'Janela fechada');
  const estado = () => a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('window.prumo.workerEstado()')).then((r) => r.data);
  const w0 = await estado(); assert.equal(w0.executando, true); assert.equal(w0.bandeja, true); assert.equal(w0.trava.vivo, true); passo(8, 'Prumo ativo na bandeja com o worker vivo', { pid: w0.trava.pid });
  // 9-11. Disparo real pelo worker, processo real e evidência real
  const execs = () => a.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`window.prumo.execucoes({espacoId:'${id}'})`), eLab.id).then((r) => r.data.execucoes);
  const feita = await esperar(async () => (await execs()).find((x) => x.estado === 'CONCLUIDO'), 120000, 'disparo da rotina pelo worker');
  assert.equal(feita.origem, 'AGENDA'); assert.equal(feita.resultado.status, 'PASS', JSON.stringify(feita.resultado)); assert.equal(feita.executor, 'Prumo (agenda)'); passo(9, 'Worker disparou a rotina sem a janela aberta', { slot: feita.slot, inicio: feita.inicio });
  passo(10, 'Teste autorizado executado de verdade (11 testes do laboratório)', { duracaoMs: feita.duracaoMs });
  const evArq = path.join(lab, '.prumo', 'evidencias', feita.evidenciaId + '.json'); assert.ok(fs.existsSync(evArq)); const ev = JSON.parse(JSON.parse(fs.readFileSync(evArq, 'utf8')).payload);
  assert.equal(ev.executed, true); assert.equal(ev.exitCode, 0); assert.match(ev.stdout, /pass/i); assert.match(ev.stdout, /tests\s+11/i); assert.match(ev.stdout, /fail\s+0/i); assert.equal(ev.approval.method, 'delegada:Windows-CredUI-LogonUser'); assert.equal(ev.evidenceScope, 'round');
  passo(11, 'Resultado real e evidência íntegra (hash) gravados no projeto', { evidenciaId: feita.evidenciaId, escopo: 'rodada (o runner não reporta cenários individuais)' });
  passo(12, 'Histórico registrado: tentativas e duração', { tentativas: feita.tentativas.length });
  // 13-16. Reabrir a janela e consultar execução, evidência e logs
  await a.app.evaluate(({ app }) => app.emit('second-instance')); await a.page.waitForFunction(() => document.visibilityState === 'visible'); passo(13, 'Janela reaberta pelo caminho da bandeja');
  await ir(a.page, 'execucoes'); await a.page.locator(`tr[data-exec="${feita.id}"]`).waitFor(); assert.match(await a.page.locator(`tr[data-exec="${feita.id}"]`).textContent(), /PASS/); passo(14, 'Execução visível em Execuções, no projeto selecionado');
  await a.page.locator(`tr[data-exec="${feita.id}"] td.ds-acao button`).click(); await a.page.locator('#qualidade-dialog[open] [role=tab]', { hasText: 'Evidências' }).click();
  await a.page.waitForFunction((id) => document.querySelector('#qualidade-dialog').textContent.includes(id.slice(0, 8)), feita.evidenciaId); passo(15, 'Evidência consultada na interface (dentro da execução)'); passo(16, 'Log da execução (stdout redigido) disponível na evidência');
  // 17-19. Comentário Jira: publicado pela política aprovada; repetir não duplica
  await esperar(async () => s.comentarios.length === 1, 20000, 'comentário Jira'); assert.match(JSON.stringify(s.comentarios[0].body), /Execução: /); assert.match(JSON.stringify(s.comentarios[0].body), /não altera o status do ticket/);
  const aposRun = (await execs()).find((x) => x.id === feita.id); assert.equal(aposRun.jira.estado, 'PUBLICADO'); passo(17, 'Comentário preparado (política aprovada) com o texto estruturado'); passo(18, 'Publicação no Jira simulado confirmada com id remoto', { comentarioId: aposRun.jira.comentarioId });
  const repetido = await a.page.evaluate((id) => window.prumo.jiraPublicar(id), feita.id); assert.equal(repetido.data.estado, 'PUBLICADO'); assert.equal(s.comentarios.length, 1); passo(19, 'Repetir a publicação não criou comentário duplicado');
  // 20-21. Trocar de projeto: nada do laboratório aparece
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${eOutro.id}"]`).getByRole('button', { name: 'Selecionar projeto', exact: true }).click(); await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'OUTRO-PROJETO');
  await ir(a.page, 'execucoes'); await a.page.locator('#runs-vazio').waitFor(); assert.doesNotMatch(await a.page.textContent('#conteudo'), /Smoke do laboratório/); assert.equal(await a.page.locator('#runs-tabela').count(), 0);
  assert.equal((await a.page.evaluate((id) => window.prumo.metricasExecucoes(id), eOutro.id)).data.execucoes, 0); assert.equal(fs.existsSync(path.join(outro.root, '.prumo', 'evidencias')), false); passo(20, 'Troca para OUTRO-PROJETO'); passo(21, 'Isolamento confirmado: nenhuma execução, evidência ou métrica do laboratório no outro projeto');
  // 22-24. Pausar a agenda: a próxima execução não começa; ao retomar, o horário perdido (tolerância 0) é registrado como PERDIDO
  const pausada = criarRotina({ nome: 'Única durante a pausa', espacoId: eLab.id, tipo: 'smoke', capability: 'unit', ambiente: 'teste', toleranciaMinutos: 0, frequencia: { tipo: 'unico', em: new Date(Date.now() + 8000).toISOString().replace('Z', '+00:00') }, fuso: 'UTC' }, pastaDaConta);
  assert.equal((await a.page.evaluate(() => window.prumo.workerPausa(true))).data.pausado, true); const antes = (await execs()).length;
  await new Promise((r) => setTimeout(r, 16000)); assert.equal((await execs()).filter((x) => x.rotinaId === pausada.id).length, 0, 'nada foi criado ou executado durante a pausa'); passo(22, 'Agenda pausada pela API da bandeja'); passo(23, 'Com a agenda pausada o horário da segunda rotina passou sem execução', { execucoesAntes: antes });
  assert.equal((await a.page.evaluate(() => window.prumo.workerPausa(false))).data.pausado, false);
  const perdido = await esperar(async () => (await execs()).find((x) => x.rotinaId === pausada.id), 30000, 'registro do horário perdido'); assert.equal(perdido.estado, 'PERDIDO'); assert.equal(perdido.resultado.status, 'NOT_RUN'); assert.match(perdido.resultado.motivo, /nada foi executado/i); passo(24, 'Retomada: o horário perdido ficou PERDIDO/NOT_RUN, nunca como executado');
  // 25-26. Sair pela bandeja encerra o app e libera a trava
  const saiu = new Promise((ok) => a.app.process().once('exit', ok)); await a.app.evaluate(({ app }) => app.quit()); await Promise.race([saiu, new Promise((_, no) => setTimeout(() => no(new Error('não encerrou')), 25000))]); passo(25, 'Prumo encerrado por "Sair"');
  const trava = JSON.parse(fs.readFileSync(path.join(pastaDaConta, 'plataforma', 'worker-trava.json'), 'utf8')); assert.equal(trava.ativo, false); let vivo = true; try { process.kill(w0.trava.pid, 0); } catch { vivo = false; } assert.equal(vivo, false, 'processo principal não existe mais'); passo(26, 'Trava liberada e processo encerrado');
  assert.doesNotMatch(fs.readFileSync(path.join(pastaDaConta, 'plataforma', 'publicacoes-jira.json'), 'utf8') + fs.readFileSync(path.join(pastaDaConta, 'plataforma', 'fila.json'), 'utf8'), /fixture-secret-28/);
  assert.deepEqual(a.erros, []);
  const relatorios = path.join(dados, 'evidencias-2.8'); fs.mkdirSync(relatorios, { recursive: true }); fs.writeFileSync(path.join(relatorios, 'demonstracao-' + (exe ? 'instalado' : 'desenvolvimento') + '.json'), JSON.stringify({ versao: JSON.parse(fs.readFileSync('package.json', 'utf8')).version, laboratorio: 'Projeto sintético temporário', observacao: 'Autorização humana de execução simulada pelo runner; demais etapas reais.', passos }, null, 2));
});
