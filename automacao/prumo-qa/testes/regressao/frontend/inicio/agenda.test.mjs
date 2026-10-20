import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { repo, exe, abrir, novoDados, ir, ajustes, dadosDaConta } from '../../../apoio/janela.mjs';
import { dicaDaBandeja as dicaBandeja } from '../../../../dist/aplicativo/bandeja/dicaDaBandeja.js';
import { itensDoMenuDaBandeja as modeloMenuBandeja } from '../../../../dist/aplicativo/bandeja/itensDoMenuDaBandeja.js';
import { resumoDoWorker as resumoEstado } from '../../../../dist/aplicativo/bandeja/resumoDoWorker.js';
import { textoNoIdioma as tm } from '../../../../dist/aplicativo/bandeja/textoNoIdioma.js';

const capturar = (page, nome) => { fs.mkdirSync('tmp/evidencias/telas', { recursive: true }); return page.screenshot({ path: 'tmp/evidencias/telas/' + nome + '.png' }); };
const token = (page, nome) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nome);

test('Configurações começam fechadas, abrem em Meu perfil, têm três abas e fecham por Escape', async (t) => {
  const a = await abrir(t, novoDados(t), [], {}, { inicio: true });
  assert.equal(await a.page.isVisible('#controles'), false);
  await a.page.click('#ajustes');
  await a.page.waitForSelector('#controles', { state: 'visible' });
  assert.deepEqual(await a.page.locator('#ajustes-abas [role=tab]').allTextContents(), ['Meu perfil', 'Aparência', 'Assistente']);
  assert.equal(await a.page.getAttribute('[data-ajustes-aba=perfil]', 'aria-selected'), 'true', 'abre em Meu perfil');
  for (const id of ['#ia-pessoa', '#ia-papel', '#ia-experiencia', '#ia-foco', '#ia-compartilhar']) assert.equal(await a.page.isVisible(id), true, id);
  assert.equal(await a.page.isVisible('#tema'), false, 'tema fica em Aparência');
  await a.page.click('[data-ajustes-aba=aparencia]'); assert.equal(await a.page.isVisible('#tema'), true); assert.equal(await a.page.isVisible('#ia-pessoa'), false);
  await a.page.click('[data-ajustes-aba=assistente]'); assert.equal(await a.page.isVisible('#ia-nome'), true);
  await a.page.keyboard.press('Escape');
  assert.equal(await a.page.isVisible('#controles'), false);
  assert.equal(await a.page.getAttribute('#ajustes', 'aria-expanded'), 'false');
  assert.deepEqual(a.erros, []);
});

test('Meu perfil: salva nome, papel, experiência, foco e o compartilhamento; os agentes passam a conhecer a pessoa', async (t) => {
  const a = await abrir(t, novoDados(t), [], {}, { inicio: true }); const p = a.page;
  await p.click('#ajustes'); await p.waitForSelector('#ia-pessoa');
  await p.fill('#ia-pessoa', 'Ana'); await p.selectOption('#ia-papel', 'qa'); await p.selectOption('#ia-experiencia', 'avancado');
  await p.fill('#ia-foco', 'automação de API e regressão'); await p.locator('#ia-foco').blur();
  assert.equal(await p.textContent('.ajuste-contador'), '28/160', 'contador de caracteres do foco');
  await p.waitForFunction(() => /Perfil salvo/.test(document.querySelector('#ia-perfil-estado')?.textContent || ''));
  await p.check('#ia-compartilhar'); await p.waitForTimeout(300);
  const salvo = (await p.evaluate(() => window.prumo.perfilObter())).data;
  assert.deepEqual({ ...salvo, atualizadoEm: null }, { comoChamar: 'Ana', papel: 'qa', experiencia: 'avancado', foco: 'automação de API e regressão', compartilharComIa: true, atualizadoEm: null });
  // Conta: sem login o painel explica; o botão leva à explicação
  assert.match(await p.textContent('#ia-conta'), /Admin Teste/); await p.click('#ia-abrir-conta'); await p.locator('#qualidade-dialog[open]').waitFor(); assert.match(await p.textContent('#qualidade-dialog'), /admin-teste/);
  await p.keyboard.press('Escape');
  // O assistente abre a conversa pelo nome e mostra o foco
  const abertura = (await p.evaluate(() => window.prumo.assistenteAbertura(null))).data;
  assert.match(abertura.linhas.join(' '), /Oi, Ana!/); assert.match(abertura.linhas.join(' '), /Vou priorizar automação de API e regressão/);
  // Entrada inválida é recusada pelo contrato e o painel volta ao que está salvo
  assert.equal((await p.evaluate(() => window.prumo.perfilSalvar({ experiencia: 'mestre' }))).ok, false);
  assert.equal((await p.evaluate(() => window.prumo.perfilSalvar({ foco: 'x'.repeat(161) }))).ok, false);
  await capturar(p, 'configuracoes-meu-perfil');
  assert.deepEqual(a.erros, []);
});

