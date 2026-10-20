import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { destinoAutorizado } from '../../../../dist/atualizacoes/regras/destinoAutorizado.js';
import { verificarAtualizacao } from '../../../../dist/atualizacoes/regras/verificarAtualizacao.js';
import { mensagemOffline, urlConsulta } from '../../../../dist/atualizacoes/tipos/consulta.js';

const resp = (corpo, init = {}) => async () => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status: 200, ...init });
const release = (tag, extra = {}) => ({ tag_name: tag, html_url: `https://github.com/AnaPLysyk/Prumo-Qa/releases/tag/${tag}`, body: '## Novidades\n- algo', draft: false, prerelease: false, ...extra });

test('versão mais recente disponível: resumo das mudanças e página oficial reconstruída localmente', async () => {
  const r = await verificarAtualizacao('2.2.0', { buscar: resp(release('v2.3.0', { html_url: 'https://evil.example/phishing' })) });
  assert.equal(r.status, 'ATUALIZACAO_DISPONIVEL'); assert.equal(r.latest, '2.3.0'); assert.match(r.notes, /Novidades/);
  assert.equal(r.url, 'https://github.com/AnaPLysyk/Prumo-Qa/releases/tag/v2.3.0', 'html_url do servidor nunca é repassado');
  assert.match(r.message, /sem a sua ação/);
});

test('versão igual, instalada mais nova e comparação numérica (2.10 > 2.9)', async () => {
  assert.equal((await verificarAtualizacao('2.3.0', { buscar: resp(release('v2.3.0')) })).status, 'ATUALIZADO');
  assert.equal((await verificarAtualizacao('2.4.0', { buscar: resp(release('v2.3.0')) })).status, 'INSTALADA_MAIS_NOVA');
  assert.equal((await verificarAtualizacao('2.9.0', { buscar: resp(release('v2.10.0')) })).status, 'ATUALIZACAO_DISPONIVEL');
});

