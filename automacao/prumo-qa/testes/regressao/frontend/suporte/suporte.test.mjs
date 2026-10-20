import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { novoDados, abrir, ir, exe } from '../../../apoio/janela.mjs';

/** Sino/som/preferências e central de Suporte na janela real. Servidor de atualização local (só fora do pacote) e navegador simulado: nada sai da máquina. */
const chamar = (page, fn, ...args) => page.evaluate(([f, a]) => window.prumo[f](...a), [fn, args]);
const dialogos = (app, resposta) => app.evaluate(({ dialog }, r) => { dialog.showMessageBox = async () => ({ response: r, checkboxChecked: false }); }, resposta);
const servidor = async (t, tag = 'v99.0.0') => {
  let pedidos = 0; const srv = http.createServer((req, res) => {
    pedidos++; res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ tag_name: tag, html_url: 'https://evil.example/x', body: '## Novidades\n- Correção importante\n- Segurança reforçada\n- Compatibilidade mantida', draft: false, prerelease: false }));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); t.after(() => srv.close());
  return { env: { PRUMO_UPDATE_TEST_URL: `http://127.0.0.1:${srv.address().port}/latest` }, pedidos: () => pedidos, fechar: () => srv.close() };
};
const ponto = (page) => page.locator('#sino-ponto').isVisible();
const sons = (page) => page.evaluate(() => window.__prumoSom || 0);

test('sino: sem novidade não acende; versão nova acende, mostra resumo por mouse e teclado, e o clique abre as notas e marca como vista', async (t) => {
  if (exe) return t.skip('servidor de teste só é aceito fora do pacote');
  const s = await servidor(t); const dados = novoDados(t);
  const { app, page, erros } = await abrir(t, dados, [], s.env);
  assert.equal(await ponto(page), false); assert.match(await page.getAttribute('#sino', 'aria-label'), /nenhuma novidade/);
  assert.equal(s.pedidos(), 0, 'nada é consultado ao abrir com o aviso automático desligado');
  await abrirVerificacao(page);
  assert.equal(await ponto(page), true); assert.match(await page.getAttribute('#sino', 'aria-label'), /99\.0\.0/);
  // mouse
  await page.hover('#sino'); await page.waitForSelector('#sino-dica:not([hidden])');
  let dica = await page.textContent('#sino-dica'); assert.match(dica, /99\.0\.0/); assert.match(dica, /Correção importante/); assert.doesNotMatch(dica, /undefined|NaN/);
  await page.mouse.move(5, 300); await page.waitForSelector('#sino-dica', { state: 'hidden' });
  // teclado: foco mostra, Escape esconde
  await page.focus('#sino'); await page.waitForSelector('#sino-dica:not([hidden])'); await page.keyboard.press('Escape'); await page.waitForSelector('#sino-dica', { state: 'hidden' });
  assert.equal(await page.evaluate(() => document.querySelector('#sino').tagName), 'BUTTON', 'é um botão nativo, alcançável por Tab');
  // clique: abre Ajuda › Atualizações com as notas e apaga o indicador
  await page.click('#sino'); await page.waitForSelector('#ultima-conhecida');
  assert.match(await page.textContent('article'), /Segurança reforçada/); assert.equal(await ponto(page), false);
  assert.deepEqual(erros, []);
  // persistência: reabrir sem rede continua sem indicador (versão vista), e sem consulta alguma
  await app.close(); s.fechar(); const r2 = await abrir(t, dados, [], s.env);
  assert.equal(await ponto(r2.page), false);
});

test('indicador persiste offline quando a versão ainda não foi vista', async (t) => {
  if (exe) return t.skip('servidor de teste só é aceito fora do pacote');
  const s = await servidor(t); const dados = novoDados(t);
  const a = await abrir(t, dados, [], s.env); await abrirVerificacao(a.page); assert.equal(await ponto(a.page), true);
  await a.app.close(); s.fechar();
  const b = await abrir(t, dados, ['--proxy-server=127.0.0.1:9'], {}); // sem rede nem servidor
  assert.equal(await ponto(b.page), true, 'o indicador vem do arquivo local, não da rede');
});