test('Início com esfera Quality Control: parada quando nada roda; tema e idioma persistem entre reinicializações', async (t) => {
  const dados = novoDados(t); let a = await abrir(t, dados, [], {}, { inicio: true });
  assert.equal(await a.page.getAttribute('[data-aba=inicio]', 'aria-current'), 'page');
  assert.equal((await a.page.textContent('#conteudo h1')).trim(), 'Prumo QA');
  assert.equal(await a.page.getAttribute('#conteudo .qc-campo', 'data-estado'), 'ocioso', 'sem trabalho real a esfera não pode parecer ocupada');
  assert.match(await a.page.textContent('#worker-estado'), /Worker ativo/); assert.equal(await a.page.getAttribute('#worker-estado', 'data-nivel'), 'ok');
  // Os três temas
  await ajustes(a.page); await a.page.selectOption('#tema', 'claro'); assert.equal(await a.page.evaluate(() => document.documentElement.dataset.tema), 'claro'); assert.equal(await token(a.page, '--fundo'), '#f5f8fc');
  await ajustes(a.page); await a.page.selectOption('#tema', 'escuro'); assert.equal(await token(a.page, '--fundo'), '#040712');
  await ajustes(a.page); await a.page.selectOption('#tema', 'sistema');
  await a.page.emulateMedia({ colorScheme: 'light' }); assert.equal(await token(a.page, '--fundo'), '#f5f8fc', 'sistema claro');
  await a.page.emulateMedia({ colorScheme: 'dark' }); assert.equal(await token(a.page, '--fundo'), '#040712', 'sistema escuro');
  // Persistência por usuário (preferencias.json), inclusive após reiniciar
  await ajustes(a.page); await a.page.selectOption('#tema', 'claro'); await ajustes(a.page); await a.page.selectOption('#idioma', 'en');
  await a.page.waitForFunction(() => document.querySelector('[data-aba=inicio]').textContent.trim() === 'Home');
  const salvo = JSON.parse(fs.readFileSync(path.join(await dadosDaConta(a.page, dados), 'preferencias.json'), 'utf8')); assert.equal(salvo.tema, 'claro'); assert.equal(salvo.idioma, 'en'); assert.equal(salvo.iniciarComWindows, false, 'iniciar com o Windows nunca é ligado por padrão');
  assert.deepEqual(a.erros, []); await a.fechar();
  a = await abrir(t, dados, [], {}, { inicio: true });
  await a.page.waitForFunction(() => document.documentElement.dataset.tema === 'claro' && document.querySelector('[data-aba=agenda]').textContent.trim() === 'Schedules');
  assert.equal(await a.page.evaluate(() => document.documentElement.lang), 'en'); assert.equal(await a.page.inputValue('#idioma'), 'en'); assert.equal(await a.page.inputValue('#tema'), 'claro');
  await ajustes(a.page); await a.page.selectOption('#idioma', 'pt-BR'); await a.page.waitForFunction(() => document.querySelector('[data-aba=agenda]').textContent.trim() === 'Agendamentos'); assert.deepEqual(a.erros, []);
});

