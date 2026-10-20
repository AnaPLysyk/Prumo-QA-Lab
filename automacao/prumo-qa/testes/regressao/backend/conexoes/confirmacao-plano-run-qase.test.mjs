/** Confirma plano/run do Qase por releitura; dados simulados, sem rede ou banco. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarPlanoNoQase } from '../../../../dist/testes/integracoes/criarPlanoNoQase.js';
import { criarRunNoQaseOperacao } from '../../../../dist/testes/integracoes/criarRunNoQaseOperacao.js';
import { conferirIdsDoObjetoQase } from '../../../../dist/testes/integracoes/conferirIdsDoObjetoQase.js';
import { marcadorDaOperacao } from '../../../../dist/conexoes/escrita/marcadorDaOperacao.js';

const chave = 'ed'.repeat(32);
const marcador = marcadorDaOperacao(chave);
const rec = { chave: 'PQ' };
const planos = { titulo: 'Plano de regressão', descricao: 'Cenários críticos', casos: [11, 12, 13] };
const runs = { titulo: 'Run da versão', descricao: 'Regressão dirigida', casos: [11, 12, 13], autoteste: false, planoId: 42 };
const ler = (rota, result) => ({ ler: async url => {
  assert.equal(url, rota);
  return { status: true, result };
} });
const plano = () => ({ id: 42, title: planos.titulo, description: planos.descricao + '\n[' + marcador + ']', cases: [11, 12, 13] });
const run = () => ({ id: 55, title: runs.titulo, description: runs.descricao + '\n[' + marcador + ']',
  cases: [11, 12, 13], is_autotest: false, include_all_cases: false, plan_id: 42 });

test('plano Qase: dados completos e casos conferidos pelo endpoint oficial', async () => {
  assert.equal(await criarPlanoNoQase.confirmar(ler('/v1/plan/PQ/42', plano()), rec, planos, { id: '42' }, chave), true);
});
test('plano Qase: mesmo ID não confirma título, descrição ou casos errados', async () => {
  for (const wrong of [
    { title: 'Outro título' }, { description: 'Sem marcador' },
    { cases: [11, 12] }, { cases: [11, 12, 14] }, { cases: [11, 11, 12, 13] }, { cases: undefined }
  ]) {
    const ok = await criarPlanoNoQase.confirmar(ler('/v1/plan/PQ/42', { ...plano(), ...wrong }), rec, planos, { id: '42' }, chave);
    assert.equal(ok, false, 'plano com diferença ' + Object.keys(wrong));
  }
});
test('run Qase: GET solicita include=cases e confirma configuração e casos', async () => {
  assert.equal(await criarRunNoQaseOperacao.confirmar(
    ler('/v1/run/PQ/55?include=cases', run()), rec, runs, { id: '55' }, chave), true);
});
test('run Qase: a presença do ID não confirma configuração ou casos divergentes', async () => {
  for (const wrong of [
    { title: 'Outro título' }, { description: 'Marcador errado' }, { plan_id: 99 },
    { is_autotest: true }, { include_all_cases: true }, { cases: [11, 12] },
    { cases: [11, 12, 14] }, { cases: null }
  ]) {
    const ok = await criarRunNoQaseOperacao.confirmar(ler('/v1/run/PQ/55?include=cases', { ...run(), ...wrong }),
      rec, runs, { id: '55' }, chave);
    assert.equal(ok, false, 'run com diferença ' + Object.keys(wrong));
  }
});
test('IDs Qase numéricos, string e objetos são reconhecidos sem aceitar dados falsos', () => {
  assert.equal(conferirIdsDoObjetoQase([11, '12', { id: 13 }], [11, 12, 13]), true);
  assert.equal(conferirIdsDoObjetoQase([{ case_id: 11 }, { id: '12' }], [11, 12]), true);
  assert.equal(conferirIdsDoObjetoQase([11, -12], [11, 12]), false);
  assert.equal(conferirIdsDoObjetoQase([{ id: 11 }, { id: 11 }], [11]), false);
  assert.equal(conferirIdsDoObjetoQase([{ unknown: 11 }], [11]), false);
});
