import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture } from '../../../apoio/fixtures.mjs';
import { criarMundo } from '../../../apoio/mundo-servicos.mjs';
import { autorizacaoDelegada as delegadaPara } from '../../../../dist/agendamentos/autorizacoes/autorizacaoDelegada.js';
import { autorizarEscopo } from '../../../../dist/agendamentos/autorizacoes/autorizarEscopo.js';
import { escopoDeCapability } from '../../../../dist/testes/regras/escopoDeCapability.js';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { executarOperacao } from '../../../../dist/conexoes/escrita/executarOperacao.js';
import { habilitarEscrita } from '../../../../dist/conexoes/escrita/habilitarEscrita.js';
import { executarValidacao } from '../../../../dist/testes/regras/executarValidacao.js';
import { obterEspaco } from '../../../../dist/projetos/banco/obterEspaco.js';
import { associarEspaco } from '../../../../dist/projetos/regras/associarEspaco.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import { removerVinculoServico } from '../../../../dist/projetos/regras/removerVinculoServico.js';
import { vincularPastaAoEspaco as pastaEspaco } from '../../../../dist/projetos/regras/vincularPastaAoEspaco.js';
import { vincularServicoAoEspaco as gravarVinculo } from '../../../../dist/projetos/regras/vincularServicoAoEspaco.js';
import { obterRunLocal } from '../../../../dist/testes/banco/obterRunLocal.js';
import { criarRunNoQase } from '../../../../dist/testes/integracoes/criarRunNoQase.js';
import { publicarRunLocal } from '../../../../dist/testes/integracoes/publicarRunLocal.js';
import { automacaoDoCaso } from '../../../../dist/testes/regras/automacaoDoCaso.js';
import { declararResultadoManual } from '../../../../dist/testes/regras/declararResultadoManual.js';
import { executarRunLocal } from '../../../../dist/testes/regras/executarRunLocal.js';
import { prepararRunLocal } from '../../../../dist/testes/regras/prepararRunLocal.js';
import { propostasDeBugs } from '../../../../dist/testes/regras/propostasDeBugs.js';
import { listarPropostas } from '../../../../dist/tickets/banco/listarPropostas.js';
import { obterProposta } from '../../../../dist/tickets/banco/obterProposta.js';
import { criarProposta } from '../../../../dist/tickets/regras/criarProposta.js';
import { descartarProposta } from '../../../../dist/tickets/regras/descartarProposta.js';
import { editarProposta } from '../../../../dist/tickets/regras/editarProposta.js';
import { marcarPublicada } from '../../../../dist/tickets/regras/marcarPublicada.js';
import { podePublicar } from '../../../../dist/tickets/regras/podePublicar.js';
import { revisarProposta } from '../../../../dist/tickets/regras/revisarProposta.js';
import { vincularPropostaATicket } from '../../../../dist/tickets/regras/vincularPropostaATicket.js';
import { MAX_IA_POR_HORA } from '../../../../dist/tickets/tipos/proposta.js';