test('esfera só anima com trabalho real e respeita redução de movimento; foco de teclado visível; reflow a 200% e 400%', async (t) => {
  const dados = novoDados(t); const a = await abrir(t, dados, [], {}, { inicio: true }); await a.page.waitForSelector('#conteudo .qc-orb');
  const anim = () => a.page.evaluate(() => getComputedStyle(document.querySelector('#conteudo .qc-orb'), '::before').animationName);
  assert.equal(await anim(), 'none', 'parada: sem animação');
  await a.page.evaluate(() => qc.definirEstado('executando')); assert.equal(await anim(), 'qc-giro', 'executando: anel gira');
  await a.page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await anim(), 'none', 'prefers-reduced-motion desliga o movimento');
  await a.page.emulateMedia({ reducedMotion: 'no-preference' }); await a.page.evaluate(() => qc.definirEstado('ocioso')); assert.equal(await anim(), 'none');
  // Teclado: o primeiro Tab chega a um controle com contorno visível
  await a.page.focus('body'); await a.page.keyboard.press('Tab'); for (let i = 0; i < 12 && !(await a.page.evaluate(() => document.activeElement?.matches('#nav button'))); i++) await a.page.keyboard.press('Tab');
  assert.ok(await a.page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }), 'foco visível');
  await a.page.keyboard.press('Enter');
  // Nomes acessíveis dos controles do cabeçalho
  assert.equal(await a.page.getAttribute('#tema', 'aria-label'), 'Tema'); assert.equal(await a.page.getAttribute('#idioma', 'aria-label'), 'Idioma'); assert.equal(await a.page.getAttribute('#worker-estado', 'role'), 'status');
  assert.ok(!(await a.page.evaluate(() => document.querySelector('.qc-orb').getAttribute('alt'))), 'esfera decorativa não tem texto alternativo próprio'); // o rótulo fica na imagem do campo
  for (const zoom of [2, 4]) {
    await a.app.evaluate(({ BrowserWindow }, z) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 900); w.webContents.setZoomFactor(z); }, zoom);
    for (const aba of ['inicio', 'agenda', 'execucoes']) { await ir(a.page, aba); assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `reflow ${aba} a ${zoom * 100}%`); }
  }
  await a.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.webContents.setZoomFactor(1); w.setSize(1080, 720); });
  assert.deepEqual(a.erros, []);
});