test('ausência de release (404), indisponibilidade, falha de rede e timeout mantêm o uso local', async () => {
  assert.equal((await verificarAtualizacao('2.2.0', { buscar: async () => new Response('{}', { status: 404 }) })).status, 'SEM_RELEASE');
  for (const status of [500, 503]) { const r = await verificarAtualizacao('2.2.0', { buscar: async () => new Response('x', { status }) }); assert.equal(r.status, 'INDISPONIVEL'); assert.equal(r.conclusivo, false); assert.equal(r.motivo, 'SERVIDOR'); assert.ok(r.message.endsWith(mensagemOffline)); }
  const rede = await verificarAtualizacao('2.2.0', { buscar: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(rede.status, 'INDISPONIVEL'); assert.equal(rede.motivo, 'REDE'); assert.match(rede.message, /O aplicativo continua disponível para uso local\./);
  const lento = await verificarAtualizacao('2.2.0', { timeoutMs: 80, buscar: (_u, init) => new Promise((_ok, ruim) => init.signal.addEventListener('abort', () => ruim(init.signal.reason))) });
  assert.equal(lento.status, 'INDISPONIVEL'); assert.equal(lento.motivo, 'TEMPO_ESGOTADO');
});

test('respostas inválidas são ignoradas: JSON quebrado, tag estranha, rascunho, pré-release e resposta enorme', async () => {
  for (const corpo of ['não é json', '[]', '{}', JSON.stringify(release('latest')), JSON.stringify(release('v2.3')), JSON.stringify(release('v2.3.0-rc1')), JSON.stringify(release('v2.3.0', { draft: true })), JSON.stringify(release('v2.3.0', { prerelease: true })), JSON.stringify(release('v2.3.0', { body: 'x'.repeat(1_100_000) }))]) {
    const r = await verificarAtualizacao('2.2.0', { buscar: resp(corpo) });
    assert.equal(r.status, 'RESPOSTA_INVALIDA', corpo.slice(0, 40)); assert.equal(r.url, undefined);
  }
});

test('notas são texto limpo e limitado, sem caracteres de controle', async () => {
  const r = await verificarAtualizacao('2.2.0', { buscar: resp(release('v2.3.0', { body: 'ok\u0000\u001b[31m' + 'a'.repeat(9000) })) });
  assert.ok(r.notes.length <= 4000); assert.doesNotMatch(r.notes, /[\x00-\x08\x1b]/);
});

test('destino remoto é fixo: nenhum outro host, caminho, porta, credencial ou protocolo', async () => {
  assert.ok(destinoAutorizado(urlConsulta));
  for (const ruim of ['http://api.github.com/repos/AnaPLysyk/Prumo-Qa/releases/latest', 'https://api.github.com/repos/outro/repo/releases/latest', 'https://api.github.com/repos/AnaPLysyk/Prumo-Qa/releases/latest?x=1',
    'https://api.github.com.evil.com/repos/AnaPLysyk/Prumo-Qa/releases/latest', 'https://user:pw@api.github.com/repos/AnaPLysyk/Prumo-Qa/releases/latest', 'https://api.github.com:8443/repos/AnaPLysyk/Prumo-Qa/releases/latest',
    'https://example.com/', 'file:///C:/Windows/win.ini', 'http://127.0.0.1/x', 'nao-e-url', '']) assert.ok(!destinoAutorizado(ruim), ruim);
  assert.ok(destinoAutorizado('http://127.0.0.1:1234/x', true), 'loopback só com permitirLocal (testes)');
  assert.ok(!destinoAutorizado('http://localhost:1234/x', true));
  let chamado = false;
  await assert.rejects(verificarAtualizacao('2.2.0', { url: 'https://example.com/', buscar: async () => { chamado = true; return new Response('{}'); } }), /UPDATE_DESTINATION_FORBIDDEN/);
  assert.equal(chamado, false, 'nenhuma requisição é feita para destino não autorizado');
  await assert.rejects(verificarAtualizacao('abc'), /INVALID_VERSION/);
});

test('requisição não leva dados privados nem segue redirecionamentos', async () => {
  let visto;
  await verificarAtualizacao('2.2.0', { buscar: async (url, init) => { visto = { url, init }; return new Response(JSON.stringify(release('v2.2.0'))); } });
  assert.equal(visto.url, urlConsulta); assert.equal(visto.init.method, 'GET');
  assert.equal(visto.init.body, undefined); assert.equal(visto.init.redirect, 'error'); assert.equal(visto.init.credentials, 'omit');
  assert.deepEqual(Object.keys(visto.init.headers).sort(), ['Accept', 'User-Agent']);
  assert.equal(visto.init.headers['User-Agent'], 'PrumoQA/2.2.0');
  assert.doesNotMatch(JSON.stringify(visto), /Users|AppData|LOCALAPPDATA|projects|\.prumo|token|authorization|cookie/i);
});

test('HTTP real em loopback: lê release, não faz download e recusa redirecionamento', async (t) => {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    pedidos.push({ m: req.method, u: req.url, h: req.headers, ip: req.socket.remoteAddress });
    if (req.url === '/redireciona') { res.writeHead(302, { Location: 'http://127.0.0.1:1/' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(release('v2.3.0')));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const r = await verificarAtualizacao('2.2.0', { url: base + '/latest', permitirLocal: true });
  assert.equal(r.status, 'ATUALIZACAO_DISPONIVEL');
  assert.equal(pedidos.length, 1); assert.equal(pedidos[0].m, 'GET'); assert.equal(pedidos[0].h['user-agent'], 'PrumoQA/2.2.0');
  assert.equal(pedidos[0].h.cookie, undefined); assert.equal(pedidos[0].h.authorization, undefined);
  const red = await verificarAtualizacao('2.2.0', { url: base + '/redireciona', permitirLocal: true });
  assert.equal(red.status, 'INDISPONIVEL'); assert.equal(pedidos.length, 2, 'redirecionamento não foi seguido');
});

test('o módulo nunca baixa nem executa instalador', async () => {
  const fonte = (await import('node:fs')).readFileSync('backend/atualizacoes/regras/verificarAtualizacao.ts', 'utf8');
  assert.doesNotMatch(fonte, /child_process|spawn|exec\(|writeFile|createWriteStream|\.exe\b|shell\./);
});

test('2.8.1: "não foi possível consultar" nunca se confunde com "não existe atualização"', async () => {
  let chamadas = 0; const resposta = (init) => async () => { chamadas += 1; return new Response('{}', init); };
  const estado = async (init) => verificarAtualizacao('2.7.0', { buscar: resposta(init) });
  // limite de consultas da API pública (429 e 403 com cota esgotada), com o horário informado pelo GitHub
  const r429 = await estado({ status: 429, headers: { 'retry-after': '90' } });
  assert.equal(r429.status, 'LIMITE_DE_TAXA'); assert.equal(r429.conclusivo, false); assert.equal(r429.motivo, 'LIMITE_DE_TAXA'); assert.ok(Date.parse(r429.tentarApos) > Date.now() + 60000); assert.match(r429.message, /Isto não significa que não exista uma atualização/);
  const reset = Math.floor(Date.now() / 1000) + 1800;
  const r403 = await estado({ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } });
  assert.equal(r403.status, 'LIMITE_DE_TAXA'); assert.equal(r403.tentarApos, new Date(reset * 1000).toISOString());
  const semHorario = await estado({ status: 429 }); assert.equal(semHorario.status, 'LIMITE_DE_TAXA'); assert.equal(semHorario.tentarApos, undefined); assert.match(semHorario.message, /mais tarde/);
  // 403 sem cota esgotada é recusa; 5xx é problema do servidor; nenhum diz que está atualizado
  const recusa = await estado({ status: 403 }); assert.equal(recusa.status, 'INDISPONIVEL'); assert.equal(recusa.motivo, 'RECUSADO');
  const servidor = await estado({ status: 502 }); assert.equal(servidor.motivo, 'SERVIDOR');
  const semResposta = await verificarAtualizacao('2.7.0', { timeoutMs: 60, buscar: (_u, init) => new Promise((_ok, ruim) => init.signal.addEventListener('abort', () => ruim(init.signal.reason))) }); assert.equal(semResposta.motivo, 'TEMPO_ESGOTADO');
  const rede = await verificarAtualizacao('2.7.0', { buscar: async () => { throw new TypeError('fetch failed'); } }); assert.equal(rede.motivo, 'REDE');
  const invalida = await estado({ status: 200 }); assert.equal(invalida.status, 'RESPOSTA_INVALIDA'); assert.equal(invalida.conclusivo, false);
  for (const r of [r429, r403, semHorario, recusa, servidor, semResposta, rede, invalida]) {
    assert.equal(r.conclusivo, false); assert.equal(r.latest, undefined); assert.equal(r.url, undefined); assert.doesNotMatch(r.message, /já usa a versão mais recente|ATUALIZADO/);
  }
  // Somente respostas válidas são conclusivas; uma verificação = uma requisição, sem nova tentativa automática
  chamadas = 0; const nova = await verificarAtualizacao('2.7.0', { buscar: async () => { chamadas += 1; return new Response(JSON.stringify(release('v2.8.1')), { status: 200 }); } });
  assert.equal(nova.status, 'ATUALIZACAO_DISPONIVEL'); assert.equal(nova.conclusivo, true); assert.equal(chamadas, 1);
  const igual = await verificarAtualizacao('2.8.1', { buscar: async () => new Response(JSON.stringify(release('v2.8.1')), { status: 200 }) }); assert.equal(igual.status, 'ATUALIZADO'); assert.equal(igual.conclusivo, true);
  assert.equal((await estado({ status: 404 })).conclusivo, true);
  chamadas = 0; await estado({ status: 429 }); await estado({ status: 503 }); assert.equal(chamadas, 2, 'cada verificação faz exatamente uma requisição');
});
