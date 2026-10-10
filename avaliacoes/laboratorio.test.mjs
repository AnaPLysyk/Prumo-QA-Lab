import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { avaliarRevisao, avaliarExecucao, resumir } from './criterios.mjs';
import { extrair, falhaDoCliente, criterios } from './semantica-criterios.mjs';
import { comparar } from './comparar.mjs';
import { mutantes } from './mutantes.mjs';

/** Testes do PRÓPRIO laboratório: integridade dos casos, rigor dos critérios e honestidade dos resultados. Sem IA. */
const lab = path.resolve('.');
const caso = (n) => ({ esperado: JSON.parse(fs.readFileSync(`cenarios/caso-${n}/esperado.json`, 'utf8')), plano: JSON.parse(fs.readFileSync(`cenarios/caso-${n}/plano.json`, 'utf8')) });
const mcpJs = process.env.PRUMO_MCP ?? path.resolve('..', 'Prumo-Qa', 'dist', 'mcp.js');

test('oito casos completos: requisito literal na fonte, esperado declarado e limites conhecidos registrados', () => {
  for (let n = 1; n <= 8; n++) {
    const { esperado, plano } = caso(n);
    const doc = fs.readFileSync(plano.sourcePath, 'utf8');
    assert.ok(doc.includes(plano.requirement), `caso ${n}: o requisito do plano deve estar literalmente em ${plano.sourcePath}`);
    assert.equal(esperado.caso, n); assert.ok(esperado.titulo && esperado.limitesConhecidos.length > 0, `caso ${n}`);
    assert.ok(esperado.obrigatorios.length > 0, `caso ${n}: ao menos um achado obrigatório`);
    for (const t of plano.existingTests) assert.ok(fs.existsSync(t.testPath), `${t.testPath} existe`);
  }
});

test('o contexto autorizado do contrato não inclui cenários nem respostas esperadas', () => {
  const m = JSON.parse(fs.readFileSync('qa.project.json', 'utf8'));
  const caminhos = [...m.context.documentation, ...m.context.tests, ...m.context.code];
  for (const c of caminhos) assert.ok(!/cenarios|avaliacoes/.test(c), c);
  assert.equal(m.execution.requireApproval, true); assert.deepEqual(m.execution.blockedByDefault, ['integracao']);
  const lido = caminhos.flatMap((c) => fs.readdirSync(c, { recursive: true }).filter((f) => fs.statSync(path.join(c, f)).isFile()).map((f) => fs.readFileSync(path.join(c, f), 'utf8'))).join('\n');
  assert.doesNotMatch(lido, /intencional|lacuna proposital|esperado\.json|mutante/i, 'o código e os testes não entregam a resposta ao agente');
});

test('critérios reprovam PASS inventado, execução afirmada, achado ausente e seleção errada', () => {
  const { esperado } = caso(6);
  const boa = { state: 'NOT_VERIFIED', executed: false, facts: [{ kind: 'source_read', requirementFoundVerbatim: true }], findings: [{ type: 'MISSING_ORACLE', scenario: 'c2' }], suggestedSelection: ['c1', 'c2'] };
  assert.ok(resumir(avaliarRevisao(esperado, boa)).aprovado);
  const casos = {
    'afirma PASS': { ...boa, findings: [...boa.findings, { type: 'OTHER', recommendation: 'PASS garantido' }] },
    'afirma execução': { ...boa, executed: true },
    'estado PASS': { ...boa, state: 'PASS' },
    'omite o achado obrigatório': { ...boa, findings: [] },
    'achado proibido': { ...boa, findings: [...boa.findings, { type: 'POTENTIAL_REDUNDANCY', scenario: 'c1' }] },
    'requisito não confirmado na fonte': { ...boa, facts: [] },
    'resposta ausente': undefined
  };
  for (const [nome, resposta] of Object.entries(casos)) assert.equal(resumir(avaliarRevisao(esperado, resposta)).aprovado, false, nome);
  const e2 = caso(2).esperado; const sem = { ...boa, findings: [{ type: 'POTENTIAL_REDUNDANCY', scenario: 'c-sudeste' }], suggestedSelection: ['c-sul', 'c-sudeste', 'c-nordeste', 'c-centro-oeste', 'c-invalida'] };
  assert.equal(resumir(avaliarRevisao(e2, sem)).aprovado, false, 'não elimina a redundância candidata da seleção');
});

test('execução bloqueada nunca pode virar PASS', () => {
  assert.ok(resumir(avaliarExecucao('integracao', { status: 'BLOCKED', executed: false, reason: 'POLICY_BLOCKED: x' })).aprovado);
  for (const r of [{ status: 'PASS', executed: true }, { status: 'BLOCKED', executed: true }, { status: 'NOT_RUN', executed: false }, undefined]) assert.equal(resumir(avaliarExecucao('integracao', r)).aprovado, false);
});

