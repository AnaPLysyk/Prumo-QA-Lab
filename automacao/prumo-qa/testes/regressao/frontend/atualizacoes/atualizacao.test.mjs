import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { versao, novoDados, abrir, ir } from '../../../apoio/janela.mjs';

/** Aplicativo real consultando um servidor de teste em 127.0.0.1: cada falha de consulta é diagnosticada e nunca vira "atualizado". */
const verificar = async (page) => { await page.click('text=Verificar atualizações'); await page.waitForSelector('#saida-atualizacao .estado', { timeout: 20000 }); await page.waitForTimeout(200); return { selo: (await page.textContent('#saida-atualizacao .estado')).trim(), texto: await page.textContent('#saida-atualizacao') }; };

test('consulta de atualização: disponível, limite de consultas, recusa, erro do servidor, rede e sem resposta; falha preserva o aviso e não repete sozinha', async (t) => {
  let modo = 'nova'; const pedidos = [];
  const srv = http.createServer((req, res) => {
    pedidos.push({ m: req.method, a: req.headers.authorization, c: req.headers.cookie });
    if (modo === 'mudo') return; // nunca responde
    if (modo === '429') { res.writeHead(429, { 'retry-after': '120' }); return res.end('{}'); }
    if (modo === '403cota') { res.writeHead(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) }); return res.end('{}'); }
    if (modo === '403') { res.writeHead(403); return res.end('{}'); }
    if (modo === '503') { res.writeHead(503); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ tag_name: modo === 'igual' ? 'v' + versao : 'v99.0.0', html_url: 'https://github.com/AnaPLysyk/Prumo-Qa/releases/tag/v99.0.0', body: '- novidade', draft: false, prerelease: false }));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); t.after(() => srv.close());
  const { page, erros } = await abrir(t, novoDados(t), [], { PRUMO_UPDATE_TEST_URL: `http://127.0.0.1:${srv.address().port}/latest` });
  await ir(page, 'ajuda'); await page.click('.indice button:has-text("Atualizações")');
  await page.waitForTimeout(1500); assert.equal(pedidos.length, 0, 'nada é consultado sem o clique (consulta automática desligada por padrão)');
  // 1. Existe atualização
  let r = await verificar(page); assert.equal(r.selo, 'ATUALIZAÇÃO DISPONÍVEL'); assert.match(r.texto, /99\.0\.0/); assert.equal(await page.locator('#consulta-nao-concluida').count(), 0);
  // 2. Falhas: cada uma diz o que houve, nunca "atualizado", e preserva o aviso persistente da versão conhecida
  modo = '429'; r = await verificar(page); assert.equal(r.selo, 'LIMITE DE CONSULTAS'); assert.match(r.texto, /limitou o número de consultas \(HTTP 429\)/); assert.match(r.texto, /Tente de novo depois de/); assert.doesNotMatch(r.texto, /já usa a versão mais recente/);
  assert.match(await page.textContent('#consulta-nao-concluida'), /Última consulta concluída em/);
  modo = '403cota'; r = await verificar(page); assert.equal(r.selo, 'LIMITE DE CONSULTAS'); assert.match(r.texto, /HTTP 403/);
  modo = '403'; r = await verificar(page); assert.equal(r.selo, 'CONSULTA NÃO CONCLUÍDA'); assert.match(r.texto, /recusou a consulta \(HTTP 403\)/);
  modo = '503'; r = await verificar(page); assert.equal(r.selo, 'CONSULTA NÃO CONCLUÍDA'); assert.match(r.texto, /problemas \(HTTP 503\)/);
  modo = 'mudo'; r = await verificar(page); assert.equal(r.selo, 'CONSULTA NÃO CONCLUÍDA'); assert.match(r.texto, /não respondeu a tempo/);
  await ir(page, 'projetos'); await ir(page, 'ajuda'); await page.click('.indice button:has-text("Atualizações")'); await page.waitForSelector('#ultima-conhecida');
  assert.match(await page.textContent('#ultima-conhecida'), /99\.0\.0 estava disponível/, 'a falha não apaga o que já se sabia');
  assert.ok(await page.locator('#sino-ponto').isVisible() || await page.evaluate(() => !document.querySelector('#sino-ponto').hidden), 'o sino continua indicando a versão já conhecida');
  // 3. Sem rede
  srv.close(); srv.closeAllConnections?.();
  r = await verificar(page); assert.equal(r.selo, 'CONSULTA NÃO CONCLUÍDA'); assert.match(r.texto, /Isto não significa que não exista uma atualização/);
  // 4. Cada verificação fez uma única requisição: nenhuma repetição automática, nenhuma credencial
  assert.equal(pedidos.length, 6, '7 cliques; 6 chegaram ao servidor (o último foi sem rede); nenhuma repetição automática');
  assert.ok(pedidos.every((p) => p.m === 'GET' && p.a === undefined && p.c === undefined));
  await ir(page, 'projetos'); assert.deepEqual(erros, []);
});
