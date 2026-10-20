import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { baixarInstaladores } from '../../../../site/baixar-instalador.mjs';

function preparar(t, corromper = false) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-download-sintetico-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const bytes = Buffer.from('instalador sintético, não executável');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const ler = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (arquivo, ...args) => String(arquivo).replaceAll('\\', '/').endsWith('/docs/catalogo/versoes.json')
    ? JSON.stringify({ versions: [{ version: '9.8.7', status: 'publicada', installer: { sha256 } }] }) : ler(arquivo, ...args));
  const chamadas = [];
  t.mock.method(globalThis, 'fetch', async url => {
    chamadas.push(url);
    if (url.endsWith('Prumo-QA-Setup-9.8.7.exe.sha256')) return new Response(sha256 + ' *Prumo-QA-Setup-9.8.7.exe\n');
    if (url.endsWith('Prumo-QA-Setup-9.8.7.exe')) return new Response(corromper ? Buffer.from('corrompido') : bytes);
    return new Response('', { status: 404 });
  });
  return { pasta, bytes, sha256, chamadas };
}

test('site hospeda só instalador conferido e omite plataformas ausentes, com fetch sintético', async t => {
  const a = preparar(t);
  const r = await baixarInstaladores(a.pasta);
  assert.equal(r.instaladores.length, 1);
  assert.equal(r.instaladores[0].id, 'win');
  assert.equal(r.instaladores[0].sha256, a.sha256);
  assert.deepEqual(fs.readFileSync(path.join(a.pasta, 'download/Prumo-QA-Setup-9.8.7.exe')), a.bytes);
  assert.equal(JSON.parse(fs.readFileSync(path.join(a.pasta, 'download/instaladores.json'))).version, '9.8.7');
  assert.ok(a.chamadas.every(url => url.startsWith('https://github.com/AnaPLysyk/Prumo-Qa/releases/download/v9.8.7/')));
});

test('site recusa instalador corrompido antes de gravar arquivo ou manifesto', async t => {
  const a = preparar(t, true);
  await assert.rejects(baixarInstaladores(a.pasta), /SHA-256/);
  assert.deepEqual(fs.readdirSync(path.join(a.pasta, 'download')), []);
});
