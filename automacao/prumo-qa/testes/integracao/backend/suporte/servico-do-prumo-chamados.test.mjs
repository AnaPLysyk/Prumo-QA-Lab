// Segurança dos chamados no serviço do Prumo (backend/suporte/servidor/chamados.mjs), em 127.0.0.1 com um repositório em memória no lugar do GitHub.
// Nada sai do computador. Cobre: formato do pedido, injeção no texto, chave do chamado, anexo disfarçado, tamanho, prazo, chave de administração,
// força bruta, limites, isolamento entre chamados e o que vai para os registros.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { criarServico } from '../../../../backend/aplicativo/servidor/servidor.mjs';
import { lerChamado, assinaturaConfere } from '../../../../backend/suporte/servidor/chamados.mjs';
import { clienteDoGitHub } from '../../../../backend/suporte/servidor/github.mjs';
import { repositorioDeSuporteFalso } from '../../../unitario/infra/repositorio-de-suporte-falso.mjs';

const ADMIN = 'chave-de-administracao-com-mais-de-32-caracteres-xyz';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(300, 1)]);
const BASE = { categoria: 'bug', titulo: 'Botão Salvar não responde', descricao: 'Cliquei em Salvar e nada aconteceu na tela de Testes.', passos: '1. Abrir Testes 2. Clicar em Salvar', versao: '2.17.0', contato: { nome: 'Bia QA', email: 'bia@exemplo.com' }, anexos: [{ nome: 'tela.png', tipo: 'image/png', tamanho: PNG.length }, { nome: 'gravacao.mp4', tipo: 'video/mp4', tamanho: MP4.length }] };

