import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { criarMundo } from '../../../apoio/mundo-servicos.mjs';
import { executarOperacao } from '../../../../dist/conexoes/escrita/executarOperacao.js';
import { habilitarEscrita } from '../../../../dist/conexoes/escrita/habilitarEscrita.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import { vincularServicoAoEspaco as gravarVinculo } from '../../../../dist/projetos/regras/vincularServicoAoEspaco.js';
import { obterRunLocal } from '../../../../dist/testes/banco/obterRunLocal.js';
import { criarRunNoQase } from '../../../../dist/testes/integracoes/criarRunNoQase.js';
import { publicarRunLocal } from '../../../../dist/testes/integracoes/publicarRunLocal.js';
import { declararResultadoManual } from '../../../../dist/testes/regras/declararResultadoManual.js';
import { prepararRunLocal } from '../../../../dist/testes/regras/prepararRunLocal.js';
import { propostasDeBugs } from '../../../../dist/testes/regras/propostasDeBugs.js';
import { obterProposta } from '../../../../dist/tickets/banco/obterProposta.js';
import { criarProposta } from '../../../../dist/tickets/regras/criarProposta.js';
import { editarProposta } from '../../../../dist/tickets/regras/editarProposta.js';
import { marcarPublicada } from '../../../../dist/tickets/regras/marcarPublicada.js';