test('contraste dos tokens (claro e escuro) atende 4,5:1 nos pares de texto', () => {
  const css = fs.readFileSync('dist/renderer/estilo.css', 'utf8');
  const bloco = (re) => Object.fromEntries([...re.exec(css)[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  const escuro = bloco(/:root \{([^}]*)\}/); const claro = bloco(/:root\[data-tema="claro"\] \{([^}]*)\}/);
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const razao = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
  for (const [nome, t] of [['escuro', escuro], ['claro', claro]]) {
    for (const par of [['texto', 'fundo'], ['texto', 'painel'], ['suave', 'fundo'], ['suave', 'painel'], ['acento', 'painel'], ['acento', 'fundo'], ['ok', 'painel'], ['falha', 'painel'], ['aviso', 'painel'], ['neutro', 'painel'], ['acento-texto', 'acento']])
      assert.ok(razao(t[par[0]], t[par[1]]) >= 4.5, `${nome}: ${par[0]} sobre ${par[1]} = ${razao(t[par[0]], t[par[1]]).toFixed(2)}`);
  }
});

test('menu da bandeja: itens exigidos, pausar/retomar exclusivos, estado real e dois idiomas', () => {
  const ativo = { executando: true, pausado: false, emExecucao: null, rotinasAtivas: 2, pendentes: 1, proximaExecucao: null, ultimoErro: null };
  const ids = (e, i) => modeloMenuBandeja(e, i).filter((x) => x.id !== 'separador').map((x) => x.id);
  assert.deepEqual(ids(ativo, 'pt-BR'), ['abrir', 'agenda', 'execucoes', 'pausar', 'estado', 'sair']);
  assert.deepEqual(ids({ ...ativo, pausado: true }, 'pt-BR'), ['abrir', 'agenda', 'execucoes', 'retomar', 'estado', 'sair']);
  const rot = (e, i) => modeloMenuBandeja(e, i).map((x) => x.rotulo);
  assert.deepEqual(rot(ativo, 'pt-BR').filter(Boolean).slice(0, 4), ['Abrir Prumo', 'Ver agendamentos', 'Consultar execuções', 'Pausar agendamentos']); assert.ok(rot(ativo, 'pt-BR').includes('Sair do Prumo'));
  assert.deepEqual(rot({ ...ativo, pausado: true }, 'en').filter(Boolean), ['Open Prumo', 'View schedules', 'View runs', 'Resume schedules', 'Worker state: Schedules paused', 'Quit Prumo']);
  assert.equal(resumoEstado({ ...ativo, executando: false }, 'pt-BR'), 'Worker parado'); assert.equal(resumoEstado({ ...ativo, emExecucao: 'x' }, 'en'), 'Running a routine'); assert.match(dicaBandeja(ativo, 'en'), /active/);
  assert.match(tm('detalheEstado', 'pt-BR', { n: 'x', p: 1, z: 'não', u: 'nenhum' }), /desligado ou suspenso, nada é executado/);
});

test('fechar a janela mantém o Prumo e o worker vivos; segunda instância é recusada; sair encerra e libera a trava', async (t) => {
  const dados = novoDados(t); const a = await abrir(t, dados, [], {}, { inicio: true });
  const estado = () => a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('window.prumo.workerEstado()'));
  assert.equal((await estado()).data.executando, true);
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  const depois = await a.app.evaluate(({ BrowserWindow, app }) => ({ janelas: BrowserWindow.getAllWindows().length, visivel: BrowserWindow.getAllWindows()[0]?.isVisible(), pronto: app.isReady() }));
  assert.deepEqual(depois, { janelas: 1, visivel: false, pronto: true }, 'janela só foi escondida');
  const w = (await estado()).data; assert.equal(w.executando, true, 'worker segue ativo com a janela fechada'); assert.equal(w.trava.vivo, true); assert.equal(w.bandeja, true, 'ícone da bandeja existe');
  // Segunda instância sobre os mesmos dados: encerra sozinha, sem criar outro worker/janela
  const env = { ...process.env, PRUMO_DATA_DIR: dados }; delete env.ELECTRON_RUN_AS_NODE;
  const segunda = spawn(exe ?? electronPath, exe ? [] : [repo], { env, stdio: 'ignore' }); const codigo = await new Promise((ok) => { const x = setTimeout(() => { segunda.kill(); ok('travou'); }, 20000); segunda.on('exit', (c) => { clearTimeout(x); ok(c); }); });
  assert.equal(codigo, 0, 'a segunda instância saiu por conta própria'); assert.equal(await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  // Reabrir pelo "ícone": o mesmo caminho da segunda instância restaura a janela escondida
  await a.app.evaluate(({ app }) => app.emit('second-instance')); await a.page.waitForFunction(() => document.visibilityState === 'visible');
  assert.equal(await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  // Pausar/retomar pela mesma ação da bandeja e da janela
  assert.equal((await a.page.evaluate(() => window.prumo.workerPausa(true))).data.pausado, true); assert.equal((await a.page.evaluate(() => window.prumo.workerEstado())).data.pausado, true);
  assert.equal((await a.page.evaluate(() => window.prumo.workerPausa(false))).data.pausado, false);
  // Captura o diretório antes de fechar a janela; depois do encerramento a página não responde.
  const pastaDaConta = await dadosDaConta(a.page, dados);
  // Sair: encerra o processo e libera a trava, com registro do encerramento controlado
  const saiu = new Promise((ok) => a.app.process().once('exit', ok)); await a.app.evaluate(({ app }) => app.quit()); await Promise.race([saiu, new Promise((_, no) => setTimeout(() => no(new Error('não encerrou')), 20000))]);
  const trava = JSON.parse(fs.readFileSync(path.join(pastaDaConta, 'plataforma', 'worker-trava.json'), 'utf8')); assert.equal(trava.ativo, false, 'trava liberada ao sair');
});
