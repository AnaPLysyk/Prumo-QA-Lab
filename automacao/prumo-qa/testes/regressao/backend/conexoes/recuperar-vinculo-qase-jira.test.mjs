/** Simula criação parcial no Qase + falha da associação Jira. Sem rede nem banco externo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarMundo } from '../../../apoio/mundo-servicos.mjs';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import { habilitarEscrita } from '../../../../dist/conexoes/escrita/habilitarEscrita.js';
import { executarOperacao } from '../../../../dist/conexoes/escrita/executarOperacao.js';

async function ambiente(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-recuperacao-qase-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const mundo = criarMundo();
  const espaco = await criarEspaco({ nome: 'Projeto artificial' }, base);
  habilitarEscrita(espaco.id, 'qase', true, 'pessoa', base);
  const p = { titulo: 'Caso com erro parcial de ligação', descricao: 'Fluxo real simulado',
    passos: [{ acao: 'Entrar', esperado: 'Painel carregado' }], ticket: 'SMART-1' };
  const rodar = () => executarOperacao(mundo.executor, espaco.id, 'qase.criar_caso', p,
    { base, confirmado: true });
  const original = mundo.executor.comContexto.bind(mundo.executor);
  let falharLigacao = true;
  mundo.executor.comContexto = (id, s, fn) => original(id, s, (ctx, rec, info) => fn({
    ...ctx,
    enviar: (...args) => {
      if (args[1].includes('external-issue/attach') && falharLigacao) {
        falharLigacao = false; throw new Error('Falha sintética na ligação externa');
      }
      return ctx.enviar(...args);
    }
  }, rec, info));
  return { mundo, rodar, permitir: () => { falharLigacao = false; } };
}
const escritas = m => m.chamadas.filter(c => c[0] !== 'GET');
const ligacoes = m => escritas(m).filter(c => c[1].includes('external-issue/attach'));

test('Qase: após falha parcial, próxima tentativa usa ID anterior e conclui apenas o vínculo faltante', async t => {
  const a = await ambiente(t);
  const primeiro = await a.rodar();
  assert.equal(primeiro.estado, 'ENVIADA');
  assert.equal(a.mundo.qase.casos.length, 1);
  assert.equal(a.mundo.qase.casos[0].external_issues.length, 0);
  const segundo = await a.rodar();
  assert.equal(segundo.estado, 'CONFIRMADA');
  assert.equal(segundo.remoto.id, primeiro.remoto.id);
  assert.equal(segundo.remoto.detalhes.reconciliado, true);
  assert.equal(a.mundo.qase.casos.length, 1, 'não cria segundo caso');
  assert.equal(ligacoes(a.mundo).length, 1, 'associa o ticket uma única vez');
  assert.deepEqual(a.mundo.qase.casos[0].external_issues[0].issues, [{ id: 'SMART-1' }]);
  const terceiro = await a.rodar();
  assert.equal(terceiro.reutilizada, true);
  assert.equal(ligacoes(a.mundo).length, 1);
});
test('Qase: caso remoto alterado não recebe associação na retomada e não é recriado', async t => {
  const a = await ambiente(t);
  const primeiro = await a.rodar();
  assert.equal(primeiro.estado, 'ENVIADA');
  a.mundo.qase.casos[0].title = 'Caso modificado externamente';
  const antes = escritas(a.mundo).length;
  const segundo = await a.rodar();
  assert.equal(segundo.estado, 'FALHA');
  assert.equal(segundo.erro, 'SERVICE_RESPONSE_INVALID');
  assert.equal(a.mundo.qase.casos.length, 1);
  assert.equal(escritas(a.mundo).length, antes, 'não escreve em registro incompatível');
});
test('Qase: ligação já concluída externamente não é reenviada', async t => {
  const a = await ambiente(t);
  const primeiro = await a.rodar();
  assert.equal(primeiro.estado, 'ENVIADA');
  a.mundo.qase.casos[0].external_issues.push({
    type: 'jira-cloud', issues: [{ id: 'SMART-1' }]
  });
  const antes = escritas(a.mundo).length;
  const segundo = await a.rodar();
  assert.equal(segundo.estado, 'CONFIRMADA');
  assert.equal(escritas(a.mundo).length, antes);
});