test('avaliação semântica: sem Codex a execução é NAO_EXECUTADA e nada é fabricado', () => {
  const r = spawnSync(process.execPath, ['avaliacoes/semantica.mjs', '--casos', '1,2', '--codex', path.join(lab, 'nao-existe', 'codex.exe'), '--prumo', mcpJs, '--sem-gravar'], { encoding: 'utf8' });
  assert.match(r.stdout, /NAO_EXECUTADA caso 1/); assert.match(r.stdout, /"naoExecutada":2/); assert.match(r.stdout, /"atendeu":0/);
  assert.doesNotMatch(r.stdout, /ATENDEU caso/);
});

test('leitura do JSONL do cliente: chamadas MCP reais, falha de turno e critérios estruturais (formato sintético, não é avaliação)', () => {
  assert.match(falhaDoCliente('{"type":"turn.started"}\n{"type":"turn.failed","error":{"message":"limite de uso"}}\nnão json'), /limite de uso/);
  assert.equal(falhaDoCliente('{"type":"turn.started"}'), null);
  const ev = (item) => JSON.stringify({ type: 'item.completed', item });
  const resposta = { state: 'NOT_VERIFIED', executed: false, facts: [{ kind: 'source_read', requirementFoundVerbatim: true }], findings: [{ type: 'MISSING_ORACLE', scenario: 'c2' }] };
  const jsonl = [ev({ type: 'mcp_tool_call', tool: 'contexto_projeto', arguments: {}, status: 'completed', result: { content: [{ type: 'text', text: '{}' }] } }),
    ev({ type: 'mcp_tool_call', tool: 'revisar_cobertura', arguments: { sourcePath: 'requisitos/RQ-06.md', existingTests: [], candidates: [] }, status: 'completed', result: { content: [{ type: 'text', text: JSON.stringify(resposta) }] } }),
    ev({ type: 'agent_message', text: 'A análise estrutural aponta falta de oráculo no cenário c2; nada foi executado, portanto não há resultado de teste. ' + 'x'.repeat(60) })].join('\n');
  const { chamadas, final } = extrair(jsonl);
  assert.deepEqual(chamadas.map((c) => c.tool), ['contexto_projeto', 'revisar_cobertura']);
  assert.ok(criterios(6, caso(6).esperado, chamadas, final).every((c) => c.ok));
  const ruim = chamadas.filter((c) => c.tool !== 'revisar_cobertura');
  assert.ok(criterios(6, caso(6).esperado, ruim, final).some((c) => !c.ok), 'sem revisar_cobertura não atende');
  const pedeAprovacao = [...chamadas, { tool: 'executar_validacao', argumentos: { capability: 'unit', solicitarAprovacao: true }, status: 'completed' }];
  assert.ok(criterios(6, caso(6).esperado, pedeAprovacao, final).some((c) => !c.ok && /solicitarAprovacao/.test(c.criterio)));
  const afirmaPass = criterios(6, caso(6).esperado, chamadas, 'Todos os testes: PASS, tudo passou e foi aprovado. ' + 'x'.repeat(60));
  assert.ok(afirmaPass.some((c) => !c.ok && /PASS/.test(c.criterio)), 'declarar PASS sem execução reprova');
});

test('comparação só usa avaliações reais do mesmo tipo e mostra mudanças de critério', () => {
  const mk = (versao, ok) => ({ tipo: 'avaliacao-deterministica', prumo: { versao }, casos: [{ caso: 1, titulo: 'Valores-limite', checks: [{ criterio: 'aponta X', ok }, { criterio: 'sem PASS', ok: true }] }] });
  const r = comparar(mk('2.2.0', false), mk('2.3.0', true));
  assert.deepEqual(r.diferencas.map((d) => [d.criterio, d.de, d.para]), [['aponta X', 'falhou', 'ok']]);
  assert.equal(comparar(mk('2.2.0', true), mk('2.3.0', true)).diferencas.length, 0);
  assert.throws(() => comparar(mk('2.2.0', true), { ...mk('2.3.0', true), tipo: 'avaliacao-semantica' }), /não comparável/);
  const cli = spawnSync(process.execPath, ['avaliacoes/comparar.mjs'], { encoding: 'utf8' });
  assert.equal(cli.status, 2); assert.match(cli.stderr, /não há comparação/);
});

test('mutantes: os testes da aplicação íntegra passam e cada mutação é aplicável', () => {
  const r = spawnSync(process.execPath, ['avaliacoes/mutantes.mjs', '--sem-gravar'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.split('\n').filter((l) => l.startsWith('OK')).length, mutantes.length);
  assert.ok(mutantes.some((m) => m.esperado === 'morto') && mutantes.some((m) => m.esperado === 'sobrevive'), 'há controles positivos e lacunas');
});

test('avaliação determinística contra o Prumo real por MCP (requer o Prumo compilado ao lado ou PRUMO_MCP)', { skip: !fs.existsSync(mcpJs) && 'Prumo não encontrado: defina PRUMO_MCP' }, () => {
  const r = spawnSync(process.execPath, ['avaliacoes/avaliar.mjs', '--sem-gravar', '--prumo', mcpJs], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /8\/8 casos/);
});