const base = (t) => { const b = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo fluxo ')); t.after(() => fs.rmSync(b, { recursive: true, force: true })); return b; };
const solicitador = async (esc) => ({ subject: 'pessoa-simulada', method: 'Windows-CredUI-LogonUser', scopeHash: esc.scopeHash, at: new Date().toISOString() });
const autorizarExecucao = async (projeto, espacoId, capability, ambiente, opcoes, base, solicitar, agora = new Date()) =>
  autorizarEscopo(projeto, espacoId, capability, ambiente, await escopoDeCapability(projeto, capability), opcoes, base, solicitar, agora);
const runner = (cases, saida = 1) => `import fs from 'node:fs';fs.appendFileSync(new URL('../ran.txt',import.meta.url),'x');fs.writeFileSync(process.env.PRUMO_RESULT_FILE,JSON.stringify({jobId:process.env.PRUMO_JOB_ID,cases:${JSON.stringify(cases)}}));process.exit(${saida});`;

async function cenario(t, { teste, capabilities = { unit: 'node tests/test.mjs' }, autorizar = true } = {}) {
  const b = base(t); const mundo = criarMundo(); const fx = await fixture(t, { commands: capabilities });
  await fx.write('tests/test.mjs', teste ?? runner([{ id: 'C1', status: 'PASS', evidence: 'ok' }, { id: 'C2', status: 'FAIL', evidence: 'valor não persistiu' }]));
  const e = await criarEspaco({ nome: 'SMART-LAB' }, b); await pastaEspaco(e.id, fx.root, b);
  const jv = gravarVinculo(e.id, 'jira', randomUUID(), { ...mundo.recursos.jira }, b).vinculos[0]; const qv = gravarVinculo(e.id, 'qase', randomUUID(), { ...mundo.recursos.qase }, b).vinculos[1];
  for (const s of ['jira', 'qase', 'github']) habilitarEscrita(e.id, s, true, 'pessoa', b);
  const dep = { executor: mundo.executor, base: b }; const rodar = (op, p) => executarOperacao(mundo.executor, e.id, op, p, { base: b, confirmado: true });
  if (autorizar) { for (const cap of Object.keys(capabilities)) await autorizarExecucao(await carregarProjeto(fx.root), e.id, cap, 'teste', { dias: 1, maxUsos: 20 }, b, solicitador); }
  const caso = async (titulo) => { const r = await rodar('qase.criar_caso', { titulo, passos: [{ acao: 'x' }] }); return Number(r.remoto.id); };
  const ligar = (casoId, automacao) => associarEspaco(e.id, { de: { tipo: 'qase', id: String(casoId), vinculoId: qv.id, origem: 'Qase SFQ' }, para: { tipo: 'automacao', id: automacao, origem: 'qa.project.json' }, justificativa: 'Declarado pela pessoa' }, b);
  const execucao = { executar: executarValidacao, modo: 'AGENDADO', delegada: (esp, amb) => delegadaPara(esp, amb, b) };
  return { b, mundo, fx, e, jv, qv, dep, rodar, caso, ligar, execucao, ran: () => (fs.existsSync(path.join(fx.root, 'ran.txt')) ? fs.readFileSync(path.join(fx.root, 'ran.txt'), 'utf8').length : 0) };
}

test('v39: trocar vínculo Qase não reutiliza automação declarada nem funde nós históricos', async t => {
  const c = await cenario(t, { autorizar: false });
  c.ligar(31, 'unit#C1');
  assert.equal(automacaoDoCaso(c.e.id, 31, c.b).capability, 'unit');
  removerVinculoServico(c.e.id, 'qase', c.b);
  const novo = gravarVinculo(c.e.id, 'qase', randomUUID(), { ...c.mundo.recursos.qase }, c.b).vinculos.find(v => v.servico === 'qase');
  assert.notEqual(novo.id, c.qv.id);
  assert.equal(automacaoDoCaso(c.e.id, 31, c.b), null);
  associarEspaco(c.e.id, { de: { tipo: 'qase', id: '31', vinculoId: novo.id, origem: 'Qase atual' }, para: { tipo: 'automacao', id: 'unit#C2', origem: 'qa.project.json' }, justificativa: 'Associação nova explícita' }, c.b);
  assert.equal(automacaoDoCaso(c.e.id, 31, c.b).casoRunner, 'C2');
  const { mapaDeVinculos } = await import('../../../../dist/testes/regras/mapaDeVinculos.js');
  const mapa = mapaDeVinculos(c.e.id, c.b);
  assert.equal(mapa.nos.filter(n => n.tipo === 'qase').length, 2);
  assert.equal(mapa.nos.find(n => n.id === 'qase:31:vinculo:' + c.qv.id).estado, 'DESATUALIZADO');
});

test('fluxo completo: casos -> run -> execução autorizada -> resultados por cenário e manual -> publicação -> releitura; sem PASS inventado', async (t) => {
  const c = await cenario(t); const [a, bb, cm] = [await c.caso('Editor grava'), await c.caso('Leitor é recusado'), await c.caso('Revisão visual manual')];
  c.ligar(a, 'unit#C1'); c.ligar(bb, 'unit#C2'); assert.deepEqual(automacaoDoCaso(c.e.id, a, c.b), { capability: 'unit', casoRunner: 'C1' }); assert.equal(automacaoDoCaso(c.e.id, cm, c.b), null);
  const run = prepararRunLocal(c.e.id, { titulo: 'Regressão SMART', ambiente: 'teste', casos: [a, bb, cm].map((id, i) => ({ casoId: id, titulo: ['Editor grava', 'Leitor é recusado', 'Revisão visual manual'][i] })) }, c.b);
  assert.equal(run.estado, 'PREPARADA'); assert.deepEqual(run.casos.map((x) => x.capability), ['unit', 'unit', null]); assert.equal(run.runIdRemoto, null);
  const criada = await criarRunNoQase(c.dep, run.id, { confirmado: true }); assert.equal(criada.estado, 'CONFIRMADA'); const r1 = obterRunLocal(run.id, c.b); assert.equal(r1.estado, 'CRIADA'); assert.ok(r1.runIdRemoto); assert.equal(c.mundo.qase.resultados.length, 0, 'run criada não é run executada'); assert.equal(c.ran(), 0);
  const exec = await executarRunLocal(c.dep, run.id, c.execucao); assert.deepEqual(exec.executadas.map((x) => [x.capability, x.status]), [['unit', 'FAIL']]); assert.equal(c.ran(), 1, 'uma execução por automação');
  const r2 = obterRunLocal(run.id, c.b); assert.deepEqual(r2.casos.map((x) => x.resultado?.status ?? null), ['PASS', 'FAIL', null]); assert.ok(r2.casos.slice(0, 2).every((x) => x.resultado.granularidade === 'CENARIO' && x.resultado.origem === 'EXECUCAO' && x.resultado.evidenciaId)); assert.match(r2.casos[1].resultado.comentario, /valor não persistiu/); assert.equal(r2.estado, 'EXECUTADA');
  assert.equal((await publicarRunLocal(c.dep, run.id, { confirmado: true })).publicados, 2); assert.deepEqual(c.mundo.qase.resultados.map((r) => [r.case_id, r.status]), [[a, 'passed'], [bb, 'failed']]);
  const r3 = obterRunLocal(run.id, c.b); assert.equal(r3.estado, 'PARCIAL', 'o caso manual ainda não tem resultado'); assert.equal(r3.confirmadaNoQase, true); assert.equal(r3.casos[2].publicado, false);
  assert.throws(() => declararResultadoManual(run.id, a, { status: 'PASS', comentario: 'forçar' }, 'pessoa', c.b), /RESULT_FROM_EXECUTION/);
  declararResultadoManual(run.id, cm, { status: 'BLOCKED', comentario: 'ambiente de homologação indisponível' }, 'ana', c.b); const pub2 = await publicarRunLocal(c.dep, run.id, { confirmado: true }); assert.equal(pub2.publicados, 1);
  assert.equal(c.mundo.qase.resultados.length, 3); assert.match(c.mundo.qase.resultados[2].comment, /declarado por ana/); assert.equal(obterRunLocal(run.id, c.b).estado, 'PUBLICADA'); assert.equal((await publicarRunLocal(c.dep, run.id, { confirmado: true })).publicados, 0, 'nada pendente'); assert.equal(c.mundo.qase.resultados.length, 3);
  assert.equal(c.mundo.qase.resultados.filter((r) => r.status === 'passed').length, 1, 'só um PASS: o que foi executado de fato');
});

test('mapeamentos e bloqueios: sem mapeamento por cenário nada é inferido; sem autorização tudo fica BLOCKED e nada executa', async (t) => {
  const c = await cenario(t, { teste: runner([{ id: 'X', status: 'PASS', evidence: 'ok' }], 0) }); const [a, bb, cc] = [await c.caso('Caso A'), await c.caso('Caso B'), await c.caso('Caso C')];
  c.ligar(a, 'unit'); c.ligar(bb, 'unit'); c.ligar(cc, 'unit#SUMIU'); const run = prepararRunLocal(c.e.id, { titulo: 'Mapeamento', ambiente: 'teste', casos: [a, bb, cc].map((id) => ({ casoId: id, titulo: 'c' + id })) }, c.b); await criarRunNoQase(c.dep, run.id, { confirmado: true });
  await executarRunLocal(c.dep, run.id, c.execucao); const r = obterRunLocal(run.id, c.b);
  assert.deepEqual(r.casos.map((x) => x.resultado.status), ['NOT_RUN', 'NOT_RUN', 'NOT_RUN']); assert.match(r.casos[0].resultado.comentario, /MAPEAMENTO_AUSENTE/); assert.match(r.casos[2].resultado.comentario, /não foi reportado/);
  assert.equal((await publicarRunLocal(c.dep, run.id, { confirmado: true })).publicados, 0); assert.equal(c.mundo.qase.resultados.length, 0, 'NOT_RUN nunca é publicado');
  const s = await cenario(t, { autorizar: false }); const x = await s.caso('Caso X'); s.ligar(x, 'unit#C1'); const run2 = prepararRunLocal(s.e.id, { titulo: 'Sem autorização', ambiente: 'teste', casos: [{ casoId: x, titulo: 'Caso X' }] }, s.b);
  await executarRunLocal(s.dep, run2.id, s.execucao); const r2 = obterRunLocal(run2.id, s.b); assert.equal(r2.casos[0].resultado.status, 'BLOCKED'); assert.match(r2.casos[0].resultado.comentario, /HUMAN_APPROVAL_REQUIRED/); assert.equal(s.ran(), 0, 'o processo não rodou');
  await assert.rejects(publicarRunLocal(s.dep, run2.id, { confirmado: true }), /RUN_NOT_CREATED/);
});

test('publicação supervisionada agendada: só com política vigente para a run; sem ela os resultados ficam locais', async (t) => {
  const { criarPoliticaEscrita } = await import('../../../../dist/agendamentos/autorizacoes/criarPoliticaEscrita.js'); const c = await cenario(t); const a = await c.caso('Editor grava'); c.ligar(a, 'unit#C1');
  const run = prepararRunLocal(c.e.id, { titulo: 'Agendada', ambiente: 'teste', casos: [{ casoId: a, titulo: 'Editor grava' }] }, c.b); await criarRunNoQase(c.dep, run.id, { confirmado: true }); await executarRunLocal(c.dep, run.id, c.execucao);
  const sem = await publicarRunLocal(c.dep, run.id, { confirmado: false, origem: 'AGENDADO' }); assert.equal(sem.operacao.estado, 'BLOQUEADA'); assert.equal(sem.publicados, 0); assert.equal(c.mundo.qase.resultados.length, 0); assert.equal(obterRunLocal(run.id, c.b).casos[0].publicado, false);
  criarPoliticaEscrita(c.e.id, { operacao: 'qase.publicar_resultados', runs: [obterRunLocal(run.id, c.b).runIdRemoto], dias: 1, maxUsos: 3 }, 'pessoa', c.b);
  const ok = await publicarRunLocal(c.dep, run.id, { confirmado: false, origem: 'AGENDADO' }); assert.equal(ok.publicados, 1); assert.equal(c.mundo.qase.resultados.length, 1);
});

test('falha vira rascunho de bug com ticket de origem; publicar cria o ticket, relaciona e registra o vínculo, sem duplicar', async (t) => {
  const c = await cenario(t); c.mundo.semear('SMART-100'); const a = await c.caso('Leitor é recusado'); c.ligar(a, 'unit#C2');
  associarEspaco(c.e.id, { de: { tipo: 'jira', id: 'SMART-100', vinculoId: c.jv.id, origem: 'Jira' }, para: { tipo: 'qase', id: String(a), vinculoId: c.qv.id, origem: 'Qase SFQ' }, justificativa: 'Declarado' }, c.b);
  const run = prepararRunLocal(c.e.id, { titulo: 'Run com falha', ambiente: 'teste', casos: [{ casoId: a, titulo: 'Leitor é recusado' }] }, c.b); await criarRunNoQase(c.dep, run.id, { confirmado: true }); await executarRunLocal(c.dep, run.id, c.execucao);
  const [bug] = propostasDeBugs(run.id, c.b); assert.equal(bug.tipo, 'bug'); assert.equal(bug.origem, 'PRUMO'); assert.equal(bug.dados.origem, 'SMART-100'); assert.match(bug.dados.descricao, /valor não persistiu/); assert.equal(propostasDeBugs(run.id, c.b).length, 0, 'mesmo bug não é proposto duas vezes');
  assert.equal(c.mundo.jira.issues.size, 4, 'rascunho não cria ticket'); const ed = editarProposta(bug.id, { ...bug.dados, tipoId: '10001' }, {}, c.b); podePublicar(ed);
  const r = await c.rodar('jira.criar_ticket', { tipoId: '10001', resumo: ed.dados.resumo, descricao: ed.dados.descricao, origem: ed.dados.origem, rotulos: ed.dados.rotulos }); assert.equal(r.estado, 'CONFIRMADA'); marcarPublicada(bug.id, { chave: r.remoto.chave, url: r.remoto.url }, c.b);
  associarEspaco(c.e.id, { de: { tipo: 'jira-bug', id: r.remoto.chave, vinculoId: c.jv.id, origem: 'Jira' }, para: { tipo: 'qase', id: String(a), vinculoId: c.qv.id, origem: 'Qase SFQ' }, justificativa: 'Bug aberto pelo Prumo a partir da falha na run' }, c.b, true);
  const rel = obterEspaco(c.e.id, c.b).relacoes.at(-1); assert.equal(rel.origemRegistro, 'REGISTRADO_PELO_PRUMO'); assert.equal(rel.de.tipo, 'jira-bug'); assert.equal(obterProposta(bug.id, c.b).estado, 'PUBLICADA');
  assert.throws(() => associarEspaco(c.e.id, { de: { tipo: 'jira-bug', id: 'SMART-9', origem: 'x' }, para: { tipo: 'qase', id: '1', vinculoId: c.qv.id, origem: 'x' }, justificativa: 'sem vínculo' }, c.b), /TRACE_LINK_SCOPE/);
});

test('falha classificada vira ticket local; vincular a ticket existente registra a relação sem tocar no Jira; ticket manual não precisa de falha', async (t) => {
  const c = await cenario(t); const a = await c.caso('Leitor é recusado'); c.ligar(a, 'unit#C2');
  const run = prepararRunLocal(c.e.id, { titulo: 'Run com falha', ambiente: 'teste', casos: [{ casoId: a, titulo: 'Leitor é recusado' }] }, c.b); await criarRunNoQase(c.dep, run.id, { confirmado: true }); await executarRunLocal(c.dep, run.id, c.execucao);
  const [melhoria] = propostasDeBugs(run.id, c.b, 'MELHORIA'); assert.equal(melhoria.dados.classificacao, 'MELHORIA'); assert.match(melhoria.titulo, /^\[Prumo QA\] Melhoria:/);
  const jira = c.mundo.jira.issues.size; const v = vincularPropostaATicket(melhoria.id, ' smart-77 ', c.b);
  assert.equal(v.estado, 'VINCULADA'); assert.equal(v.remoto.chave, 'SMART-77'); assert.equal(c.mundo.jira.issues.size, jira, 'vincular não cria nem altera ticket no Jira');
  const rel = obterEspaco(c.e.id, c.b).relacoes.at(-1); assert.equal(rel.de.tipo, 'jira-bug'); assert.equal(rel.de.id, 'SMART-77'); assert.equal(rel.para.id, String(a)); assert.equal(rel.origemRegistro, 'REGISTRADO_PELO_PRUMO');
  assert.throws(() => vincularPropostaATicket(melhoria.id, 'SMART-78', c.b), /PROPOSAL_CLOSED/); assert.throws(() => podePublicar(obterProposta(melhoria.id, c.b)), /PROPOSAL_CLOSED/); assert.throws(() => editarProposta(melhoria.id, melhoria.dados, {}, c.b), /PROPOSAL_CLOSED/);
  const manual = criarProposta({ espacoId: c.e.id, tipo: 'bug', origem: 'PESSOA', dados: { classificacao: 'OUTRO_BUG', resumo: 'Ambiente de teste fora do ar', descricao: '' } }, c.b);
  assert.equal(manual.estado, 'RASCUNHO'); assert.equal(manual.remoto, null); assert.throws(() => vincularPropostaATicket(manual.id, 'sem chave', c.b), /TICKET_KEY_INVALID/);
  const solto = vincularPropostaATicket(manual.id, 'SMART-5', c.b); assert.equal(solto.estado, 'VINCULADA', 'sem falha de origem só a proposta guarda o vínculo'); assert.equal(obterEspaco(c.e.id, c.b).relacoes.filter((r) => r.de.id === 'SMART-5').length, 0);
  assert.throws(() => criarProposta({ espacoId: c.e.id, tipo: 'bug', origem: 'PESSOA', dados: { classificacao: 'INVENTADA', resumo: 'Classe inexistente', descricao: '' } }, c.b));
});

test('propostas da IA: sem duplicata, limite por hora, revisão completa obrigatória e publicação só pela pessoa', async (t) => {
  const c = await cenario(t, { autorizar: false }); const caso = (n) => ({ titulo: n, passos: [{ acao: 'Abrir a tela', esperado: 'Tela visível' }], automacao: 'manual' });
  const p1 = criarProposta({ espacoId: c.e.id, tipo: 'caso', origem: 'IA', cliente: 'claude', dados: caso('Editor persiste o valor após recarregar'), requisito: 'RQ-01', risco: 'alto' }, c.b);
  assert.equal(p1.estado, 'RASCUNHO'); assert.equal(p1.origem, 'IA'); assert.throws(() => criarProposta({ espacoId: c.e.id, tipo: 'caso', origem: 'IA', dados: caso('editor persiste o VALOR após recarregar') }, c.b), /DUPLICATE_PROPOSAL/);
  const parecida = criarProposta({ espacoId: c.e.id, tipo: 'caso', origem: 'IA', dados: caso('Editor persiste valor após recarregar a página') }, c.b); assert.deepEqual(parecida.similares, [p1.id], 'semelhante é sinalizada para a revisão');
  assert.throws(() => podePublicar(p1), /REVIEW_REQUIRED/); assert.throws(() => revisarProposta(p1.id, { duplicidade: true, requisito: true, risco: false, cobertura: true }, 'ana', c.b), /REVIEW_INCOMPLETE/);
  assert.throws(() => revisarProposta(parecida.id, { duplicidade: true, requisito: true, risco: true, cobertura: true }, 'ana', c.b), /REVIEW_REQUIREMENT_MISSING/, 'IA precisa de requisito informado');
  const rev = revisarProposta(p1.id, { duplicidade: true, requisito: true, risco: true, cobertura: true }, 'ana', c.b); assert.equal(rev.estado, 'REVISADA'); assert.equal(podePublicar(rev), true);
  const editada = editarProposta(p1.id, caso('Editor persiste o valor após recarregar (v2)'), {}, c.b); assert.equal(editada.estado, 'RASCUNHO'); assert.equal(editada.revisao, null, 'editar invalida a revisão'); assert.throws(() => podePublicar(editada), /REVIEW_REQUIRED/);
  descartarProposta(parecida.id, c.b); assert.equal(listarPropostas(c.e.id, c.b).find((x) => x.id === parecida.id).estado, 'DESCARTADA'); assert.throws(() => revisarProposta(parecida.id, { duplicidade: true, requisito: true, risco: true, cobertura: true }, 'ana', c.b), /PROPOSAL_CLOSED/);
  for (let i = 0; i < MAX_IA_POR_HORA; i++) { try { criarProposta({ espacoId: c.e.id, tipo: 'caso', origem: 'IA', dados: caso('Cenário único número ' + i + ' ' + 'abcdefghij'.slice(0, i % 10) + i) }, c.b); } catch (e) { assert.match(e.message, /PROPOSAL_RATE_LIMIT/); break; } }
  assert.throws(() => criarProposta({ espacoId: c.e.id, tipo: 'caso', origem: 'IA', dados: caso('Mais um cenário que passa do limite') }, c.b), /PROPOSAL_RATE_LIMIT/); assert.ok(criarProposta({ espacoId: c.e.id, tipo: 'caso', origem: 'PESSOA', dados: caso('A pessoa não é limitada pelo teto da IA') }, c.b));
  assert.equal(c.mundo.qase.casos.length, 0, 'nenhuma proposta chegou ao Qase por conta própria'); assert.throws(() => criarProposta({ espacoId: c.e.id, tipo: 'caso', origem: 'IA', dados: { titulo: 'x' } }, c.b));
});

test('mapa de vínculos: mostra o cadastrado, o registrado pelo Prumo e o observado; lacunas só de ausência de cadastro; não deduz por nome', async (t) => {
  const { mapaDeVinculos } = await import('../../../../dist/testes/regras/mapaDeVinculos.js');
  const c = await cenario(t); c.mundo.semear('SMART-100'); const [a, bb] = [await c.caso('Editor grava'), await c.caso('Caso sem automação nem ticket')];
  c.ligar(a, 'unit#C1'); associarEspaco(c.e.id, { de: { tipo: 'jira', id: 'SMART-100', vinculoId: c.jv.id, origem: 'Jira' }, para: { tipo: 'qase', id: String(a), vinculoId: c.qv.id, origem: 'Qase SFQ' }, justificativa: 'Declarado' }, c.b);
  const run = prepararRunLocal(c.e.id, { titulo: 'Mapa', ambiente: 'teste', casos: [{ casoId: a, titulo: 'Editor grava' }, { casoId: bb, titulo: 'Caso sem automação nem ticket' }] }, c.b); await criarRunNoQase(c.dep, run.id, { confirmado: true }); await executarRunLocal(c.dep, run.id, c.execucao);
  const m = mapaDeVinculos(c.e.id, c.b); const tipos = new Set(m.nos.map((n) => n.tipo));
  for (const x of ['projeto', 'pasta', 'servico', 'jira', 'qase', 'automacao', 'run', 'evidencia']) assert.ok(tipos.has(x), 'nó ' + x);
  assert.ok(m.arestas.some((x) => x.de === 'jira:SMART-100' && x.para === `qase:${a}` && x.origem === 'DECLARADO_PELO_USUARIO')); assert.ok(m.arestas.some((x) => x.tipo === 'resultado de' && x.origem === 'OBSERVADO'));
  assert.ok(m.lacunas.some((l) => l.tipo === 'CASO_SEM_AUTOMACAO' && l.id === `qase:${bb}`)); assert.ok(m.lacunas.some((l) => l.tipo === 'CASO_SEM_TICKET' && l.id === `qase:${bb}`)); assert.ok(!m.lacunas.some((l) => l.id === `qase:${a}`), 'caso com ticket e automação não aparece como lacuna');
  assert.match(m.aviso, /não prova cobertura/); assert.ok(m.operacoesRecentes.length >= 3);
});

test('rotina "run do Qase" no worker: executa as automações autorizadas e só publica com política vigente para a run', async (t) => {
  const { Worker } = await import('../../../../dist/agendamentos/worker/Worker.js'); const { criarRotina } = await import('../../../../dist/agendamentos/regras/criarRotina.js'); const { listarTrabalhos } = await import('../../../../dist/agendamentos/banco/listarTrabalhos.js'); const { criarPoliticaEscrita } = await import('../../../../dist/agendamentos/autorizacoes/criarPoliticaEscrita.js');
  const c = await cenario(t); const [a, bb] = [await c.caso('Editor grava'), await c.caso('Leitor é recusado')]; c.ligar(a, 'unit#C1'); c.ligar(bb, 'unit#C2');
  const run = prepararRunLocal(c.e.id, { titulo: 'Agendada no worker', ambiente: 'teste', casos: [{ casoId: a, titulo: 'Editor grava' }, { casoId: bb, titulo: 'Leitor é recusado' }] }, c.b);
  assert.throws(() => criarRotina({ nome: 'Sem run', espacoId: c.e.id, tipo: 'run-qase', ambiente: 'teste', frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC' }, c.b), /run obrigatória/);
  let relogio = Date.parse('2026-10-10T12:00:00Z'); const agora = () => new Date(relogio);
  criarRotina({ nome: 'Run no worker', espacoId: c.e.id, tipo: 'run-qase', runLocalId: run.id, ambiente: 'teste', frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC' }, c.b, agora());
  const w = new Worker({ base: c.b, agora, semTemporizador: true, servicos: { comContexto: c.mundo.executor.comContexto } }); w.iniciar(); t.after(() => w.parar());
  relogio += 10 * 60000; await w.tick(); await w.tick(); let j = listarTrabalhos(c.b).at(-1); assert.equal(j.resultado.status, 'BLOCKED', 'a run ainda não foi criada no Qase'); assert.match(j.resultado.motivo, /RUN_NOT_CREATED/); assert.equal(c.ran(), 0);
  await criarRunNoQase(c.dep, run.id, { confirmado: true }); relogio += 10 * 60000; await w.tick(); await w.tick(); j = listarTrabalhos(c.b).at(-1);
  assert.equal(j.resultado.status, 'FAIL'); assert.deepEqual(j.resultado.contagem, { pass: 1, fail: 1, blocked: 0, notRun: 0 }); assert.match(j.resultado.motivo, /BLOQUEADA \(sem política vigente para esta run\)/); assert.equal(c.mundo.qase.resultados.length, 0, 'sem política nada vai ao Qase'); assert.equal(c.ran(), 1);
  criarPoliticaEscrita(c.e.id, { operacao: 'qase.publicar_resultados', runs: [obterRunLocal(run.id, c.b).runIdRemoto], dias: 1, maxUsos: 3 }, 'pessoa', c.b);
  relogio += 10 * 60000; await w.tick(); await w.tick(); j = listarTrabalhos(c.b).at(-1); assert.match(j.resultado.motivo, /2 resultado\(s\) publicado\(s\) no Qase/); assert.deepEqual(c.mundo.qase.resultados.map((r) => r.status), ['passed', 'failed']); assert.equal(obterRunLocal(run.id, c.b).estado, 'PUBLICADA');
});