async function subir(t, opcoes = {}) {
  let agora = Date.parse('2026-10-16T12:00:00Z'); const registros = [];
  const repo = repositorioDeSuporteFalso({ agora: () => new Date(agora) });
  const suporte = opcoes.semSuporte ? null : { github: repo, chaveAdmin: opcoes.chaveAdmin ?? ADMIN, ...(opcoes.limites ? { limites: opcoes.limites } : {}) };
  const servidor = http.createServer(criarServico({ enviar: async () => {}, suporte, agora: () => agora, registrar: (l) => registros.push(l) }));
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok)); t.after(() => servidor.close());
  const url = 'http://127.0.0.1:' + servidor.address().port;
  const pedir = (caminho, { metodo = 'GET', corpo, tipo = 'application/json', cabecalhos = {} } = {}) => fetch(url + caminho, { method: metodo, headers: { ...(corpo !== undefined ? { 'Content-Type': tipo } : {}), ...cabecalhos }, body: corpo === undefined ? undefined : Buffer.isBuffer(corpo) || typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
  const abrir = async (c = BASE) => { const r = await pedir('/v1/chamados', { metodo: 'POST', corpo: c }); return { status: r.status, corpo: await r.json() }; };
  const anexar = (n, i, chave, bytes, tipo) => pedir(`/v1/chamados/${n}/anexos/${i}`, { metodo: 'PUT', corpo: bytes, tipo, cabecalhos: { 'X-Prumo-Chamado': chave } });
  const admin = (caminho, op = {}) => pedir(caminho, { ...op, cabecalhos: { Authorization: 'Bearer ' + ADMIN, ...(op.cabecalhos ?? {}) } });
  return { repo, registros, pedir, abrir, anexar, admin, avancar: (ms) => { agora += ms; } };
}

test('abrir: guarda o chamado no repositório com rótulos, só o resumo da chave e o texto da pessoa sem efeito (menção, HTML e cerca neutralizados)', async (t) => {
  const s = await subir(t);
  const malicioso = { ...BASE, titulo: 'Título com @equipe e <b>negrito</b>', descricao: 'Oi @AnaPLysyk veja <img src=x onerror=alert(1)> [clique](https://phishing.example)\n~~~~\n# Título falso\n~~~~~~ fim' };
  const r = await s.abrir(malicioso); assert.equal(r.status, 201); assert.equal(r.corpo.numero, 1); assert.match(r.corpo.chave, /^[A-Za-z0-9_-]{43}$/);
  const issue = s.repo.issues.get(1);
  assert.deepEqual(issue.labels.map((l) => l.name), ['prumo-suporte', 'categoria:bug', 'estado:novo']);
  assert.ok(!issue.body.includes(r.corpo.chave), 'a chave nunca é gravada'); assert.ok(issue.body.includes(createHash('sha256').update(r.corpo.chave).digest('hex')) === false, 'nem o resumo aparece em texto aberto');
  // Todo texto da pessoa fica dentro de um bloco de código com cerca maior que qualquer sequência de ~ do texto.
  const blocos = [...issue.body.matchAll(/^(~{3,})text\n([\s\S]*?)\n\1$/gm)].map((m) => [m[1], m[2]]);
  const descricao = blocos.find(([, texto]) => texto.includes('phishing'));
  assert.ok(descricao && descricao[0].length > 6, 'cerca maior que os ~~~~~~ do texto');
  const foraDosBlocos = issue.body.replace(/^(~{3,})text\n[\s\S]*?\n\1$/gm, '').replace(/<!-- prumo-chamado:[A-Za-z0-9+/=]+ -->/, '');
  for (const perigo of ['@AnaPLysyk', '<img', 'onerror', 'phishing', '# Título falso']) assert.ok(!foraDosBlocos.includes(perigo), 'fora de bloco: ' + perigo);
  assert.ok(!issue.title.includes('\n'));
});

test('formato do pedido: campos desconhecidos, tipos e tamanhos fora do limite e nomes de propriedade perigosos são recusados', () => {
  const ok = lerChamado(BASE); assert.equal(ok.anexos[0].arquivo, '0-tela.png'); assert.equal(ok.anexos[1].arquivo, '1-gravacao.mp4');
  const ruins = [
    { ...BASE, extra: 1 }, { ...BASE, categoria: '__proto__' }, { ...BASE, categoria: 'constructor' }, { ...BASE, titulo: 'curto' .slice(0, 4) }, { ...BASE, descricao: 'x'.repeat(4001) },
    { ...BASE, versao: '2.17.0; rm -rf /' }, { ...BASE, contato: { nome: 'Bia', email: 'sem-arroba' } }, { ...BASE, contato: { nome: 'Bia', papel: 'admin' } }, { ...BASE, contato: 'Bia' },
    { ...BASE, anexos: [{ nome: 'x.svg', tipo: 'image/svg+xml', tamanho: 10 }] }, { ...BASE, anexos: [{ nome: 'x.html', tipo: 'text/html', tamanho: 10 }] },
    { ...BASE, anexos: [{ nome: 'x.png', tipo: 'image/png', tamanho: 5 * 1024 * 1024 + 1 }] }, { ...BASE, anexos: [{ nome: 'x.png', tipo: 'image/png', tamanho: 1.5 }] },
    { ...BASE, anexos: [{ nome: 'a.mp4', tipo: 'video/mp4', tamanho: 10 }, { nome: 'b.mp4', tipo: 'video/mp4', tamanho: 10 }] },
    { ...BASE, anexos: Array.from({ length: 4 }, (_, i) => ({ nome: i + '.png', tipo: 'image/png', tamanho: 10 })) }, { ...BASE, anexos: 'tudo' }
  ];
  for (const r of ruins) assert.equal(lerChamado(r), null, JSON.stringify(r).slice(0, 120));
  // Nome de arquivo com caminho ou caracteres de controle vira um nome seguro, sem pasta.
  assert.equal(lerChamado({ ...BASE, anexos: [{ nome: '../../etc/passwd.png', tipo: 'image/png', tamanho: 10 }] }).anexos[0].arquivo, '0-etc-passwd.png');
  assert.equal(lerChamado({ ...BASE, titulo: 'Linha‮oculta e controle\u0007 aqui' }).titulo, 'Linhaoculta e controle aqui', 'controle e bidi saem');
});

test('anexo: só com a chave certa, tipo e tamanho declarados, assinatura real, uma vez e dentro do prazo', async (t) => {
  const s = await subir(t); const { corpo: { numero, chave } } = await s.abrir();
  const outro = await s.abrir({ ...BASE, titulo: 'Outro chamado de outra pessoa' });
  assert.equal((await s.anexar(numero, 0, 'chave-errada-com-tamanho-suficiente-000', PNG, 'image/png')).status, 404, 'chave errada parece inexistente');
  assert.equal((await s.anexar(numero, 0, outro.corpo.chave, PNG, 'image/png')).status, 404, 'a chave de um chamado não abre outro');
  assert.equal((await s.anexar(999, 0, chave, PNG, 'image/png')).status, 404);
  assert.equal((await s.anexar(numero, 0, chave, PNG, 'image/jpeg')).status, 415, 'tipo diferente do declarado');
  const disfarcado = Buffer.concat([Buffer.from('<html><script>alert(1)</script>'), Buffer.alloc(PNG.length - 32, 32)]);
  assert.equal((await s.anexar(numero, 0, chave, disfarcado, 'image/png')).status, 400, 'HTML com extensão de imagem não passa');
  assert.equal((await s.anexar(numero, 0, chave, Buffer.concat([PNG, Buffer.alloc(10)]), 'image/png')).status, 413, 'maior que o declarado');
  assert.equal((await s.anexar(numero, 0, chave, PNG.subarray(0, 100), 'image/png')).status, 400, 'menor que o declarado');
  assert.equal((await s.anexar(numero, 5, chave, PNG, 'image/png')).status, 400, 'índice não declarado');
  assert.equal((await s.anexar(numero, 0, chave, PNG, 'image/png')).status, 201);
  assert.equal((await s.anexar(numero, 0, chave, PNG, 'image/png')).status, 409, 'não sobrescreve');
  assert.ok(s.repo.arquivos.has(`chamados/${numero}/0-tela.png`));
  s.avancar(2 * 3_600_000 + 1);
  assert.equal((await s.anexar(numero, 1, chave, MP4, 'video/mp4')).status, 410, 'prazo de 2 horas');
  assert.ok(assinaturaConfere('video/mp4', MP4) && !assinaturaConfere('video/webm', MP4) && !assinaturaConfere('image/png', MP4));
});

test('acompanhar: com a chave, estado e só as respostas da equipe; sem a chave, inexistente (igual a número que não existe)', async (t) => {
  const s = await subir(t); const { corpo: { numero, chave } } = await s.abrir();
  const errada = await s.pedir(`/v1/chamados/${numero}`, { cabecalhos: { 'X-Prumo-Chamado': 'x'.repeat(43) } });
  const inexistente = await s.pedir('/v1/chamados/777', { cabecalhos: { 'X-Prumo-Chamado': chave } });
  assert.equal(errada.status, 404); assert.equal(inexistente.status, 404); assert.deepEqual(await errada.json(), await inexistente.json());
  assert.equal((await s.pedir(`/v1/chamados/${numero}`)).status, 404, 'sem chave');
  await s.repo.comentar(numero, 'nota interna da equipe, sem a marca');
  assert.equal((await s.admin(`/v1/admin/chamados/${numero}/respostas`, { metodo: 'POST', corpo: { texto: 'Corrigido na 2.17.1. Obrigada!' } })).status, 201);
  const r = await (await s.pedir(`/v1/chamados/${numero}`, { cabecalhos: { 'X-Prumo-Chamado': chave } })).json();
  assert.equal(r.estado, 'NOVO'); assert.deepEqual(r.respostas.map((x) => x.texto), ['Corrigido na 2.17.1. Obrigada!']);
  assert.equal(r.contato, undefined, 'a pessoa não recebe dados de contato de volta');
});

test('administração: sem chave ou com chave errada nada sai; erros seguidos bloqueiam o IP; com a chave, lista, detalhe, anexo, resposta e estado', async (t) => {
  const s = await subir(t); const { corpo: { numero, chave } } = await s.abrir();
  await s.anexar(numero, 0, chave, PNG, 'image/png');
  assert.equal((await s.pedir('/v1/admin/chamados')).status, 401);
  assert.equal((await s.pedir('/v1/admin/chamados', { cabecalhos: { Authorization: 'Bearer ' + ADMIN.slice(0, -1) + 'X' } })).status, 401);
  assert.equal((await s.pedir('/v1/admin/chamados', { cabecalhos: { Authorization: 'Basic ' + ADMIN } })).status, 401);
  const lista = await (await s.admin('/v1/admin/chamados')).json();
  assert.deepEqual(lista.chamados.map((c) => [c.numero, c.estado, c.contato, c.anexos]), [[numero, 'NOVO', 'Bia QA', 2]]);
  assert.equal((await s.admin('/v1/admin/chamados?estado=INVENTADO')).status, 400);
  const d = await (await s.admin(`/v1/admin/chamados/${numero}`)).json();
  assert.equal(d.dados.contato.email, 'bia@exemplo.com'); assert.deepEqual(d.anexos.map((a) => a.recebido), [true, false]);
  const arq = await s.admin(`/v1/admin/chamados/${numero}/anexos/0`);
  assert.equal(arq.status, 200); assert.equal(arq.headers.get('content-type'), 'image/png'); assert.equal(arq.headers.get('x-content-type-options'), 'nosniff');
  assert.match(arq.headers.get('content-disposition'), /^attachment; filename="0-tela\.png"$/); assert.deepEqual(Buffer.from(await arq.arrayBuffer()), PNG);
  assert.equal((await s.admin(`/v1/admin/chamados/${numero}/anexos/1`)).status, 404, 'anexo não recebido');
  assert.equal((await s.admin(`/v1/admin/chamados/${numero}`, { metodo: 'PATCH', corpo: { estado: 'RESOLVIDO' } })).status, 200);
  assert.equal(s.repo.issues.get(numero).state, 'closed'); assert.ok(s.repo.issues.get(numero).labels.some((l) => l.name === 'estado:resolvido'));
  assert.ok(!s.repo.issues.get(numero).labels.some((l) => l.name === 'estado:novo'), 'troca o rótulo, não acumula');
  assert.equal((await s.admin(`/v1/admin/chamados/${numero}`, { metodo: 'PATCH', corpo: { estado: 'RESOLVIDO', extra: 1 } })).status, 400);
  assert.equal((await s.admin(`/v1/admin/chamados/${numero}/respostas`, { metodo: 'POST', corpo: { texto: '' } })).status, 400);
  // Issue do repositório que não veio do Prumo não aparece nem abre.
  s.repo.issues.set(50, { number: 50, title: 'issue manual', body: 'sem bloco', labels: [{ name: 'prumo-suporte' }], state: 'open', created_at: '2026-10-16T12:00:00Z', updated_at: '2026-10-16T12:00:00Z' });
  assert.equal((await (await s.admin('/v1/admin/chamados')).json()).chamados.length, 1); assert.equal((await s.admin('/v1/admin/chamados/50')).status, 404);
  // Força bruta: 10 erros na hora bloqueiam o IP, mesmo que depois venha a chave certa.
  for (let i = 0; i < 10; i++) await s.pedir('/v1/admin/chamados', { cabecalhos: { Authorization: 'Bearer tentativa-' + i } });
  assert.equal((await s.admin('/v1/admin/chamados')).status, 429);
  s.avancar(3_600_001); assert.equal((await s.admin('/v1/admin/chamados')).status, 200, 'libera depois de uma hora');
});

test('configuração: sem suporte os chamados recusam com 503 e os códigos seguem; chave de administração curta não habilita a administração', async (t) => {
  const sem = await subir(t, { semSuporte: true });
  assert.equal((await sem.abrir()).status, 503); assert.equal((await sem.pedir('/v1/admin/chamados', { cabecalhos: { Authorization: 'Bearer ' + ADMIN } })).status, 503);
  assert.deepEqual(await (await sem.pedir('/saude')).json(), { ok: true, email: true, suporte: false, administracao: false });
  const curta = await subir(t, { chaveAdmin: 'curta' });
  assert.equal((await curta.pedir('/v1/admin/chamados', { cabecalhos: { Authorization: 'Bearer curta' } })).status, 503);
  assert.equal((await curta.abrir()).status, 201, 'abrir chamado continua funcionando');
});

test('limites e registros: 10 chamados por IP por hora; corpo grande ou não JSON recusado; registros sem texto, e-mail ou chave', async (t) => {
  const s = await subir(t);
  let ultima; for (let i = 0; i < 10; i++) ultima = await s.abrir();
  assert.equal((await s.abrir()).status, 429);
  assert.equal((await s.pedir('/v1/chamados', { metodo: 'POST', corpo: { ...BASE, descricao: 'x'.repeat(40_000) } })).status, 413);
  assert.equal((await s.pedir('/v1/chamados', { metodo: 'POST', corpo: 'categoria=bug', tipo: 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await s.pedir('/v1/chamados', { metodo: 'GET' })).status, 405);
  const todos = s.registros.join('\n');
  for (const nao of ['Cliquei em Salvar', 'bia@exemplo.com', 'Bia QA', ultima.corpo.chave, ADMIN]) assert.ok(!todos.includes(nao), 'registro com: ' + nao);
  assert.match(todos, /chamado #1 aberto \(bug, 2 anexo\(s\)\)/);
});

test('cliente do GitHub: só o repositório configurado, cabeçalhos certos, token só no Authorization e caminho de arquivo sem fuga de pasta', async (t) => {
  const pedidos = [];
  const servidor = http.createServer((req, res) => { let c = ''; req.on('data', (p) => { c += p; }); req.on('end', () => { pedidos.push({ metodo: req.method, url: req.url, cab: req.headers, corpo: c });
    if (req.url.endsWith('/issues')) { res.writeHead(201, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ number: 7 })); }
    if (req.url.includes('/contents/')) { res.writeHead(req.method === 'PUT' ? 201 : 404, { 'Content-Type': 'application/json' }); return res.end('{}'); }
    res.writeHead(404); res.end(); }); });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok)); t.after(() => servidor.close());
  assert.throws(() => clienteDoGitHub({ token: 't', repositorio: 'dona/../../outro' }), /repositório inválido/);
  const gh = clienteDoGitHub({ token: 'github_pat_teste', repositorio: 'AnaPLysyk/Prumo-QA-suporte', api: 'http://127.0.0.1:' + servidor.address().port });
  assert.equal((await gh.criarIssue({ titulo: 'T', corpo: 'C', rotulos: ['prumo-suporte'] })).number, 7);
  assert.equal(await gh.gravarArquivo('chamados/7/0-tela.png', Buffer.from('abc'), 'Anexo'), true);
  await assert.rejects(gh.gravarArquivo('chamados/7/../../.github/workflows/x.yml', Buffer.from('x'), 'm'), /caminho recusado/);
  await assert.rejects(gh.lerArquivo('outra/pasta/arquivo'), /caminho recusado/);
  assert.equal(await gh.lerArquivo('chamados/7/0-tela.png'), null);
  const [criar, gravar] = pedidos;
  assert.equal(criar.url, '/repos/AnaPLysyk/Prumo-QA-suporte/issues'); assert.equal(criar.cab.authorization, 'Bearer github_pat_teste'); assert.equal(criar.cab['x-github-api-version'], '2022-11-28');
  assert.deepEqual(JSON.parse(criar.corpo), { title: 'T', body: 'C', labels: ['prumo-suporte'] });
  assert.equal(gravar.url, '/repos/AnaPLysyk/Prumo-QA-suporte/contents/chamados/7/0-tela.png'); assert.equal(JSON.parse(gravar.corpo).content, Buffer.from('abc').toString('base64'));
  assert.ok(pedidos.every((p) => !p.url.includes('github_pat_teste')), 'token nunca na URL');
});

