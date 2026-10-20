import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fixture } from '../../../apoio/fixtures.mjs';
import { resumirDados } from '../../../../dist/ajuda/privacidade/resumirDados.js';
import { politicaRetencao } from '../../../../dist/ajuda/tipos/privacidade.js';
import { diretorioDados } from '../../../../dist/compartilhado/banco/diretorioDados.js';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { hash } from '../../../../dist/compartilhado/seguranca/hash.js';
import { consultarEvidencias } from '../../../../dist/testes/banco/consultarEvidencias.js';
import { excluirEvidencias } from '../../../../dist/testes/banco/excluirEvidencias.js';
import { salvarEvidencia } from '../../../../dist/testes/banco/salvarEvidencia.js';
import { consultarAtividades } from '../../../../dist/logs/banco/consultarAtividades.js';
import { excluirAtividades } from '../../../../dist/logs/banco/excluirAtividades.js';
import { excluirDiagnostico } from '../../../../dist/logs/banco/excluirDiagnostico.js';
import { lerDiagnostico } from '../../../../dist/logs/banco/lerDiagnostico.js';
import { pastaAtividades } from '../../../../dist/logs/banco/pastaAtividades.js';
import { registrarDiagnostico } from '../../../../dist/logs/banco/registrarDiagnostico.js';
import { exportarLogs } from '../../../../dist/logs/regras/exportarLogs.js';
import { iniciarAtividade } from '../../../../dist/logs/regras/iniciarAtividade.js';
import { calcularMetricas } from '../../../../dist/metricas/regras/calcularMetricas.js';
import { adicionarVinculo } from '../../../../dist/projetos/regras/adicionarVinculo.js';
import { listarPastasVinculadas } from '../../../../dist/projetos/regras/listarPastasVinculadas.js';
import { adicionarVinculo as vincularPasta } from '../../../../dist/projetos/regras/adicionarVinculo.js';

const registrar = async (root, n = 1) => { const p = await carregarProjeto(root); for (let i = 0; i < n; i++) iniciarAtividade(p, 'contexto_projeto', { origin: 'MCP', client: 'codex' }).finalizar({ state: 'NOT_VERIFIED' }); return p; };
const gravaveis = { execution: { requireApproval: true, blockedByDefault: [], environment: 'host', readOnly: false, envAllowlist: [], timeoutMs: 3000, maxOutputBytes: 4096 } };
async function evidencia(p, n) {
  const stdout = 'saida';
  return salvarEvidencia(p, { kind: 'execution_evidence', jobId: `00000000-0000-4000-8000-00000000000${n}`, projectId: p.manifesto.id, rootHash: hash(p.raiz), manifestHash: p.manifestoHash, scopeHash: null, capability: 'unit', status: 'PASS',
    reason: 'sintética', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), executed: true, exitCode: 0, command: {}, approval: null, cases: [], stdout, stderr: '', logSha256: hash(stdout + '\n'), resultArtifact: null, evidenceScope: 'round', provenance: 'local-process' });
}
const ev = (at = new Date().toISOString(), extra = {}) => ({ at, channel: 'projeto:logs', state: 'ERROR', durationMs: 3, code: 'PROJECT_NOT_LINKED', correlationId: '11111111-1111-4111-8111-111111111111', ...extra });

test('exclusão do histórico: apaga só os registros do projeto escolhido e preserva código, evidências, vínculo e outros projetos', async (t) => {
  const a = await fixture(t, gravaveis); const b = await fixture(t, { ...gravaveis, id: 'outro', name: 'Outro' });
  const pa = await registrar(a.root, 3); const pb = await registrar(b.root, 2); await evidencia(pa, 1);
  await adicionarVinculo(a.root);
  const r = excluirAtividades(pa);
  assert.deepEqual(r, { deleted: 3, failed: [] }, 'um arquivo por operação');
  assert.equal(consultarAtividades(pa).activities.length, 0);
  assert.equal(consultarAtividades(pb).activities.length, 2, 'outro projeto intacto');
  assert.ok(fs.existsSync(path.join(a.root, 'qa.project.json')) && fs.existsSync(path.join(a.root, 'README.md')) && fs.existsSync(path.join(a.root, 'src/app.mjs')), 'código preservado');
  assert.equal((await consultarEvidencias(pa)).results.length, 1, 'evidência preservada');
  assert.equal((await listarPastasVinculadas()).length, 1, 'vínculo preservado');
  assert.equal(calcularMetricas(consultarAtividades(pa)).totalOperations, 0);
  assert.deepEqual(excluirAtividades(pa), { deleted: 0, failed: [] }, 'idempotente');
});

