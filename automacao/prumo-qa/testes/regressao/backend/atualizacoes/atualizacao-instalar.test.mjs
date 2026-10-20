import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { baixarAtualizacao } from '../../../../dist/atualizacoes/regras/baixarAtualizacao.js';
import { enderecoDoInstalador as urlInstalador } from '../../../../dist/atualizacoes/regras/enderecoDoInstalador.js';
import { nomeDoInstalador as nomeInstalador } from '../../../../dist/atualizacoes/regras/nomeDoInstalador.js';
import { argumentosInstalador } from '../../../../dist/atualizacoes/tipos/instalador.js';

/** Servidor em 127.0.0.1 no lugar do GitHub: nenhum teste sai para a rede nem executa instalador. */
async function servidor(t, rotas) {
  const pedidos = []; const srv = http.createServer((req, res) => { pedidos.push(req.url); const r = rotas[req.url]; if (!r) { res.writeHead(404); return res.end(); } r(res); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); t.after(() => srv.close());
  return { base: `http://127.0.0.1:${srv.address().port}`, pedidos };
}
const pasta = (t) => { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo atualizar ')); t.after(() => fs.rmSync(p, { recursive: true, force: true })); return p; };
const corpo = Buffer.from('MZ instalador de teste '.repeat(5000));
const hash = createHash('sha256').update(corpo).digest('hex');
const nome = nomeInstalador('9.9.9');

test('atualizar (2.10.2): baixa, confere o SHA-256 publicado e devolve só o instalador verificado', async (t) => {
  const s = await servidor(t, { [`/${nome}.sha256`]: (res) => res.end(`${hash} *${nome}\n`), [`/${nome}`]: (res) => res.end(corpo) });
  const tmp = pasta(t); const r = await baixarAtualizacao('9.9.9', { base: s.base, permitirLocal: true, pasta: tmp });
  assert.equal(r.sha256, hash); assert.equal(r.bytes, corpo.length); assert.ok(fs.readFileSync(r.arquivo).equals(corpo));
  assert.deepEqual(s.pedidos, [`/${nome}.sha256`, `/${nome}`], 'o resumo publicado vem antes do instalador');
  assert.deepEqual([...argumentosInstalador], ['/S', '--updated', '--force-run']);
});

test('atualizar: SHA-256 divergente apaga o arquivo; sem .sha256 válido nada é baixado', async (t) => {
  const s = await servidor(t, {
    [`/${nome}.sha256`]: (res) => res.end(`${'0'.repeat(64)}  ${nome}`), [`/${nome}`]: (res) => res.end(corpo)
  });
  const tmp = pasta(t);
  await assert.rejects(() => baixarAtualizacao('9.9.9', { base: s.base, permitirLocal: true, pasta: tmp }), /UPDATE_HASH_MISMATCH.*nada foi instalado/);
  assert.deepEqual(fs.readdirSync(tmp), [], 'nada sobra na pasta temporária');
  const s2 = await servidor(t, { [`/${nome}.sha256`]: (res) => res.end('não é um resumo'), [`/${nome}`]: (res) => res.end(corpo) });
  await assert.rejects(() => baixarAtualizacao('9.9.9', { base: s2.base, permitirLocal: true, pasta: tmp }), /UPDATE_HASH_MISSING/);
  assert.deepEqual(s2.pedidos, [`/${nome}.sha256`], 'sem resumo válido o instalador nem é pedido');
  const s3 = await servidor(t, {});
  await assert.rejects(() => baixarAtualizacao('9.9.9', { base: s3.base, permitirLocal: true, pasta: tmp }), /UPDATE_DOWNLOAD_FAILED: o GitHub respondeu HTTP 404/);
});

test('atualizar: URL oficial fixa, redirecionamento só para hosts de download do GitHub e versão validada', async (t) => {
  assert.equal(urlInstalador('2.10.2'), 'https://github.com/AnaPLysyk/Prumo-Qa/releases/download/v2.10.2/Prumo-QA-Setup-2.10.2.exe');
  for (const v of ['2.10', '../1.0.0', '1.0.0/../../x', 'v1.0.0']) await assert.rejects(() => baixarAtualizacao(v), /INVALID_VERSION/);
  const vistos = [];
  const buscar = async (url) => { vistos.push(String(url)); return new Response(null, { status: 302, headers: { location: 'https://evil.example.com/x.exe' } }); };
  await assert.rejects(() => baixarAtualizacao('2.10.2', { buscar, base: 'http://127.0.0.1:1', permitirLocal: false }), /UPDATE_DESTINATION_FORBIDDEN.*evil\.example\.com/);
  assert.deepEqual(vistos, [urlInstalador('2.10.2') + '.sha256'], 'sem permitirLocal a base de teste é ignorada e só o GitHub é consultado');
  const http1 = async () => new Response(null, { status: 302, headers: { location: 'http://objects.githubusercontent.com/x' } });
  await assert.rejects(() => baixarAtualizacao('2.10.2', { buscar: http1 }), /UPDATE_DESTINATION_FORBIDDEN/, 'redirecionamento para http é recusado');
  const ok = []; const cadeia = async (url) => { ok.push(new URL(url).hostname); return ok.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/a' } }) : new Response(`${hash} *Prumo-QA-Setup-2.10.2.exe`); };
  await assert.rejects(() => baixarAtualizacao('2.10.2', { buscar: cadeia, pasta: pasta(t) }), /UPDATE_DOWNLOAD_FAILED|UPDATE_HASH_MISMATCH/);
  assert.deepEqual(ok.slice(0, 2), ['github.com', 'release-assets.githubusercontent.com'], 'segue o redirecionamento oficial do GitHub');
});
