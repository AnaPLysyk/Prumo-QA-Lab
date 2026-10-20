/** Testa o encaminhamento das consultas por serviço sem acessar rede ou contas reais. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lerDetalheDoServico } from '../../../../dist/conexoes/integracoes/lerDetalheDoServico.js';

const recurso = { chave: 'equipe/prumo', id: 'fixture' };
const montarContexto = (servico, resposta) => {
  const chamadas = [];
  const ctx = {
    servico,
    instancia: 'https://fixture.example.test',
    limpar: (valor) => valor,
    ler: async (caminho) => { chamadas.push(caminho); return resposta; },
    enviar: async () => { throw new Error('teste de leitura não permite escrita'); }
  };
  return { ctx, chamadas };
};

test('consultas recusam operação pertencente a outro serviço sem chamar rede', async () => {
  const { ctx, chamadas } = montarContexto('github', {});
  await assert.rejects(
    lerDetalheDoServico(ctx, recurso, 'metadados', { offset: 0, limite: 20 }),
    /SERVICE_WRITE_BLOCKED/
  );
  assert.equal(chamadas.length, 0);
});

test('consulta de arquivos do GitHub recusa caminhos com subida de pasta', async () => {
  const { ctx, chamadas } = montarContexto('github', {});
  await assert.rejects(
    lerDetalheDoServico(ctx, recurso, 'arquivos', { offset: 0, limite: 20 }, '../segredo'),
    /SERVICE_RESPONSE_INVALID/
  );
  assert.equal(chamadas.length, 0);
});

test('workflows GitHub preservam paginação, campos e endereço de leitura', async () => {
  const { ctx, chamadas } = montarContexto('github', {
    total_count: 2,
    workflow_runs: [
      { id: 17, name: 'CI', status: 'completed', conclusion: 'success', head_sha: 'abcdef1' }
    ]
  });
  const resultado = await lerDetalheDoServico(ctx, recurso, 'workflows', { offset: 0, limite: 1 }, undefined, { branch: 'teste' });
  assert.deepEqual(chamadas, ['/repos/equipe/prumo/actions/runs?per_page=1&page=1&branch=teste']);
  assert.equal(resultado.proxima, 1);
  assert.equal(resultado.endpoint, '/repos/equipe/prumo/actions/runs');
  assert.deepEqual(resultado.dados, [{
    id: 17, nome: 'CI', estado: 'completed', conclusao: 'success', branch: null,
    commit: 'abcdef1', evento: null, numero: null, url: null, criado: null
  }]);
});

test('consulta de plano Qase mantém o formato da resposta e valida o identificador', async () => {
  const { ctx, chamadas } = montarContexto('qase', { result: { id: 19, titulo: 'Plano de teste' } });
  const resultado = await lerDetalheDoServico(ctx, { chave: 'PRUMO' }, 'plano', { offset: 0, limite: 20 }, '19');
  assert.deepEqual(chamadas, ['/v1/plan/PRUMO/19']);
  assert.deepEqual(resultado.dados, { id: 19, titulo: 'Plano de teste' });
  assert.equal(resultado.proxima, null);
  assert.equal(resultado.endpoint, '/v1/plan/{code}/{id}');
  await assert.rejects(
    lerDetalheDoServico(ctx, { chave: 'PRUMO' }, 'plano', { offset: 0, limite: 20 }, '../19'),
    /SERVICE_RESPONSE_INVALID/
  );
  assert.equal(chamadas.length, 1);
});