test('exclusão do histórico: falha parcial (arquivo em uso/permissão) é informada e o restante é apagado', async (t) => {
  const f = await fixture(t); const p = await registrar(f.root, 3);
  const pasta = pastaAtividades(p); const alvos = fs.readdirSync(pasta).sort();
  const original = fs.unlinkSync; let chamadas = 0;
  fs.unlinkSync = (x) => { if (path.basename(x) === alvos[0]) throw Object.assign(new Error('em uso'), { code: 'EBUSY' }); chamadas++; return original(x); };
  t.after(() => { fs.unlinkSync = original; });
  const r = excluirAtividades(p);
  fs.unlinkSync = original;
  assert.equal(r.deleted, 2); assert.deepEqual(r.failed, [{ file: alvos[0], code: 'EBUSY' }]);
  assert.ok(fs.existsSync(path.join(pasta, alvos[0])), 'o arquivo em uso permanece');
  fs.unlinkSync = (x) => { throw Object.assign(new Error('negado'), { code: 'EPERM' }); };
  assert.equal(excluirAtividades(p).failed[0].code, 'EPERM'); fs.unlinkSync = original;
  assert.equal(chamadas, 2);
});

test('exclusão do histórico: recusa links simbólicos e hardlinks, sem seguir para fora da pasta', async (t) => {
  const f = await fixture(t); const p = await registrar(f.root, 1);
  const pasta = pastaAtividades(p); const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo fora ')); t.after(() => fs.rmSync(fora, { recursive: true, force: true }));
  const intocavel = path.join(fora, 'importante.txt'); fs.writeFileSync(intocavel, 'nao apagar');
  const hard = path.join(pasta, '22222222-2222-4222-8222-222222222222.jsonl');
  fs.linkSync(intocavel, hard);
  const r = excluirAtividades(p);
  assert.equal(r.failed.length, 1); assert.equal(r.failed[0].code, 'HISTORY_FILE_INVALID');
  assert.ok(fs.existsSync(intocavel) && fs.existsSync(hard), 'hardlink não foi apagado');
  let linkOk = true; const sym = path.join(pasta, '33333333-3333-4333-8333-333333333333.jsonl');
  try { fs.symlinkSync(intocavel, sym); } catch { linkOk = false; }
  if (linkOk) { const r2 = excluirAtividades(p); assert.ok(r2.failed.some((x) => x.file.startsWith('3333'))); assert.equal(fs.readFileSync(intocavel, 'utf8'), 'nao apagar'); }
});

test('exclusão do histórico: pasta de histórico substituída por link é recusada integralmente', async (t) => {
  const f = await fixture(t); const p = await registrar(f.root, 1);
  const pasta = pastaAtividades(p); const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo alvo ')); t.after(() => fs.rmSync(fora, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fora, '44444444-4444-4444-8444-444444444444.jsonl'), 'x');
  fs.rmSync(pasta, { recursive: true, force: true });
  try { fs.symlinkSync(fora, pasta, 'junction'); } catch { return t.skip('sem permissão para criar junction neste ambiente'); }
  assert.throws(() => excluirAtividades(p), /HISTORY_SYMLINK/);
  assert.ok(fs.existsSync(path.join(fora, '44444444-4444-4444-8444-444444444444.jsonl')), 'alvo do link intacto');
  fs.rmdirSync(pasta);
});

test('exclusão de evidências: só <uuid>.json do projeto; histórico, código e outros arquivos permanecem', async (t) => {
  const f = await fixture(t, gravaveis); const p = await carregarProjeto(f.root); await registrar(f.root, 1);
  await evidencia(p, 1); await evidencia(p, 2);
  const pasta = path.join(f.root, '.prumo', 'evidencias'); fs.writeFileSync(path.join(pasta, 'anotacao-minha.txt'), 'meu arquivo');
  const r = await excluirEvidencias(p);
  assert.deepEqual(r, { deleted: 2, failed: [] });
  assert.equal(fs.readFileSync(path.join(pasta, 'anotacao-minha.txt'), 'utf8'), 'meu arquivo', 'arquivo fora do padrão preservado');
  assert.equal(consultarAtividades(p).activities.length, 1, 'histórico preservado');
  assert.ok(fs.existsSync(path.join(f.root, 'src/app.mjs')));
  assert.equal((await consultarEvidencias(p)).results.length, 0);
  assert.deepEqual(await excluirEvidencias(await carregarProjeto((await fixture(t)).root)), { deleted: 0, failed: [] }, 'projeto sem evidências');
});

test('exclusão de evidências: link simbólico em .prumo é recusado e nada fora da raiz é apagado', async (t) => {
  const f = await fixture(t, gravaveis); const p = await carregarProjeto(f.root);
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo fora ev ')); t.after(() => fs.rmSync(fora, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fora, '55555555-5555-4555-8555-555555555555.json'), '{}');
  fs.mkdirSync(path.join(f.root, '.prumo'));
  try { fs.symlinkSync(fora, path.join(f.root, '.prumo', 'evidencias'), 'junction'); } catch { return t.skip('sem permissão para criar junction neste ambiente'); }
  await assert.rejects(excluirEvidencias(p), /SYMLINK_FORBIDDEN|Links simbólicos/);
  assert.ok(fs.existsSync(path.join(fora, '55555555-5555-4555-8555-555555555555.json')));
});

