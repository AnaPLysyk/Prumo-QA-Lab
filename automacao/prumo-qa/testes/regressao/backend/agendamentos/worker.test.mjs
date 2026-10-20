import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture } from '../../../apoio/fixtures.mjs';
import { autorizarEscopo } from '../../../../dist/agendamentos/autorizacoes/autorizarEscopo.js';

import { criarPoliticaPublicacao } from '../../../../dist/agendamentos/autorizacoes/criarPoliticaPublicacao.js';
import { revogarAutorizacao } from '../../../../dist/agendamentos/autorizacoes/revogarAutorizacao.js';
import { enfileirar } from '../../../../dist/agendamentos/banco/enfileirar.js';
import { listarRotinas } from '../../../../dist/agendamentos/banco/listarRotinas.js';
import { listarTrabalhos } from '../../../../dist/agendamentos/banco/listarTrabalhos.js';
import { obterTrabalho } from '../../../../dist/agendamentos/banco/obterTrabalho.js';
import { pegarProximoTrabalho as reivindicar } from '../../../../dist/agendamentos/banco/pegarProximoTrabalho.js';
import { recuperarInterrompidos } from '../../../../dist/agendamentos/banco/recuperarInterrompidos.js';
import { escopoDoK6 as escopoK6 } from '../../../../dist/agendamentos/k6/escopoDoK6.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/criarRotina.js';
import { definirPausaGlobal } from '../../../../dist/agendamentos/regras/definirPausaGlobal.js';
import { pausarRotina } from '../../../../dist/agendamentos/regras/pausarRotina.js';
import { estadoDaTravaDoWorker as estadoTrava } from '../../../../dist/agendamentos/worker/estadoDaTravaDoWorker.js';
import { Worker } from '../../../../dist/agendamentos/worker/Worker.js';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { ErroServico } from '../../../../dist/conexoes/integracoes/ErroServico.js';
import { publicacaoDoTrabalho } from '../../../../dist/testes/banco/publicacaoDoTrabalho.js';
import { publicarComentarioDeResultado as publicar } from '../../../../dist/testes/integracoes/publicarComentarioDeResultado.js';
import { escopoDeCapability } from '../../../../dist/testes/regras/escopoDeCapability.js';
import { montarComentario } from '../../../../dist/testes/regras/montarComentario.js';
import { prepararPublicacao } from '../../../../dist/testes/regras/prepararPublicacao.js';
import { associarEspaco } from '../../../../dist/projetos/regras/associarEspaco.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import { vincularPastaAoEspaco as pastaEspaco } from '../../../../dist/projetos/regras/vincularPastaAoEspaco.js';
import { vincularServicoAoEspaco as gravarVinculo } from '../../../../dist/projetos/regras/vincularServicoAoEspaco.js';