test('IP do pedido: vale o que o proxy acrescentou (último do X-Forwarded-For), não o que o cliente inventou no começo', async () => {
  const { ipDe } = await import('../../../../backend/compartilhado/servidor/comum.mjs');
  const req = (h, remoto = '10.0.0.1') => ({ headers: h, socket: { remoteAddress: remoto } });
  assert.equal(ipDe(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' })), '203.0.113.9', 'o primeiro item é do cliente');
  assert.equal(ipDe(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.9' })), '203.0.113.9');
  assert.equal(ipDe(req({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4' })), '198.51.100.7');
  assert.equal(ipDe(req({})), '10.0.0.1');
});

test('falha do GitHub jamais registra token de integração', async t => {
  const s=await subir(t);
  const segredo='ghp_TOKEN_FICTICIO_123';
  s.repo.criarIssue=async()=>{throw new Error('Authorization Bearer '+segredo);};
  const resposta=await s.abrir();
  assert.equal(resposta.status,502);
  assert.deepEqual(resposta.corpo,{erro:'SUPPORT_UPSTREAM_FAILED'});
  assert.deepEqual(s.registros,['SUPPORT_UPSTREAM_FAILED']);
  assert.doesNotMatch(JSON.stringify({logs:s.registros,body:resposta.corpo}),/ghp_TOKEN_FICTICIO_123/);
});