test('som: toca uma única vez por versão (nem na consulta seguinte nem ao reabrir); silenciar e som desligado não tocam', async (t) => {
  if (exe) return t.skip('servidor de teste só é aceito fora do pacote');
  const s = await servidor(t); const dados = novoDados(t);
  const auto = { ...s.env, PRUMO_SEM_AVISO_AUTOMATICO: '0' };
  let w = await abrir(t, dados, [], s.env);
  assert.equal((await chamar(w.page, 'salvarPreferencias', { som: true })).ok, true);
  await w.app.close();
  // 1ª abertura com o aviso automático (padrão ligado): toca uma vez
  w = await abrir(t, dados, [], auto); await w.page.waitForFunction(() => window.__prumoSom === 1, null, { timeout: 20000 });
  assert.equal(await ponto(w.page), true);
  // nova consulta manual na mesma sessão: não repete
  await abrirVerificacao(w.page); await w.page.waitForTimeout(500); assert.equal(await sons(w.page), 1);
  // reabrir (a versão ainda não foi vista, o indicador volta, mas o som já foi dado): não repete
  await w.app.close(); w = await abrir(t, dados, [], auto); await w.page.waitForSelector('#sino-ponto:not([hidden])'); await esperarPedidos(s, 3); await w.page.waitForTimeout(3500);
  assert.equal(await sons(w.page), 0, 'o som não repete ao reabrir');
  assert.equal(s.pedidos(), 3, 'uma consulta automática por abertura + uma manual');
  // silenciar
  const d2 = novoDados(t); let q = await abrir(t, d2, [], s.env);
  await chamar(q.page, 'salvarPreferencias', { som: true, silenciar: true }); await q.app.close();
  q = await abrir(t, d2, [], auto); await q.page.waitForSelector('#sino-ponto:not([hidden])', { timeout: 20000 }); await q.page.waitForTimeout(3500); assert.equal(await sons(q.page), 0, 'silenciado');
  // som desligado (padrão)
  const d3 = novoDados(t); let z = await abrir(t, d3, [], s.env); await abrirVerificacao(z.page); await z.page.waitForTimeout(500); assert.equal(await sons(z.page), 0, 'som desligado por padrão');
});

test('aviso automático (2.10.1): ligado por padrão, consulta ao abrir, acende o sino e avisa uma vez por versão; desligado não consulta', async (t) => {
  if (exe) return t.skip('servidor de teste só é aceito fora do pacote');
  const s = await servidor(t); const dados = novoDados(t); const auto = { ...s.env, PRUMO_SEM_AVISO_AUTOMATICO: '0' };
  let w = await abrir(t, dados, [], auto);
  assert.equal((await chamar(w.page, 'preferencias')).data.preferencias.avisoAutomatico, true, 'ligado por padrão');
  await w.page.waitForSelector('#sino-ponto:not([hidden])', { timeout: 20000 }); assert.equal(s.pedidos(), 1, 'uma consulta ao abrir');
  const eventos = async (page) => (await chamar(page, 'workerEventos', 0)).data.eventos.filter((e) => e.tipo === 'ATUALIZACAO_DISPONIVEL');
  const ev = await eventos(w.page); assert.equal(ev.length, 1); assert.match(ev[0].titulo, /99\.0\.0/); assert.equal(ev[0].destino, 'atualizacoes');
  await w.page.waitForFunction(() => /99\.0\.0 disponível/.test(document.querySelector('#aviso').textContent));
  // reabrir: consulta de novo, mas não avisa a mesma versão outra vez
  await w.app.close(); w = await abrir(t, dados, [], auto); await esperarPedidos(s, 2); await w.page.waitForTimeout(3500);
  assert.equal((await eventos(w.page)).length, 0, 'a mesma versão não é avisada duas vezes');
  // desligar pela interface: nenhuma consulta ao abrir
  await abrirAjudaItem(w.page, 'Atualizações'); assert.equal(await w.page.isChecked('#pref-avisoAutomatico'), true);
  await w.page.uncheck('#pref-avisoAutomatico'); await w.page.waitForFunction(async () => (await window.prumo.preferencias()).data.preferencias.avisoAutomatico === false);
  await w.app.close(); w = await abrir(t, dados, [], auto); await w.page.waitForTimeout(6000);
  assert.equal(s.pedidos(), 2, 'desligado: nada é consultado ao abrir');
});