test('exclusão de evidências: permissão negada em um arquivo é informada sem esconder', async (t) => {
  const f = await fixture(t, gravaveis); const p = await carregarProjeto(f.root); await evidencia(p, 1); await evidencia(p, 2);
  const original = fs.promises.unlink; let primeira = true;
  fs.promises.unlink = async (x) => { if (primeira) { primeira = false; throw Object.assign(new Error('negado'), { code: 'EPERM' }); } return original(x); };
  t.after(() => { fs.promises.unlink = original; });
  const r = await excluirEvidencias(p); fs.promises.unlink = original;
  assert.equal(r.deleted, 1); assert.equal(r.failed.length, 1); assert.equal(r.failed[0].code, 'EPERM');
});

test('diagnóstico: só metadados, com teto diário, separado do histórico e das métricas', async (t) => {
  const f = await fixture(t); const p = await registrar(f.root, 1);
  assert.ok(registrarDiagnostico(ev()));
  assert.equal(registrarDiagnostico({ ...ev(), channel: 'nao valido' }), false);
  assert.equal(registrarDiagnostico({ ...ev(), root: 'C:\\segredo\\projeto' }), false, 'campos extras (ex.: caminhos) são recusados');
  assert.equal(registrarDiagnostico({ ...ev(), code: 'c:\\caminho' }), false);
  const { events } = lerDiagnostico(); assert.equal(events.length, 1);
  assert.doesNotMatch(JSON.stringify(events), /segredo|C:\\\\/);
  assert.equal(calcularMetricas(consultarAtividades(p)).totalOperations, 1, 'diagnóstico não altera métricas de QA');
  assert.equal(consultarAtividades(p).events.length, 2);
  for (let i = 0; i < 20000; i++) if (!registrarDiagnostico(ev())) break;
  const dir = path.join(diretorioDados(), 'diagnostico'); const tamanho = fs.readdirSync(dir).reduce((n, x) => n + fs.statSync(path.join(dir, x)).size, 0);
  assert.ok(tamanho <= 1024 * 1024, 'teto de 1 MiB por dia');
  excluirDiagnostico();
});

test('diagnóstico: linhas inválidas são contadas e ignoradas; exclusão apaga só ipc-*.jsonl', async () => {
  const dir = path.join(diretorioDados(), 'diagnostico'); fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, 'ipc-2026-01-01.jsonl');
  fs.writeFileSync(arquivo, JSON.stringify(ev('2026-01-01T00:00:00.000Z')) + '\n{quebrado\n' + JSON.stringify({ ...ev('2026-01-01T00:00:01.000Z'), extra: 1 }) + '\n');
  fs.writeFileSync(path.join(dir, 'nota.txt'), 'meu');
  const r = lerDiagnostico(); assert.equal(r.events.length, 1); assert.equal(r.invalid, 2);
  assert.deepEqual(excluirDiagnostico(), { deleted: 1, failed: [] });
  assert.ok(fs.existsSync(path.join(dir, 'nota.txt')), 'arquivo alheio preservado');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resumo de dados: pasta real, categorias, retenção e limites de privacidade sem ler conteúdo', async (t) => {
  const f = await fixture(t); await registrar(f.root, 2); await adicionarVinculo(f.root); registrarDiagnostico(ev());
  const r = await resumirDados();
  assert.equal(r.directory, diretorioDados()); assert.ok(r.linkedProjects >= 1); assert.ok(r.totalBytes > 0);
  assert.ok(r.categories.historico.files >= 2 && r.categories.vinculos.files === 1 && r.categories.diagnostico.files >= 1);
  assert.equal(r.retention, politicaRetencao); assert.match(r.retention, /Sem retenção automática/);
  assert.ok(r.notTransmitted.length >= 3 && r.privacyLimits.some((x) => /conversas|prompts/.test(x)));
  assert.doesNotMatch(JSON.stringify(r), /nao-expor|NOT_VERIFIED/);
  excluirDiagnostico();
});

test('exportação usa o esquema e nada vaza por exclusão ou exportação', async (t) => {
  const f = await fixture(t); await registrar(f.root, 1); await vincularPasta(f.root);
  const bruto = JSON.parse(await exportarLogs(f.root));
  assert.equal(bruto.events.length, 2); assert.ok(bruto.exportedAt);
  assert.doesNotMatch(JSON.stringify(bruto), /Users|AppData|prumo espaço/i, 'sem caminhos locais');
});