// Jornada manual: primeiro SEM nenhuma conexão (run local, resultado declarado pela pessoa, rascunho de bug) e só depois, conectando
// Jira, Qase e GitHub, a publicação do trabalho. Serviços simulados (mundo-servicos); nada externo é tocado.
const base = (t) => { const b = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo jornada ')); t.after(() => fs.rmSync(b, { recursive: true, force: true })); return b; };
const escritas = (m) => m.chamadas.filter(([metodo]) => metodo !== 'GET');

test('sem conexões tudo funciona localmente e nada sai; ao conectar, o trabalho é publicado no Qase, no Jira e no GitHub', async (t) => {
  const b = base(t), mundo = criarMundo(), e = await criarEspaco({ nome: 'Manual Lab' }, b);
  const rodar = (op, p) => executarOperacao(mundo.executor, e.id, op, p, { base: b, confirmado: true });
  // A. sem conexão, sem vínculo, sem escrita habilitada
  const run = prepararRunLocal(e.id, { titulo: 'Rodada manual', ambiente: 'teste', casos: [{ casoId: 1, titulo: 'Entrar com senha válida' }, { casoId: 2, titulo: 'Recusar senha errada' }] }, b);
  assert.equal(run.estado, 'PREPARADA'); assert.equal(run.runIdRemoto, null);
  declararResultadoManual(run.id, 1, { status: 'PASS', comentario: 'entrou normalmente' }, 'ana', b);
  declararResultadoManual(run.id, 2, { status: 'FAIL', comentario: 'aceitou a senha errada' }, 'ana', b);
  assert.deepEqual(obterRunLocal(run.id, b).casos.map((c) => [c.resultado.status, c.resultado.origem]), [['PASS', 'MANUAL'], ['FAIL', 'MANUAL']]);
  const [bug] = propostasDeBugs(run.id, b); assert.equal(bug.tipo, 'bug'); assert.equal(bug.estado, 'RASCUNHO'); assert.match(bug.dados.descricao, /aceitou a senha errada/);
  const manual = criarProposta({ espacoId: e.id, tipo: 'bug', origem: 'PESSOA', dados: { classificacao: 'OUTRO_BUG', resumo: 'Tela travada no Safari', descricao: 'observado à mão' } }, b); assert.equal(manual.estado, 'RASCUNHO');
  await assert.rejects(criarRunNoQase({ executor: mundo.executor, base: b }, run.id, { confirmado: true }), 'sem Qase vinculado não cria run');
  await assert.rejects(rodar('jira.criar_ticket', { tipoId: '10001', resumo: 'x', descricao: 'y', rotulos: [] }), 'sem Jira vinculado nem escrita habilitada não cria ticket');
  await assert.rejects(rodar('github.criar_branch', { nome: 'prumo/manual' }), 'sem GitHub vinculado não cria branch');
  assert.equal(escritas(mundo).length, 0, 'nenhuma escrita externa antes de conectar');
  // B. conectar e publicar
  for (const s of ['jira', 'qase', 'github']) gravarVinculo(e.id, s, randomUUID(), { ...mundo.recursos[s] }, b);
  for (const s of ['jira', 'qase', 'github']) habilitarEscrita(e.id, s, true, 'ana', b);
  const caso1 = Number((await rodar('qase.criar_caso', { titulo: 'Entrar com senha válida', passos: [{ acao: 'x' }] })).remoto.id), caso2 = Number((await rodar('qase.criar_caso', { titulo: 'Recusar senha errada', passos: [{ acao: 'x' }] })).remoto.id);
  const run2 = prepararRunLocal(e.id, { titulo: 'Rodada manual publicada', ambiente: 'teste', casos: [{ casoId: caso1, titulo: 'Entrar com senha válida' }, { casoId: caso2, titulo: 'Recusar senha errada' }] }, b);
  declararResultadoManual(run2.id, caso1, { status: 'PASS', comentario: 'entrou normalmente' }, 'ana', b); declararResultadoManual(run2.id, caso2, { status: 'FAIL', comentario: 'aceitou a senha errada' }, 'ana', b);
  const dep = { executor: mundo.executor, base: b }; await criarRunNoQase(dep, run2.id, { confirmado: true });
  assert.equal((await publicarRunLocal(dep, run2.id, { confirmado: true })).publicados, 2);
  assert.deepEqual(mundo.qase.resultados.map((r) => [r.case_id, r.status]), [[caso1, 'passed'], [caso2, 'failed']]); assert.match(mundo.qase.resultados[1].comment, /declarado por ana/);
  assert.equal((await publicarRunLocal(dep, run2.id, { confirmado: true })).publicados, 0, 'republicar não duplica');
  assert.equal(propostasDeBugs(run2.id, b).length, 0, 'o rascunho local do mesmo defeito não é proposto de novo ao conectar'); const bug2 = bug; const ed = editarProposta(bug2.id, { ...bug2.dados, tipoId: '10001' }, {}, b);
  const antes = mundo.jira.issues.size; const ticket = await rodar('jira.criar_ticket', { tipoId: '10001', resumo: ed.dados.resumo, descricao: ed.dados.descricao, origem: ed.dados.origem, rotulos: ed.dados.rotulos });
  assert.equal(ticket.estado, 'CONFIRMADA'); assert.equal(mundo.jira.issues.size, antes + 1); marcarPublicada(bug2.id, { chave: ticket.remoto.chave, url: ticket.remoto.url }, b); assert.equal(obterProposta(bug2.id, b).estado, 'PUBLICADA');
  assert.equal((await rodar('github.criar_branch', { nome: 'prumo/rodada-manual' })).estado, 'CONFIRMADA');
  const arq = await rodar('github.commitar_arquivo', { branch: 'prumo/rodada-manual', caminho: 'tests/senha-errada.spec.ts', conteudo: "import { test } from '@playwright/test';\ntest('recusa senha errada', async () => {});\n", mensagem: 'test: cenário de senha errada' }); assert.equal(arq.estado, 'CONFIRMADA');
  const pr = await rodar('github.abrir_pr', { branch: 'prumo/rodada-manual', titulo: 'Cenário de senha errada', corpo: 'Proposto pelo Prumo QA após falha manual.' }); assert.equal(pr.estado, 'CONFIRMADA'); assert.equal(mundo.github.prs[0].draft, true);
  assert.ok(escritas(mundo).every(([m, c]) => !/DELETE|\/merge|heads\/main/.test(m + c)), 'nada destrutivo e nada na branch padrão');
});

test('run com caso só local (sem Qase) é recusada ao criar no Qase, mesmo com o Qase conectado depois', async (t) => {
  const b = base(t), mundo = criarMundo(), e = await criarEspaco({ nome: 'Local Lab' }, b);
  for (const s of ['qase']) gravarVinculo(e.id, s, randomUUID(), { ...mundo.recursos[s] }, b); habilitarEscrita(e.id, 'qase', true, 'ana', b);
  const run = prepararRunLocal(e.id, { titulo: 'Só local', ambiente: 'teste', casos: [{ casoId: 1_000_000_123, titulo: 'teste do código' }] }, b);
  await assert.rejects(criarRunNoQase({ executor: mundo.executor, base: b }, run.id, { confirmado: true }), /RUN_HAS_LOCAL_CASES/);
  assert.equal(escritas(mundo).length, 0);
});