test('preferências: padrão seguro, alteração pela interface, persistência e recusa de campos desconhecidos', async (t) => {
  const dados = novoDados(t); let w = await abrir(t, dados);
  const p0 = (await chamar(w.page, 'preferencias')).data.preferencias; assert.equal(p0.verificarAoIniciar, false); assert.equal(p0.som, false); assert.equal(p0.silenciar, false);
  await abrirAjudaItem(w.page, 'Atualizações'); await w.page.check('#pref-som');
  await w.page.waitForFunction(async () => (await window.prumo.preferencias()).data.preferencias.som === true);
  assert.equal((await chamar(w.page, 'salvarPreferencias', { versaoVisualizada: '9.9.9' })).ok, false, 'a interface não altera versões diretamente');
  assert.equal((await chamar(w.page, 'salvarPreferencias', { som: 'sim' })).ok, false);
  await w.app.close(); w = await abrir(t, dados); assert.equal((await chamar(w.page, 'preferencias')).data.preferencias.som, true);
});

test('Suporte: revisão, bloqueio de segredo, confirmação nativa antes de abrir o GitHub, exportação local e nada anexado sem marcação', async (t) => {
  const dados = novoDados(t); const { app, page, erros } = await abrir(t, dados);
  await app.evaluate(({ shell }) => { globalThis.__abertas = []; shell.openExternal = async (u) => { globalThis.__abertas.push(u); }; });
  await ir(page, 'suporte'); assert.match(await page.textContent('#aviso-publico'), /vai só para a equipe do Prumo QA/);
  assert.doesNotMatch(await page.textContent('#conteudo'), /@gmail|mailto:/);
  const preencher = async (desc) => { await page.selectOption('#sup-categoria', 'bug'); await page.fill('#sup-titulo', 'Botão não responde'); await page.fill('#sup-descricao', desc); await page.fill('#sup-passos', '1. Abrir\n2. Clicar'); };
  await preencher('Ao clicar em Verificar nada acontece.');
  await page.click('#sup-revisar'); await page.waitForTimeout(300);
  assert.equal(await page.locator('#sup-previa').count(), 0, 'sem entender que a issue é pública não há revisão');
  await page.check('#sup-consentimento'); await page.click('#sup-revisar'); await page.waitForSelector('#sup-previa');
  const previa = await page.textContent('#sup-previa'); assert.match(previa, /Prumo QA \d+\.\d+\.\d+/); assert.doesNotMatch(previa, /Sistema:|Diagnóstico/);
  // cancelar a confirmação nativa não abre nada
  await dialogos(app, 0); await page.click('#sup-abrir'); await page.waitForTimeout(400);
  assert.deepEqual(await app.evaluate(() => globalThis.__abertas), []);
  await dialogos(app, 1); await page.click('#sup-abrir'); await page.waitForTimeout(400);
  const abertas = await app.evaluate(() => globalThis.__abertas); assert.equal(abertas.length, 1);
  const u = new URL(abertas[0]); assert.equal(u.origin + u.pathname, 'https://github.com/AnaPLysyk/Prumo-Qa/issues/new'); assert.equal(u.searchParams.get('template'), 'bug.yml');
  assert.match(u.searchParams.get('descricao'), /nada acontece/); assert.ok(!u.searchParams.get('ambiente').includes('Sistema'), 'sistema não autorizado');
  // exportação local, sem GitHub
  const destino = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-sup-')), 'relato.md'); t.after(() => fs.rmSync(path.dirname(destino), { recursive: true, force: true }));
  await app.evaluate(({ dialog }, d) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: d }); }, destino);
  await page.click('#sup-exportar'); await page.waitForTimeout(400);
  assert.match(fs.readFileSync(destino, 'utf8'), /# \[Bug\] Botão não responde[\s\S]*nada acontece/); assert.equal((await app.evaluate(() => globalThis.__abertas)).length, 1, 'exportar não abre o GitHub');
  // segredo bloqueia: nem abrir nem exportar, e o segredo não é repetido
  const token = 'ghp_' + 'Zz9Yy8Xx7Ww6Vv5Uu4Tt';
  await preencher(`Meu token é ${token} e falhou.`); await page.click('#sup-revisar'); await page.waitForSelector('#sup-bloqueios');
  assert.equal(await page.locator('#sup-abrir').isDisabled(), true); assert.equal(await page.locator('#sup-exportar').isDisabled(), true);
  assert.ok(!(await page.textContent('#conteudo')).includes(token) || (await page.inputValue('#sup-descricao')).includes(token), 'o texto digitado permanece no campo, mas a revisão não repete o segredo');
  assert.equal(await page.locator('#sup-bloqueios').textContent().then((x) => x.includes(token)), false);
  // pela API direta, o processo principal também recusa
  const r = await chamar(page, 'suporteAbrir', { categoria: 'bug', titulo: 'Titulo valido', descricao: `senha=hunter2abc ${token}`, passos: 'passos aqui', consentimento: true });
  assert.equal(r.ok, false); assert.match(r.error, /SUPPORT_BLOCKED_SECRET/); assert.equal((await app.evaluate(() => globalThis.__abertas)).length, 1);
  // sem consentimento a API recusa; campos extras também (esquema estrito)
  assert.equal((await chamar(page, 'suportePreparar', { categoria: 'bug', titulo: 'Titulo valido', descricao: 'Descrição longa o bastante', passos: 'x', consentimento: false })).ok, false);
  assert.equal((await chamar(page, 'suportePreparar', { categoria: 'bug', titulo: 'Titulo valido', descricao: 'Descrição longa o bastante', passos: 'x', consentimento: true, url: 'https://evil.example' })).ok, false, 'a página não escolhe o destino');
  assert.deepEqual(erros, []);
});

