// Serviço do Prumo, rota dos códigos (backend/aplicativo/servidor/servidor.mjs) em 127.0.0.1 com uma caixa em memória no lugar do Resend: nada sai do computador.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { criarServico, enviarPeloResend, mensagem } from '../../../../backend/aplicativo/servidor/servidor.mjs';

async function subir(t, opcoes = {}) {
  const caixa = []; const registros = []; let agora = Date.parse('2026-10-16T12:00:00Z');
  const servidor = http.createServer(criarServico({ enviar: async (m) => { if (opcoes.falhar) throw new Error('provedor fora'); caixa.push(m); }, agora: () => agora, registrar: (l) => registros.push(l), ...opcoes }));
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok)); t.after(() => servidor.close());
  const url = 'http://127.0.0.1:' + servidor.address().port;
  const pedir = (corpo, cabecalhos = { 'Content-Type': 'application/json' }, caminho = '/v1/codigos', metodo = 'POST') => fetch(url + caminho, { method: metodo, headers: cabecalhos, body: metodo === 'POST' ? (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) : undefined });
  return { caixa, registros, pedir, avancar: (ms) => { agora += ms; } };
}
const PEDIDO = { email: 'Pessoa@Exemplo.com', codigo: '048213', finalidade: 'CADASTRO' };

test('pedido válido: manda o código ao e-mail (em minúsculas), responde 202 e o registro mascara o e-mail e nunca mostra o código', async (t) => {
  const s = await subir(t);
  const r = await s.pedir(PEDIDO); assert.equal(r.status, 202); assert.deepEqual(await r.json(), { enviado: true });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(s.caixa.length, 1); const m = s.caixa[0];
  assert.equal(m.para, 'pessoa@exemplo.com'); assert.equal(m.assunto, 'Seu código do Prumo QA: 048213');
  assert.match(m.texto, /048213/); assert.match(m.texto, /confirmar seu e-mail e concluir o cadastro/); assert.match(m.texto, /10 minutos/);
  assert.ok(s.registros.every((l) => !l.includes('048213') && !l.includes('pessoa@exemplo.com')), JSON.stringify(s.registros));
  assert.ok(s.registros.some((l) => l.includes('p***@exemplo.com')));
});

test('entrada em duas etapas avisa para trocar a senha se não foi a pessoa', () => {
  const m = mensagem({ codigo: '333444', finalidade: 'ENTRADA', idioma: 'pt-BR' }); assert.match(m.texto, /concluir a entrada no Prumo QA/); assert.match(m.texto, /troque sua senha/);
  assert.match(mensagem({ codigo: '333444', finalidade: 'ENTRADA', idioma: 'en' }).texto, /change your password/);
});

test('senha nova e inglês mudam só o texto fixo', () => {
  assert.match(mensagem({ codigo: '111222', finalidade: 'SENHA', idioma: 'pt-BR' }).texto, /definir uma senha nova/);
  const en = mensagem({ codigo: '111222', finalidade: 'SENHA', idioma: 'en' }); assert.equal(en.assunto, 'Your Prumo QA code: 111222'); assert.match(en.texto, /set a new password/);
});

