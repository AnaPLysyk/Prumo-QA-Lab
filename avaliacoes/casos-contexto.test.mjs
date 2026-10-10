import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { avaliarRevisao, resumir } from './criterios.mjs';

/** Casos 9 a 14 (contextos persistentes e Playwright). Respostas abaixo são FIXTURES SINTÉTICAS rotuladas, só para provar os critérios. */
const caso = (n) => ({ esperado: JSON.parse(fs.readFileSync(`cenarios/caso-${n}/esperado.json`, 'utf8')), plano: JSON.parse(fs.readFileSync(`cenarios/caso-${n}/plano.json`, 'utf8')) });
const base = { state: 'NOT_VERIFIED', executed: false, suggestedSelection: [] };
const mcpJs = process.env.PRUMO_MCP ?? path.resolve('..', 'Prumo-Qa', 'dist', 'mcp.js');

test('casos 9 a 14 estão completos: sementes coerentes com o plano, recursos exigidos e limites conhecidos', () => {
  for (let n = 9; n <= 14; n++) {
    const { esperado, plano } = caso(n);
    assert.equal(esperado.caso, n); assert.ok(['contextoId', 'frameworks'].includes(esperado.exigeRecurso)); assert.ok(esperado.limitesConhecidos.length > 0);
    if (esperado.semente) {
      assert.equal(esperado.mcpHabilitado, true);
      assert.ok(esperado.semente.some((s) => s.ref === plano.contextoRef), `caso ${n}: o plano referencia uma semente existente`);
      for (const s of esperado.semente) assert.ok(s.conteudo.texto && s.conteudo.chave && s.conteudo.origem, `caso ${n}`);
    } else assert.ok(plano.existingTests[0].testPath.endsWith('.spec.ts'));
  }
});

test('o caso 9 só pode ser atendido com contexto aprovado usado, sem achados de contexto', () => {
  const { esperado } = caso(9);
  const boa = { ...base, facts: [{ kind: 'context_used', estado: 'APROVADO', requirementFoundInContext: true }], findings: [] };
  assert.ok(resumir(avaliarRevisao(esperado, boa)).aprovado);
  for (const ruim of [{ ...boa, facts: [] }, { ...boa, facts: [{ kind: 'context_used', estado: 'RASCUNHO', requirementFoundInContext: true }] }, { ...boa, findings: [{ type: 'CONTEXT_NOT_APPROVED' }] }, { ...boa, state: 'PASS', executed: true }])
    assert.equal(resumir(avaliarRevisao(esperado, ruim)).aprovado, false);
});

test('conflito, desatualizado e sem origem exigem o achado específico (e o conflito exige severidade alta)', () => {
  const casoCom = (n, fatoEstado, achados) => resumir(avaliarRevisao(caso(n).esperado, { ...base, facts: [{ kind: 'context_used', estado: fatoEstado }], findings: achados })).aprovado;
  assert.equal(casoCom(10, 'CONFLITANTE', [{ type: 'CONTEXT_CONFLICT', severity: 'high' }]), true);
  assert.equal(casoCom(10, 'CONFLITANTE', [{ type: 'CONTEXT_CONFLICT', severity: 'low' }]), false, 'conflito com severidade baixa não atende');
  assert.equal(casoCom(10, 'CONFLITANTE', []), false);
  assert.equal(casoCom(11, 'DESATUALIZADO', [{ type: 'CONTEXT_OUTDATED', severity: 'high' }]), true); assert.equal(casoCom(11, 'DESATUALIZADO', []), false);
  assert.equal(casoCom(12, 'RASCUNHO', [{ type: 'CONTEXT_SOURCE_MISSING' }, { type: 'CONTEXT_NOT_APPROVED' }]), true); assert.equal(casoCom(12, 'RASCUNHO', [{ type: 'CONTEXT_NOT_APPROVED' }]), false);
});

test('isolamento: nenhum fato de contexto pode existir e o contexto alheio aparece só como indisponível', () => {
  const { esperado } = caso(13);
  assert.ok(resumir(avaliarRevisao(esperado, { ...base, facts: [], findings: [{ type: 'CONTEXT_UNAVAILABLE', severity: 'high' }] })).aprovado);
  assert.equal(resumir(avaliarRevisao(esperado, { ...base, facts: [{ kind: 'context_used', estado: 'APROVADO' }], findings: [{ type: 'CONTEXT_UNAVAILABLE', severity: 'high' }] })).aprovado, false, 'ver o contexto de outro projeto reprova');
  assert.equal(resumir(avaliarRevisao(esperado, { ...base, facts: [], findings: [] })).aprovado, false);
});

test('Playwright: exige todos os antipadrões do arquivo e reprova achado em teste bom ou regra inexistente (precisão)', () => {
  const { esperado } = caso(14);
  const achados = esperado.obrigatorios.map((o) => ({ type: o.type, scenario: 'E2E', severity: 'medium', evidence: [{ trecho: 'await page.waitForTimeout(3000)' }] }));
  const boa = { ...base, facts: [{ kind: 'test_read', id: 'E2E' }], findings: achados };
  assert.ok(resumir(avaliarRevisao(esperado, boa)).aprovado);
  assert.equal(resumir(avaliarRevisao(esperado, { ...boa, findings: achados.slice(1) })).aprovado, false, 'faltou um antipadrão');
  assert.equal(resumir(avaliarRevisao(esperado, { ...boa, findings: [...achados, { type: 'PW_SELETOR_FRAGIL', scenario: 'E2E', evidence: [{ trecho: "page.getByRole('button', { name: 'Salvar' })" }] }] })).aprovado, false, 'apontar o teste bom é falso positivo');
  assert.equal(resumir(avaliarRevisao(esperado, { ...boa, findings: [...achados, { type: 'PW_TEST_ONLY', scenario: 'E2E', evidence: [] }] })).aprovado, false, 'regra que não se aplica ao arquivo');
});

test('a fixture Playwright é estática: o laboratório não instala nem executa o Playwright', () => {
  const pkg = JSON.parse(fs.readFileSync('aplicacao/package.json', 'utf8'));
  assert.ok(pkg.devDependencies['@playwright/test']); assert.equal(fs.existsSync('node_modules/@playwright'), false);
  const raiz = JSON.parse(fs.readFileSync('package.json', 'utf8')); assert.equal(raiz.dependencies['@playwright/test'], undefined);
  const spec = fs.readFileSync('aplicacao/testes-e2e/pedidos.spec.ts', 'utf8'); assert.doesNotMatch(spec, /intencional|antipadr|lacuna|mutante|esperado\.json/i, 'a fixture não entrega a resposta ao agente');
});

test('rodada real contra o MCP do Prumo atual: todos os casos aplicáveis passam; versões sem o recurso seriam NAO_APLICAVEL', { skip: !fs.existsSync(mcpJs) && 'Prumo não encontrado' }, () => {
  const r = spawnSync(process.execPath, ['avaliacoes/avaliar.mjs', '--sem-gravar', '--prumo', mcpJs], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = /(\d+)\/(\d+) casos/.exec(r.stdout); assert.equal(m[1], m[2]); assert.ok(Number(m[2]) >= 8);
  const dist = path.dirname(mcpJs);
  if (fs.existsSync(path.join(dist, 'contextos.js'))) assert.match(r.stdout, /OK\s+caso 14/); else assert.match(r.stdout, /N\/A\s+caso 9/);
});