test('Suporte: sistema e diagnóstico só entram quando marcados', async (t) => {
  const dados = novoDados(t); const { page } = await abrir(t, dados);
  await ir(page, 'suporte'); await page.fill('#sup-titulo', 'Pedido de melhoria'); await page.selectOption('#sup-categoria', 'melhoria'); await page.fill('#sup-descricao', 'Gostaria de um atalho de teclado.');
  await page.check('#sup-sistema'); await page.check('#sup-diagnostico'); await page.check('#sup-consentimento'); await page.click('#sup-revisar'); await page.waitForSelector('#sup-previa');
  const previa = await page.textContent('#sup-previa'); assert.match(previa, /Sistema: /); assert.match(previa, /Diagnóstico da interface \(somente metadados\)/);
  assert.doesNotMatch(previa, /[A-Z]:\\|projects?\/|\.prumo/i, 'sem caminhos locais');
});

async function esperarPedidos(s, n) { for (let i = 0; i < 100 && s.pedidos() < n; i++) await new Promise((r) => setTimeout(r, 200)); }
async function abrirVerificacao(page) { await abrirAjudaItem(page, 'Atualizações'); await page.click('#verificar-atualizacao'); await page.waitForSelector('#saida-atualizacao .estado'); }
async function abrirAjudaItem(page, titulo) { await ir(page, 'ajuda'); await page.click(`.indice button:has-text("${titulo}")`); await page.waitForSelector('article h1'); }
