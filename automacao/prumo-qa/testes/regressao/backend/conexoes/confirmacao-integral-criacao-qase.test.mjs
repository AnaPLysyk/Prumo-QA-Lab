/** Simula releituras da API Qase após a criação. Nunca acessa a rede nem arquivos do projeto. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarCasoNoQase } from '../../../../dist/testes/integracoes/criarCasoNoQase.js';
import { corpoDoCasoQase } from '../../../../dist/testes/integracoes/corpoDoCasoQase.js';
import { esquemaCaso } from '../../../../dist/testes/tipos/escritaQase.js';

const p = esquemaCaso.parse({
  titulo: 'Caso de ponta a ponta', descricao: 'Descrição detalhada', preCondicoes: 'Usuário ativo',
  posCondicoes: 'Sessão encerrada', passos: [{ acao: 'Clicar em entrar', dados: 'usuario=teste', esperado: 'Página inicial' }],
  automacao: 'a-automatizar', suiteId: 10, prioridade: 2, severidade: 3, tipo: 1, tags: ['regressao']
});
const qase = { chave: 'PQ' };
const remoto = { id: '15', chave: 'PQ-15' };
const original = () => ({ id: 15, ...corpoDoCasoQase(p), tags: [{ title: 'regressao' }] });
const confirmar = async conteudo => criarCasoNoQase.confirmar({
  ler: async url => {
    assert.equal(url, '/v1/case/PQ/15');
    return { status: true, result: conteudo };
  }
}, qase, p, remoto);

test('Qase: criação só recebe CONFIRMADA com os dados integralmente reconsultados', async () => {
  assert.equal(await confirmar(original()), true);
});
test('Qase: ID consultável não confirma título nem descrição diferentes', async () => {
  assert.equal(await confirmar({ ...original(), title: 'Outro caso' }), false);
  assert.equal(await confirmar({ ...original(), description: 'Descrição anterior' }), false);
});
test('Qase: passos incompletos, dados alterados ou resultado diferente impedem confirmação', async () => {
  assert.equal(await confirmar({ ...original(), steps: [] }), false);
  assert.equal(await confirmar({ ...original(), steps: [{ ...original().steps[0], data: 'outro dado' }] }), false);
  assert.equal(await confirmar({ ...original(), steps: [{ ...original().steps[0], expected_result: 'Falhou' }] }), false);
});
test('Qase: suíte, prioridade, automação e tags precisam corresponder', async () => {
  assert.equal(await confirmar({ ...original(), suite_id: 11 }), false);
  assert.equal(await confirmar({ ...original(), priority: 1 }), false);
  assert.equal(await confirmar({ ...original(), isToBeAutomated: false }), false);
  assert.equal(await confirmar({ ...original(), tags: [] }), false);
});
test('Qase: mesmo ID com campos obrigatórios omitidos não recebe sucesso', async () => {
  assert.equal(await confirmar({ id: 15 }), false);
});

test('Qase: suíte criada precisa aparecer na releitura com ID, título, descrição e pai corretos', async () => {
  const { criarSuiteNoQase } = await import('../../../../dist/testes/integracoes/criarSuiteNoQase.js');
  const entrada = { titulo: 'Suíte login', descricao: 'Cobertura de login', paiId: 9 };
  const dados = { id: 23, title: 'Suíte login', description: 'Cobertura de login', parent_id: 9 };
  let retorno = dados;
  const ctx = { ler: async () => ({ result: { entities: [retorno] } }) };
  assert.equal(await criarSuiteNoQase.confirmar(ctx, qase, entrada, { id: '23' }), true);
  retorno = { ...dados, description: 'Antes' };
  assert.equal(await criarSuiteNoQase.confirmar(ctx, qase, entrada, { id: '23' }), false);
  retorno = { ...dados, parent_id: 7 };
  assert.equal(await criarSuiteNoQase.confirmar(ctx, qase, entrada, { id: '23' }), false);
  retorno = { ...dados, id: 24 };
  assert.equal(await criarSuiteNoQase.confirmar(ctx, qase, entrada, { id: '23' }), false);
});
test('Qase: suíte de raiz não confunde nomes iguais em outras suítes', async () => {
  const { criarSuiteNoQase } = await import('../../../../dist/testes/integracoes/criarSuiteNoQase.js');
  const entrada = { titulo: 'Regressão', descricao: 'Suite raiz' };
  const ctx = { ler: async () => ({ result: { entities: [
    { id: 30, title: 'Regressão', description: 'Suite filha', parent_id: 2 },
    { id: 31, title: 'Regressão', description: 'Suite raiz', parent_id: null }
  ] } }) };
  assert.equal(await criarSuiteNoQase.confirmar(ctx, qase, entrada, { id: '31' }), true);
  assert.equal(await criarSuiteNoQase.confirmar(ctx, qase, entrada, { id: '30' }), false);
  const conciliado = await criarSuiteNoQase.reconciliar(ctx, qase, entrada);
  assert.equal(conciliado.id, '31');
});
test('Qase: associação ao Jira exige releitura contendo o ticket exato', async () => {
  const { associarTicketAoCasoNoQase } = await import('../../../../dist/testes/integracoes/associarTicketAoCasoNoQase.js');
  let issues = [{ type: 'jira-cloud', issues: [{ id: 'KAN-7' }] }];
  const ctx = { ler: async url => {
    assert.equal(url, '/v1/case/PQ/21?include=external_issues');
    return { result: { id: 21, external_issues: issues } };
  } };
  const entrada = { casoId: 21, ticket: 'KAN-7' };
  assert.equal(await associarTicketAoCasoNoQase.confirmar(ctx, qase, entrada), true);
  assert.equal((await associarTicketAoCasoNoQase.reconciliar(ctx, qase, entrada))?.id, '21');
  issues = [{ type: 'jira-cloud', issues: [{ id: 'KAN-8' }] }];
  assert.equal(await associarTicketAoCasoNoQase.confirmar(ctx, qase, entrada), false);
  issues = [{ type: 'jira-server', issues: [{ id: 'KAN-7' }] }];
  assert.equal(await associarTicketAoCasoNoQase.confirmar(ctx, qase, entrada), false,
    'vínculo de outra integração não pode confirmar Jira Cloud');
  assert.equal(await associarTicketAoCasoNoQase.reconciliar(ctx, qase, entrada), null);
  issues = [];
  assert.equal(await associarTicketAoCasoNoQase.confirmar(ctx, qase, entrada), false);
});

test('Qase: caso com ticket Jira não é CONFIRMADA sem associação comprovada no caso remoto', async () => {
  const comTicket = esquemaCaso.parse({ ...p, ticket: 'KAN-77' });
  const realizar = async (external_issues, detalhes = { ticket: 'KAN-77' }) =>
    criarCasoNoQase.confirmar({
      ler: async url => {
        assert.equal(url, '/v1/case/PQ/15?include=external_issues');
        return { status: true, result: { ...original(), external_issues } };
      }
    }, qase, comTicket, { ...remoto, detalhes });
  assert.equal(await realizar([{ type: 'jira-cloud', issues: [{ id: 'KAN-77' }] }]), true);
  assert.equal(await realizar(undefined), false, 'campo omitido não comprova vínculo');
  assert.equal(await realizar([]), false, 'array vazio não comprova vínculo');
  assert.equal(await realizar([{ type: 'jira-cloud', issues: [{ id: 'KAN-78' }] }]), false);
  assert.equal(await realizar([{ type: 'outro-servico', issues: [{ id: 'KAN-77' }] }]), false);
  assert.equal(await realizar([], { ticket: 'FALHOU:SERVICE_UNAVAILABLE' }), false,
    'falha em associar não pode ser sucesso global só porque o caso existe');
});
