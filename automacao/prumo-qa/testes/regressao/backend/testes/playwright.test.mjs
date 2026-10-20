import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Worker } from '../../../../dist/agendamentos/worker/Worker.js';
import { converterRelatorioPlaywright } from '../../../../dist/testes/regras/converterRelatorioPlaywright.js';

const require = createRequire(import.meta.url);
const folha = (specs) => ({ suites: [{ title: 'login.spec.ts', file: 'login.spec.ts', specs, suites: [] }] });
const spec = (title, status, results, extra = {}) => ({ title, file: 'login.spec.ts', tests: [{ status, results, ...extra }] });

test('relatório JSON do Playwright vira cenários individuais sem inventar nada', () => {
  const casos = converterRelatorioPlaywright(folha([
    spec('entra com Editor', 'expected', [{ status: 'passed' }]),
    spec('Leitor é recusado', 'unexpected', [{ status: 'failed', error: { message: '\u001b[31mExpected 403\u001b[39m' } }]),
    spec('instável', 'flaky', [{ status: 'failed' }, { status: 'passed' }]),
    spec('ignorado', 'skipped', [{ status: 'skipped' }]),
    spec('estourou', 'unexpected', [{ status: 'timedOut' }]),
    spec('interrompido', 'unexpected', [{ status: 'interrupted' }]),
    spec('estranho', 'desconhecido', [{ status: 'passed' }])
  ]));
  const por = Object.fromEntries(casos.map((c) => [c.id.split('› ').at(-1), c]));
  assert.equal(por['entra com Editor'].status, 'PASS'); assert.equal(por['Leitor é recusado'].status, 'FAIL'); assert.equal(por['Leitor é recusado'].evidence, 'Expected 403');
  assert.equal(por['instável'].status, 'PASS'); assert.match(por['instável'].evidence, /instável/); assert.equal(por['ignorado'].status, 'NOT_RUN');
  assert.equal(por['estourou'].status, 'FAIL'); assert.match(por['estourou'].evidence, /Tempo esgotado/); assert.equal(por['interrompido'].status, 'NOT_RUN'); assert.equal(por['estranho'].status, 'BLOCKED');
  assert.deepEqual(converterRelatorioPlaywright({ suites: [] }), [], 'sem testes não há cenário vazio para declarar cobertura');
  assert.throws(() => converterRelatorioPlaywright({ foo: 1 }));
});

test('reporter do Prumo grava o contrato PRUMO_RESULT_FILE, trata retentativas e ignora execução fora do Prumo', (t) => {
  const Reporter = require('../../../../backend/testes/reporters/prumo-playwright-reporter.cjs'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo rep ')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const alvo = path.join(dir, 'r.json'); process.env.PRUMO_RESULT_FILE = alvo; process.env.PRUMO_JOB_ID = '11111111-1111-4111-8111-111111111111'; t.after(() => { delete process.env.PRUMO_RESULT_FILE; delete process.env.PRUMO_JOB_ID; });
  const tt = (id, titulo) => ({ id, expectedStatus: 'passed', titlePath: () => ['', 'chromium', 'login.spec.ts', titulo] });
  const r = new Reporter(); const a = tt('a', 'abre'); const b = tt('b', 'grava');
  r.onTestEnd(a, { status: 'passed', retry: 0 }); r.onTestEnd(b, { status: 'failed', retry: 0, error: { message: 'x' } }); r.onTestEnd(b, { status: 'passed', retry: 1 });
  r.onTestEnd(tt('c', 'pula'), { status: 'skipped', retry: 0 }); r.onEnd();
  const j = JSON.parse(fs.readFileSync(alvo, 'utf8')); assert.equal(j.jobId, process.env.PRUMO_JOB_ID); assert.equal(j.cases.length, 3);
  assert.deepEqual(j.cases.map((c) => c.status), ['PASS', 'PASS', 'NOT_RUN']); assert.match(j.cases[1].evidence, /instável/);
  delete process.env.PRUMO_RESULT_FILE; fs.unlinkSync(alvo); new Reporter().onEnd(); assert.equal(fs.existsSync(alvo), false);
});

test('segunda instância em OUTRO processo é recusada enquanto o worker está vivo', async (t) => {
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo trava ')); t.after(() => fs.rmSync(b, { recursive: true, force: true }));
  const w = new Worker({ base: b, semTemporizador: true }); w.iniciar(); t.after(() => w.parar());
  const filho = spawnSync(process.execPath, [path.resolve('testes/apoio/_worker-filho.mjs'), b], { encoding: 'utf8' });
  assert.match(filho.stdout, /RECUSADO:WORKER_ALREADY_RUNNING/);
  await w.parar();
  const depois = spawnSync(process.execPath, [path.resolve('testes/apoio/_worker-filho.mjs'), b], { encoding: 'utf8' });
  assert.match(depois.stdout, /INICIOU/, 'após encerrar, a trava é liberada');
});