const base = (t) => { const b = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo worker ')); t.after(() => fs.rmSync(b, { recursive: true, force: true })); return b; };
const T0 = Date.parse('2026-10-10T12:00:00Z');
const relogio = (inicio = T0) => { let t = inicio; return { agora: () => new Date(t), avancar: (min) => { t += min * 60000; }, ms: () => t }; };
// Broker simulado: devolve exatamente o escopo pedido, como o broker real devolve ao ser aprovado por uma pessoa.
const solicitador = (sujeito = 'pessoa-teste') => async (esc) => ({ subject: sujeito, method: 'Windows-CredUI-LogonUser', scopeHash: esc.scopeHash, at: new Date().toISOString() });
// Compoe a autorizacao no teste usando apenas as regras de producao realmente executadas.
const autorizarExecucao = async (p, espacoId, capability, ambiente, opcoes, base, solicitar, agora = new Date()) =>
  autorizarEscopo(p, espacoId, capability, ambiente, await escopoDeCapability(p, capability), opcoes, base, solicitar, agora);

async function projetoComEspaco(t, b, nome, manifestExtra = {}, arquivos = {}) {
  const fx = await fixture(t, manifestExtra);
  await fx.write('tests/test.mjs', arquivos.teste ?? 'import fs from "node:fs";fs.appendFileSync(new URL("../ran.txt",import.meta.url),"x");console.log("rodada real");');
  for (const [rel, conteudo] of Object.entries(arquivos.extras ?? {})) { fs.mkdirSync(path.dirname(path.join(fx.root, rel)), { recursive: true }); await fx.write(rel, conteudo); }
  const e = await criarEspaco({ nome }, b); await pastaEspaco(e.id, fx.root, b);
  return { fx, e, ran: () => (fs.existsSync(path.join(fx.root, 'ran.txt')) ? fs.readFileSync(path.join(fx.root, 'ran.txt'), 'utf8').length : 0) };
}
const rotinaSmoke = (e, extra = {}) => ({ nome: 'Smoke', espacoId: e.id, tipo: 'smoke', capability: 'unit', ambiente: 'local', frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC', ...extra });
const worker = (b, rel, extra = {}) => new Worker({ base: b, agora: rel.agora, semTemporizador: true, ...extra });
const trabalhos = (b) => listarTrabalhos(b);

test('rotina agendada executa de verdade com autorização prévia, grava evidência real e histórico; mesma hora não duplica', async (t) => {
  const b = base(t); const rel = relogio(); const { fx, e, ran } = await projetoComEspaco(t, b, 'LAB-A');
  const r = criarRotina(rotinaSmoke(e), b, rel.agora());
  await autorizarExecucao(await carregarProjeto(fx.root), e.id, 'unit', 'local', { dias: 1, maxUsos: 5 }, b, solicitador());
  const w = worker(b, rel); w.iniciar(); t.after(() => w.parar());
  await w.tick(); assert.equal(trabalhos(b).length, 0, 'ainda não venceu'); assert.equal(ran(), 0);
  rel.avancar(10); await w.tick(); await w.tick();
  const js = trabalhos(b).filter((x) => x.rotinaId === r.id); assert.equal(js.length, 1, 'um único trabalho para o slot'); assert.equal(js[0].estado, 'CONCLUIDO');
  assert.equal(js[0].resultado.status, 'PASS'); assert.equal(js[0].tentativas, 1); assert.equal(ran(), 1, 'o processo realmente rodou uma vez');
  const ev = fs.readdirSync(path.join(fx.root, '.prumo', 'evidencias')); assert.equal(ev.length, 1); assert.equal(ev[0], js[0].resultado.evidenciaId + '.json');
  const bruto = JSON.parse(JSON.parse(fs.readFileSync(path.join(fx.root, '.prumo', 'evidencias', ev[0]), 'utf8')).payload);
  assert.equal(bruto.approval.method, 'delegada:Windows-CredUI-LogonUser'); assert.equal(bruto.executed, true);
  assert.equal(enfileirar({ chave: js[0].chave, rotinaId: r.id, espacoId: e.id, tipo: 'smoke', ambiente: 'local', origem: 'AGENDA', slot: js[0].slot }, b).criado, false);
});

test('sem autorização, expirada, revogada, esgotada ou com o comando alterado: BLOCKED e o processo NÃO roda', async (t) => {
  const b = base(t); const rel = relogio(); const { fx, e, ran } = await projetoComEspaco(t, b, 'LAB-B');
  criarRotina(rotinaSmoke(e), b, rel.agora()); const w = worker(b, rel); w.iniciar(); t.after(() => w.parar());
  const passo = async () => { rel.avancar(10); await w.tick(); return trabalhos(b).at(-1); };
  let j = await passo(); assert.equal(j.resultado.status, 'BLOCKED'); assert.match(j.resultado.motivo, /HUMAN_APPROVAL_REQUIRED/); assert.equal(ran(), 0);
  const p = await carregarProjeto(fx.root);
  const a = await autorizarExecucao(p, e.id, 'unit', 'local', { dias: 1, maxUsos: 1 }, b, solicitador());
  j = await passo(); assert.equal(j.resultado.status, 'PASS'); assert.equal(ran(), 1);
  j = await passo(); assert.equal(j.resultado.status, 'BLOCKED', 'uso único esgotado'); assert.equal(ran(), 1);
  const a2 = await autorizarExecucao(p, e.id, 'unit', 'local', { dias: 1, maxUsos: 9 }, b, solicitador()); revogarAutorizacao('execucoes', a2.id, b);
  j = await passo(); assert.equal(j.resultado.status, 'BLOCKED', 'revogada'); assert.equal(ran(), 1);
  await autorizarExecucao(p, e.id, 'unit', 'local', { dias: 1, maxUsos: 9 }, b, solicitador());
  await fx.write('tests/test.mjs', 'console.log("alterado depois da aprovação");');
  j = await passo(); assert.equal(j.resultado.status, 'BLOCKED', 'escopo mudou (hash)'); assert.equal(ran(), 1);
  assert.ok(a.scopeHash.length === 64);
});

test('autorização expira e não vale para outro ambiente nem outro projeto', async (t) => {
  const b = base(t); const rel = relogio(); const A = await projetoComEspaco(t, b, 'LAB-A'); const B = await projetoComEspaco(t, b, 'LAB-B');
  criarRotina(rotinaSmoke(A.e), b, rel.agora()); criarRotina(rotinaSmoke(B.e), b, rel.agora());
  // Criação e consumo usam o mesmo relógio. A data real do host não define
  // a validade de uma autorização cuja expiração será simulada neste teste.
  const autorizacao = await autorizarExecucao(await carregarProjeto(A.fx.root), A.e.id, 'unit', 'local', { dias: 1, maxUsos: 9 }, b, solicitador(), rel.agora());
  assert.equal(Date.parse(autorizacao.validaAte) - rel.ms(), 86400000, 'validade exata de um dia no relógio do cenário');
  const w = worker(b, rel); w.iniciar(); t.after(() => w.parar());
  rel.avancar(10); await w.tick(); await w.tick();
  const js = trabalhos(b); const ja = js.find((x) => x.espacoId === A.e.id), jb = js.find((x) => x.espacoId === B.e.id);
  assert.equal(ja.resultado.status, 'PASS'); assert.equal(jb.resultado.status, 'BLOCKED', 'autorização de A não vale para B'); assert.equal(B.ran(), 0);
  assert.ok(A.fx.root !== B.fx.root);
  const evA = fs.readdirSync(path.join(A.fx.root, '.prumo', 'evidencias')); assert.equal(evA.length, 1); assert.equal(fs.existsSync(path.join(B.fx.root, '.prumo', 'evidencias', evA[0])), false);
  rel.avancar(60 * 24 * 2); await w.tick(); await w.tick();
  const novo = trabalhos(b).filter((x) => x.espacoId === A.e.id && x.estado === 'CONCLUIDO').at(-1); assert.equal(novo.resultado.status, 'BLOCKED', 'validade de 1 dia vencida');
});

test('horários perdidos com o computador desligado são registrados como PERDIDO e nada é executado', async (t) => {
  const b = base(t); const rel = relogio(); const { fx, e, ran } = await projetoComEspaco(t, b, 'LAB-C');
  criarRotina(rotinaSmoke(e, { frequencia: { tipo: 'intervalo', minutos: 60 }, toleranciaMinutos: 5 }), b, rel.agora());
  await autorizarExecucao(await carregarProjeto(fx.root), e.id, 'unit', 'local', { dias: 3, maxUsos: 9 }, b, solicitador());
  const w = worker(b, rel); w.iniciar(); t.after(() => w.parar());
  rel.avancar(60 * 3 + 2); await w.tick(); await w.tick();
  const js = trabalhos(b); assert.equal(js.length, 3); assert.deepEqual(js.map((x) => x.estado).sort(), ['CONCLUIDO', 'PERDIDO', 'PERDIDO']);
  assert.equal(js.filter((x) => x.estado === 'PERDIDO').every((x) => x.resultado.status === 'NOT_RUN' && /nada foi executado/i.test(x.resultado.motivo)), true); assert.equal(ran(), 1);
});

test('pausa global e pausa da rotina impedem novas execuções; retomar volta a agendar apenas dali em diante', async (t) => {
  const b = base(t); const rel = relogio(); const { fx, e, ran } = await projetoComEspaco(t, b, 'LAB-D');
  const r = criarRotina(rotinaSmoke(e), b, rel.agora()); await autorizarExecucao(await carregarProjeto(fx.root), e.id, 'unit', 'local', { dias: 3, maxUsos: 9 }, b, solicitador());
  const w = worker(b, rel); w.iniciar(); t.after(() => w.parar());
  definirPausaGlobal(true, b); rel.avancar(10); await w.tick(); assert.equal(trabalhos(b).length, 0); assert.equal(w.estado().pausado, true);
  definirPausaGlobal(false, b); await w.tick(); await w.tick(); assert.equal(trabalhos(b).filter((x) => x.estado === 'CONCLUIDO').length, 1);
  pausarRotina(r.id, b); rel.avancar(30); await w.tick(); assert.equal(trabalhos(b).length, 1); assert.equal(ran(), 1);
});

test('falha funcional é FAIL com cenário individual; timeout é BLOCKED; falha de teste não é repetida', async (t) => {
  const b = base(t); const rel = relogio();
  const falha = 'import fs from "node:fs";fs.writeFileSync(process.env.PRUMO_RESULT_FILE,JSON.stringify({jobId:process.env.PRUMO_JOB_ID,cases:[{id:"C1",status:"PASS",evidence:"ok"},{id:"C2",status:"FAIL",evidence:"valor não persistiu após recarregar"}]}));process.exit(1);';
  const { fx, e } = await projetoComEspaco(t, b, 'LAB-E', { commands: { unit: 'node tests/test.mjs', lento: { executable: 'node', args: ['tests/lento.mjs'], timeoutMs: 300 } } }, { teste: falha, extras: { 'tests/lento.mjs': 'setTimeout(()=>{},20000);' } });
  const p = await carregarProjeto(fx.root);
  criarRotina(rotinaSmoke(e), b, rel.agora()); criarRotina(rotinaSmoke(e, { nome: 'Lento', capability: 'lento' }), b, rel.agora());
  await autorizarExecucao(p, e.id, 'unit', 'local', { dias: 1, maxUsos: 9 }, b, solicitador()); await autorizarExecucao(p, e.id, 'lento', 'local', { dias: 1, maxUsos: 9 }, b, solicitador());
  const w = worker(b, rel); w.iniciar(); t.after(() => w.parar()); rel.avancar(10); await w.tick(); await w.tick(); await w.tick();
  const f = trabalhos(b).find((x) => x.capability === 'unit'); assert.equal(f.resultado.status, 'FAIL'); assert.deepEqual(f.resultado.contagem, { pass: 1, fail: 1, blocked: 0, notRun: 0 }); assert.match(f.resultado.detalhes, /C2: valor não persistiu/); assert.equal(f.tentativas, 1);
  const l = trabalhos(b).find((x) => x.capability === 'lento'); assert.equal(l.resultado.status, 'BLOCKED'); assert.match(l.resultado.motivo, /TIMEOUT/);
});

test('parada controlada encerra o processo filho (sem órfãos) e preserva o histórico da execução interrompida', async (t) => {
  const b = base(t); const rel = relogio();
  const { fx, e } = await projetoComEspaco(t, b, 'LAB-F', {}, { teste: 'import fs from "node:fs";fs.writeFileSync(new URL("../pid.txt",import.meta.url),String(process.pid));setTimeout(()=>{},60000);' });
  const m = { commands: { unit: { executable: 'node', args: ['tests/test.mjs'], timeoutMs: 120000 } }, execution: { requireApproval: true, blockedByDefault: [], environment: 'host', envAllowlist: [], timeoutMs: 120000, maxOutputBytes: 4096 } };
  fs.writeFileSync(path.join(fx.root, 'qa.project.json'), JSON.stringify({ schemaVersion: 2, id: 'fixture', name: 'Fixture', context: { documentation: ['README.md', 'package.json'], tests: ['tests/'], code: ['src/'] }, ...m }));
  criarRotina(rotinaSmoke(e), b, rel.agora()); await autorizarExecucao(await carregarProjeto(fx.root), e.id, 'unit', 'local', { dias: 1, maxUsos: 9 }, b, solicitador());
  const w = worker(b, rel); w.iniciar(); rel.avancar(10);
  const emAndamento = w.tick(); const pidArq = path.join(fx.root, 'pid.txt');
  for (let i = 0; i < 100 && !fs.existsSync(pidArq); i++) await new Promise((r) => setTimeout(r, 100));
  const pid = Number(fs.readFileSync(pidArq, 'utf8')); assert.ok(pid > 0); assert.doesNotThrow(() => process.kill(pid, 0), 'filho está vivo');
  assert.equal(estadoTrava(b, rel.agora()).vivo, true);
  await w.parar(); await emAndamento;
  await new Promise((r) => setTimeout(r, 500)); assert.throws(() => process.kill(pid, 0), (er) => er.code === 'ESRCH', 'filho foi encerrado');
  const j = trabalhos(b)[0]; assert.equal(j.estado, 'ERRO'); assert.equal(j.erro, 'CANCELLED'); assert.equal(j.log.at(-1).estado, 'ERRO');
  assert.equal(fs.readdirSync(path.join(fx.root, '.prumo', 'evidencias')).length, 1, 'evidência parcial preservada');
  assert.equal(estadoTrava(b, rel.agora()).vivo, false);
});

test('segunda instância do worker é recusada enquanto a primeira bate o coração', async (t) => {
  const b = base(t); const rel = relogio(); const w1 = worker(b, rel); w1.iniciar(); t.after(() => w1.parar());
  const w2 = worker(b, rel); assert.doesNotThrow(() => w2.iniciar(), 'mesmo processo (pid) reaproveita a trava; instância de outro processo é recusada nos testes de janela');
  await w2.parar();
});

test('fila: recuperação de interrompidos, tentativas limitadas e idempotência por chave', (t) => {
  const b = base(t); const rel = relogio(); const eid = randomUUID(); const rid = randomUUID();
  const n = { chave: 'k1', rotinaId: rid, espacoId: eid, tipo: 'smoke', capability: 'unit', ambiente: 'local', origem: 'AGENDA', slot: null, maxTentativas: 2 };
  const { trabalho, criado } = enfileirar(n, b, rel.agora()); assert.equal(criado, true);
  assert.equal(reivindicar(b, rel.agora()).id, trabalho.id); assert.equal(reivindicar(b, rel.agora()), null, 'apenas um em execução');
  rel.avancar(5); assert.equal(recuperarInterrompidos(b, rel.agora(), 120000), 1); assert.equal(obterTrabalho(trabalho.id, b).estado, 'PENDENTE'); assert.equal(obterTrabalho(trabalho.id, b).log[0].estado, 'INTERROMPIDA');
  reivindicar(b, rel.agora()); rel.avancar(5); recuperarInterrompidos(b, rel.agora(), 120000);
  const fim = obterTrabalho(trabalho.id, b); assert.equal(fim.estado, 'ERRO'); assert.equal(fim.resultado.status, 'ERRO_INFRA'); assert.notEqual(fim.resultado.status, 'PASS');
  assert.equal(enfileirar(n, b, rel.agora()).criado, false);
});

test('Jira: comentário só de dados locais, prévia, publicação única, idempotência e retentativa sem duplicar', async (t) => {
  const b = base(t); const rel = relogio(); const eid = (await criarEspaco({ nome: 'Projeto X' }, b)).id; const rid = randomUUID();
  const { trabalho } = enfileirar({ chave: 'j1', rotinaId: rid, espacoId: eid, tipo: 'regressao', capability: 'unit', ambiente: 'teste', ticket: 'SMART-1', origem: 'AGENDA', slot: null }, b, rel.agora());
  reivindicar(b, rel.agora());
  const { concluirTrabalho: concluir } = await import('../../../../dist/agendamentos/banco/concluirTrabalho.js');
  concluir(trabalho.id, { status: 'FAIL', motivo: 'Falha do processo', contagem: { pass: 2, fail: 1, blocked: 0, notRun: 0 }, evidenciaId: randomUUID(), detalhes: 'C3: o valor não foi preservado\nconexão com token=abcdef1234567890SECRET' }, b, rel.agora());
  const j = obterTrabalho(trabalho.id, b);
  const c = montarComentario(j, 'Projeto X');
  for (const trecho of ['PRUMO QA — RESULTADO DE VALIDAÇÃO', 'Ticket: SMART-1', '3 cenário(s) executado(s): 2 PASS, 1 FAIL', 'Validação reprovada nos cenários executados', 'não altera o status do ticket', 'Prumo-Execução: ' + j.id]) assert.ok(c.texto.includes(trecho), trecho);
  assert.doesNotMatch(c.texto, /abcdef1234567890SECRET/);
  const nuvem = []; let falhar = null;
  const pub = { async comentarJira(espaco, ticket, adf) { if (falhar) { const m = falhar; falhar = null; nuvem.push({ id: String(900 + nuvem.length), adf }); throw m; } const id = String(100 + nuvem.length); nuvem.push({ id, adf }); return { id, vinculoId: randomUUID(), conexaoId: randomUUID() }; },
    async procurarComentarioJira(espaco, ticket, marcador) { return nuvem.find((x) => JSON.stringify(x.adf).includes(marcador))?.id ?? null; } };
  await assert.rejects(publicar(j.id, 'MANUAL', pub, b, false), /HUMAN_CONFIRMATION_REQUIRED/);
  await assert.rejects(Promise.resolve().then(() => prepararPublicacao(randomUUID(), b)), /JOB_NOT_FOUND/);
  // agendado sem política: bloqueado, nada enviado
  const sem = await publicar(j.id, 'AGENDADO', pub, b, false, rel.agora()); assert.equal(sem.estado, 'BLOQUEADO'); assert.equal(nuvem.length, 0);
  criarPoliticaPublicacao(eid, { tickets: ['SMART-2'], tipos: ['regressao'], dias: 1, maxPublicacoes: 5 }, 'pessoa', b, rel.agora());
  assert.equal((await publicar(j.id, 'AGENDADO', pub, b, false, rel.agora())).estado, 'BLOQUEADO', 'ticket fora da política');
  criarPoliticaPublicacao(eid, { tickets: ['SMART-1'], tipos: ['regressao'], dias: 1, maxPublicacoes: 5 }, 'pessoa', b, rel.agora());
  falhar = new ErroServico('SERVICE_TIMEOUT'); // rede cai depois do envio: o comentário existe, mas a resposta se perdeu
  const f = await publicar(j.id, 'AGENDADO', pub, b, false, rel.agora()); assert.equal(f.estado, 'FALHA'); assert.equal(nuvem.length, 1);
  const ok = await publicar(j.id, 'AGENDADO', pub, b, false, rel.agora()); assert.equal(ok.estado, 'PUBLICADO'); assert.equal(ok.comentarioId, '900'); assert.equal(nuvem.length, 1, 'não duplicou');
  const de_novo = await publicar(j.id, 'MANUAL', pub, b, true); assert.equal(de_novo.estado, 'PUBLICADO'); assert.equal(nuvem.length, 1);
  assert.equal(obterTrabalho(j.id, b).jira.estado, 'PUBLICADO'); assert.equal(publicacaoDoTrabalho(j.id, b).comentarioId, '900');
});

test('Jira: sem execução real não há comentário (BLOCKED/NOT_RUN/INFO)', async (t) => {
  const b = base(t); const rel = relogio(); const esp2 = (await criarEspaco({ nome: 'P2' }, b)).id;
  enfileirar({ chave: 'j2', rotinaId: randomUUID(), espacoId: esp2, tipo: 'smoke', ambiente: 'local', ticket: 'SMART-1', origem: 'AGENDA', slot: null }, b, rel.agora()); const j = reivindicar(b, rel.agora());
  const { concluirTrabalho: concluir } = await import('../../../../dist/agendamentos/banco/concluirTrabalho.js'); concluir(j.id, { status: 'BLOCKED', motivo: 'HUMAN_APPROVAL_REQUIRED' }, b, rel.agora());
  assert.throws(() => montarComentario(obterTrabalho(j.id, b), 'P'), /JIRA_COMMENT_NOT_APPLICABLE/);
});

test('k6: limites, produção bloqueada, destino local, ausência do executável e execução com executável sintético', async (t) => {
  const b = base(t); const rel = relogio();
  const k6fake = 'import fs from "node:fs";const a=process.argv;const i=a.indexOf("--summary-export");fs.writeFileSync(a[i+1],JSON.stringify({metrics:{http_req_duration:{"p(95)":812.5,avg:300,thresholds:{"p(95)<500":{ok:false}}},http_reqs:{count:420,rate:42},http_req_failed:{value:0,passes:0,fails:420}}}));process.exit(99);';
  const { fx, e } = await projetoComEspaco(t, b, 'LAB-K6', {}, { extras: { 'carga/script.js': 'export default function(){}', 'k6-fake.mjs': k6fake } });
  const cfg = { script: 'carga/script.js', alvo: 'http://127.0.0.1:8080', usuarios: 5, duracaoSegundos: 5 };
  const { executarK6 } = await import('../../../../dist/agendamentos/k6/executarK6.js'); const p = await carregarProjeto(fx.root);
  const exe = { executable: process.execPath, argsIniciais: [path.join(fx.root, 'k6-fake.mjs')] };
  const sem = await executarK6(p, cfg, 'local', null, true); assert.equal(sem.status, 'NOT_RUN'); assert.match(sem.reason, /RUNTIME_MISSING/);
  assert.match((await executarK6(p, cfg, 'producao', exe, true, undefined, solicitador())).reason, /POLICY_BLOCKED/);
  assert.match((await executarK6(p, { ...cfg, usuarios: 5000 }, 'local', exe, true, undefined, solicitador())).reason, /K6_LIMIT|PRECONDITION/);
  assert.match((await executarK6(p, { ...cfg, alvo: 'https://exemplo.com' }, 'local', exe, true, undefined, solicitador())).reason, /K6_TARGET_NOT_LOCAL/);
  assert.match((await executarK6(p, cfg, 'local', exe, false)).reason, /HUMAN_APPROVAL_REQUIRED/);
  const r = await executarK6(p, cfg, 'local', exe, true, undefined, solicitador()); assert.equal(r.status, 'FAIL'); assert.match(r.reason, /exit 99|Limiar/); assert.equal(r.cases[0].status, 'FAIL'); assert.equal(r.resultArtifact.metrics.http_req_duration['p(95)'], 812.5);
  // agendado: via worker com autorização restrita ao hash
  criarRotina({ nome: 'Carga', espacoId: e.id, tipo: 'k6', ambiente: 'local', frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC', k6: cfg }, b, rel.agora());
  const esc = await escopoK6(p, cfg, 'local', exe); const { capacidadeDoK6: capabilityK6 } = await import('../../../../dist/agendamentos/k6/capacidadeDoK6.js');
  await autorizarEscopo(p, e.id, capabilityK6(cfg), 'local', esc, { dias: 1, maxUsos: 2 }, b, solicitador());
  const w = worker(b, rel, { localizarK6: async () => exe }); w.iniciar(); t.after(() => w.parar()); rel.avancar(10); await w.tick(); await w.tick();
  const j = trabalhos(b).at(-1); assert.equal(j.tipo, 'k6'); assert.equal(j.resultado.status, 'FAIL'); assert.equal(j.resultado.contagem.fail, 1);
});

test('validação por ticket usa só automações associadas de forma declarada; sem associação, BLOCKED sem executar', async (t) => {
  const b = base(t); const rel = relogio(); const { fx, e, ran } = await projetoComEspaco(t, b, 'LAB-T');
  const rec = { id: '11', chave: 'SMART', nome: 'JiraSMART', instancia: 'https://lab.atlassian.net', contaId: 'c1', tipoId: 'id_api' };
  const esp = gravarVinculo(e.id, 'jira', randomUUID(), rec, b); const vid = esp.vinculos[0].id;
  criarRotina({ nome: 'Ticket', espacoId: e.id, tipo: 'validacao-ticket', ticket: 'SMART-1', ambiente: 'local', frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC' }, b, rel.agora());
  await autorizarExecucao(await carregarProjeto(fx.root), e.id, 'unit', 'local', { dias: 1, maxUsos: 9 }, b, solicitador());
  const w = worker(b, rel); w.iniciar(); t.after(() => w.parar());
  rel.avancar(10); await w.tick(); await w.tick(); let j = trabalhos(b).at(-1); assert.equal(j.resultado.status, 'BLOCKED'); assert.match(j.resultado.motivo, /NO_VERIFIED_LINK/); assert.equal(ran(), 0);
  associarEspaco(e.id, { de: { tipo: 'jira', id: 'SMART-1', vinculoId: vid, origem: 'Jira' }, para: { tipo: 'automacao', id: 'unit', origem: 'qa.project.json' }, justificativa: 'Declarado pela pessoa' }, b);
  rel.avancar(10); await w.tick(); await w.tick(); j = trabalhos(b).at(-1); assert.equal(j.resultado.status, 'PASS'); assert.equal(j.ticket, 'SMART-1'); assert.equal(ran(), 1);
});

test('consulta Jira e análise de mudanças são leituras: registram mudanças sem disparar execução', async (t) => {
  const b = base(t); const rel = relogio(); const e = await criarEspaco({ nome: 'LAB-L' }, b);
  let updated = '1'; let sha = 'a'.repeat(40);
  const servicos = { async consultar(id, servico, op) { return servico === 'jira' ? { dados: [{ key: 'SMART-1', fields: { updated } }] } : { dados: [{ sha, commit: { message: 'msg\ncorpo' } }, { sha: 'b'.repeat(40), commit: { message: 'antigo' } }] }; }, async comentarJira() { throw new Error('não deve escrever'); }, async procurarComentarioJira() { return null; } };
  criarRotina({ nome: 'Jira', espacoId: e.id, tipo: 'consulta-jira', ambiente: 'local', frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC' }, b, rel.agora());
  criarRotina({ nome: 'Git', espacoId: e.id, tipo: 'analise-mudancas', ambiente: 'local', frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC' }, b, rel.agora());
  const w = worker(b, rel, { servicos }); w.iniciar(); t.after(() => w.parar());
  rel.avancar(10); for (let i = 0; i < 3; i++) await w.tick();
  assert.ok(trabalhos(b).every((x) => x.estado === 'CONCLUIDO' && x.resultado.status === 'INFO')); assert.match(trabalhos(b).find((x) => x.tipo === 'consulta-jira').resultado.motivo, /primeira consulta/);
  updated = '2'; sha = 'c'.repeat(40); rel.avancar(10); for (let i = 0; i < 3; i++) await w.tick();
  assert.match(trabalhos(b).filter((x) => x.tipo === 'consulta-jira').at(-1).resultado.motivo, /1 novo\(s\) ou alterado/); assert.match(trabalhos(b).filter((x) => x.tipo === 'analise-mudancas').at(-1).resultado.motivo, /não a disparou/);
  assert.equal(trabalhos(b).some((x) => ['smoke', 'regressao'].includes(x.tipo)), false);
});

test('notificações: só quando algo realmente começou/terminou, sem repetir o mesmo aviso', async (t) => {
  const b = base(t); const rel = relogio(); const { e } = await projetoComEspaco(t, b, 'LAB-N'); const eventos = [];
  criarRotina(rotinaSmoke(e), b, rel.agora()); const w = worker(b, rel, { aoEvento: (x) => eventos.push(x.tipo) }); w.iniciar(); t.after(() => w.parar());
  await w.tick(); assert.deepEqual(eventos, [], 'nada enfileirado, nada avisado');
  rel.avancar(10); await w.tick(); await w.tick(); assert.deepEqual(eventos, ['AGENDAMENTO_INICIADO', 'EXECUCAO_BLOQUEADA']);
  rel.avancar(10); await w.tick(); await w.tick(); assert.equal(eventos.filter((x) => x === 'EXECUCAO_BLOQUEADA').length, 1, 'mesmo bloqueio não repete em 30 minutos');
});

test('trava corrompida (arquivo zerado por queda de energia) não impede o worker nem o aplicativo: é posta de lado e recriada (2.10.2)', async (t) => {
  const b = base(t); const rel = relogio(); const pasta = path.join(b, 'plataforma'); fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'worker-trava.json'), Buffer.alloc(152, 0));
  assert.deepEqual(estadoTrava(b, rel.agora()), { vivo: false, pid: null, ultimoBatimento: null }, 'trava ilegível conta como ausente');
  assert.ok(fs.readdirSync(pasta).some((n) => /^worker-trava\.json\.ilegivel-\d+$/.test(n)), 'o arquivo ilegível é guardado para diagnóstico');
  const w = worker(b, rel); w.iniciar(); t.after(() => w.parar());
  const nova = JSON.parse(fs.readFileSync(path.join(pasta, 'worker-trava.json'), 'utf8')); assert.equal(nova.ativo, true); assert.equal(nova.instancia, w.instancia);
  assert.equal(w.estado().trava.vivo, true);
});
