/** Resultados vêm de eventos reais de um runner sintético, sem banco ou projeto externo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { casoDoNode } from '../../../../backend/testes/reporters/prumo-node-reporter.mjs';

test('reporter node preserva PASS, FAIL e skip/TODO a partir de eventos reais', async (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo reporter '));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const fonte = path.join(raiz, 'fixture.test.mjs');
  fs.writeFileSync(fonte, "import test from 'node:test'; import assert from 'node:assert/strict';\ntest('passa', () => assert.equal(1, 1));\ntest('falha', () => assert.equal(1, 2));\ntest.skip('pulado', () => {});\ntest.todo('pendente');\n");
  const runner = path.join(raiz, 'runner.mjs');
  fs.writeFileSync(runner, `import { run } from 'node:test';
import { casoDoNode } from ${JSON.stringify(new URL('../../../../backend/testes/reporters/prumo-node-reporter.mjs', import.meta.url).href)};
const raiz = ${JSON.stringify(raiz)}, fonte = ${JSON.stringify(fonte)}, casos = [];
for await (const e of run({ files: [fonte], concurrency: 1 })) {
  if (!['test:pass', 'test:fail'].includes(e.type)) continue;
  const c = casoDoNode(e.data, e.type === 'test:pass' ? 'PASS' : 'FAIL', { raiz, grupo: 'fixture', indice: casos.length });
  if (c) casos.push(c);
}
console.log(JSON.stringify(casos));`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const resultado = spawnSync(process.execPath, [runner], { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(resultado.status, 0, resultado.stderr);
  const casos = JSON.parse(resultado.stdout);
  assert.deepEqual(casos.map(c => c.status), ['PASS', 'FAIL', 'NOT_RUN', 'NOT_RUN']);
  assert.equal(new Set(casos.map(c => c.id)).size, 4);
  assert.ok(casos.every(c => c.evidence.includes('fixture.test.mjs:')));
  assert.match(casos[2].evidence, /SKIPPED/);
  assert.equal(casoDoNode({ details: { type: 'suite' } }, 'PASS', { raiz, grupo: 'fixture', indice: 0 }), null);
});