test('pedido fora do formato é recusado sem enviar nada', async (t) => {
  const s = await subir(t);
  for (const corpo of [{ ...PEDIDO, codigo: '12345' }, { ...PEDIDO, codigo: 'abcdef' }, { ...PEDIDO, email: 'sem-arroba' }, { ...PEDIDO, email: 'a@b' }, { ...PEDIDO, finalidade: 'OUTRA' }, { ...PEDIDO, idioma: 'fr' }, { ...PEDIDO, assunto: 'injetado' }, '{quebrado', '[]']) {
    const r = await s.pedir(corpo); assert.equal(r.status, 400, JSON.stringify(corpo)); assert.deepEqual(await r.json(), { erro: 'EMAIL_INVALID' });
  }
  assert.equal((await s.pedir(PEDIDO, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await s.pedir({ ...PEDIDO, email: 'a'.repeat(3000) + '@x.com' })).status, 413);
  assert.equal((await s.pedir(null, {}, '/v1/codigos', 'GET')).status, 405);
  assert.equal((await s.pedir(null, {}, '/outra', 'GET')).status, 404);
  const saude = await s.pedir(null, {}, '/saude', 'GET'); assert.equal(saude.status, 200); assert.deepEqual(await saude.json(), { ok: true, email: true, suporte: false, administracao: false });
  assert.equal(s.caixa.length, 0);
});

test('limites: 3 códigos por e-mail a cada 10 minutos, depois 429 até a janela passar', async (t) => {
  const s = await subir(t);
  for (let i = 0; i < 3; i++) assert.equal((await s.pedir(PEDIDO)).status, 202);
  const r = await s.pedir(PEDIDO); assert.equal(r.status, 429); assert.deepEqual(await r.json(), { erro: 'EMAIL_RATE_LIMIT' }); assert.equal(r.headers.get('retry-after'), '600');
  assert.equal((await s.pedir({ ...PEDIDO, email: 'outra@exemplo.com' })).status, 202, 'outro e-mail não é afetado');
  s.avancar(10 * 60_000 + 1); assert.equal((await s.pedir(PEDIDO)).status, 202);
  assert.equal(s.caixa.length, 5);
});

test('sem a chave do Resend o serviço recusa (503); falha do provedor vira 502 sem vazar o código', async (t) => {
  const semChave = await subir(t, { configurado: false });
  const r = await semChave.pedir(PEDIDO); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { erro: 'EMAIL_SERVICE_NOT_CONFIGURED' });
  const fora = await subir(t, { falhar: true });
  const f = await fora.pedir(PEDIDO); assert.equal(f.status, 502); assert.deepEqual(await f.json(), { erro: 'EMAIL_SEND_FAILED' });
  assert.ok(fora.registros.every((l) => !l.includes('048213')));
});

test('envio pelo Resend: endereço oficial, chave só no cabeçalho e resposta de erro vira falha', async () => {
  const chamadas = [];
  const buscar = async (url, op) => { chamadas.push({ url, op }); return { ok: chamadas.length === 1, status: chamadas.length === 1 ? 200 : 403 }; };
  const enviar = enviarPeloResend({ chave: 're_teste', remetente: 'Prumo QA <nao-responda@exemplo.com>', buscar });
  await enviar({ para: 'pessoa@exemplo.com', assunto: 'A', texto: 'B', html: '<p>B</p>' });
  assert.equal(chamadas[0].url, 'https://api.resend.com/emails'); assert.equal(chamadas[0].op.headers.Authorization, 'Bearer re_teste');
  assert.deepEqual(JSON.parse(chamadas[0].op.body), { from: 'Prumo QA <nao-responda@exemplo.com>', to: ['pessoa@exemplo.com'], subject: 'A', text: 'B', html: '<p>B</p>' });
  await assert.rejects(enviar({ para: 'pessoa@exemplo.com', assunto: 'A', texto: 'B', html: 'B' }), /403/);
});

test('recuperaÃ§Ã£o de senha usa a interface oficial de frontend/login/web, com cabeÃ§alhos seguros', async (t) => {
  const autenticacao = { checar: async () => {}, atender: () => { throw new Error('route inesperada'); } };
  const servidor = http.createServer(criarServico({ autenticao: null, autenticacao, configurado: false, registrar: () => {} }));
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => servidor.close());
  const base='http://127.0.0.1:'+servidor.address().port;
  const pagina=await fetch(base+'/recuperar-senha');
  assert.equal(pagina.status, 200);
  assert.match(pagina.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.match(await pagina.text(), /recuperar-senha\.js/);
  const codigo=await fetch(base+'/recuperar-senha.js');
  assert.equal(codigo.status, 200);
  assert.match(await codigo.text(), /reset-password/);
});
test('falha de e-mail jamais imprime segredo de provedor no Render', async t => {
  const segredo='re_TOKEN_FICTICIO_123';
  const s=await subir(t,{enviar:async()=>{throw new Error('Authorization Bearer '+segredo);}});
  const resposta=await s.pedir(PEDIDO);
  assert.equal(resposta.status,502);
  assert.deepEqual(await resposta.json(),{erro:'EMAIL_SEND_FAILED'});
  assert.doesNotMatch(JSON.stringify(s.registros),/re_TOKEN_FICTICIO_123|Authorization Bearer/);
  assert.ok(s.registros.some(l=>l.startsWith('EMAIL_SEND_FAILED: ')));
});
