/** Publicação em GitHub Issues e leitura das issues abertas: serviço sintético sem rede, rotas conferidas na lista fechada. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarIssueNoGithub } from '../../../../dist/conexoes/github/criarIssueNoGithub.js';
import { rotaEscritaPermitida } from '../../../../dist/conexoes/escrita/rotaEscritaPermitida.js';
import { idsDeOperacao } from '../../../../dist/conexoes/tipos/operacoesExternas.js';
import { marcadorDaOperacao } from '../../../../dist/conexoes/escrita/marcadorDaOperacao.js';
import { lerDetalheDoServico } from '../../../../dist/conexoes/integracoes/lerDetalheDoServico.js';
import { parametrosDaIssueGithub } from '../../../../dist/tickets/regras/publicarProposta.js';

const chave = 'ab'.repeat(32), rec = { chave: 'ana/loja' };
const dados = { titulo: 'Carrinho perde itens', corpo: 'Ao recarregar, o carrinho esvazia. token=SEGREDO1234567890abcdef', rotulos: ['bug', 'prumo-qa'] };

function mundo({ semPush = false } = {}) {
  const issues = [], chamadas = [];
  const ctx = {
    servico: 'github',
    ler: async (url) => {
      chamadas.push(['GET', url]);
      if (url.startsWith('/repos/ana/loja/issues?')) return [...issues].reverse();
      const n = Number(url.split('/').at(-1)); const i = issues.find((x) => x.number === n);
      if (!i) throw Error('NOT_FOUND'); return i;
    },
    enviar: async (metodo, url, body) => {
      assert.equal(metodo, 'POST'); assert.equal(url, '/repos/ana/loja/issues');
      assert.ok(rotaEscritaPermitida('github', metodo, url));
      const b = JSON.parse(body); const number = issues.length + 1;
      // Sem permissão de push, o GitHub aceita a issue e descarta os rótulos em silêncio.
      const i = { number, html_url: `https://github.com/ana/loja/issues/${number}`, title: b.title, body: b.body, state: 'open', labels: semPush ? [] : b.labels.map((name) => ({ name })) };
      issues.push(i); chamadas.push(['POST', url]); return i;
    }
  };
  return { ctx, issues, chamadas };
}
const posts = (m) => m.chamadas.filter((x) => x[0] === 'POST').length;

test('GitHub: criar issue está no catálogo, só na rota exata do repositório e com esquema estrito', () => {
  assert.ok(idsDeOperacao.includes('github.criar_issue'));
  assert.equal(criarIssueNoGithub.exigeConfirmacao, true);
  assert.equal(rotaEscritaPermitida('github', 'POST', '/repos/ana/loja/issues'), true);
  assert.equal(rotaEscritaPermitida('github', 'PATCH', '/repos/ana/loja/issues/1'), false, 'editar issue não tem contrato');
  assert.equal(rotaEscritaPermitida('github', 'POST', '/repos/ana/loja/issues/1/comments'), false);
  assert.equal(rotaEscritaPermitida('github', 'POST', '/repos/ana/loja/actions/workflows/ci.yml/dispatches'), false, 'Actions não é destino de defeito');
  assert.equal(criarIssueNoGithub.schema.safeParse({ ...dados, rotulos: ['a,b'] }).success, false);
  assert.equal(criarIssueNoGithub.schema.safeParse({ ...dados, extra: 1 }).success, false);
});

test('GitHub: cria uma issue mascarada, com marcador oculto, e confirma por releitura', async () => {
  const m = mundo(); const r = await criarIssueNoGithub.executar(m.ctx, rec, dados, chave, {});
  assert.deepEqual([r.id, r.chave, r.url], ['1', '#1', 'https://github.com/ana/loja/issues/1']);
  assert.doesNotMatch(m.issues[0].body, /SEGREDO1234567890abcdef/);
  assert.ok(m.issues[0].body.endsWith(`<!-- ${marcadorDaOperacao(chave)} -->`));
  assert.equal(r.detalhes.rotulosAplicados, 2);
  assert.equal(await criarIssueNoGithub.confirmar(m.ctx, rec, dados, r, chave), true);
  const repetida = await criarIssueNoGithub.executar(m.ctx, rec, dados, chave, {});
  assert.equal(repetida.id, '1'); assert.equal(repetida.detalhes.existente, true); assert.equal(posts(m), 1, 'mesma chave não cria segunda issue');
});

test('GitHub: rótulos descartados sem permissão de push ficam registrados, sem fingir que foram aplicados', async () => {
  const m = mundo({ semPush: true }); const r = await criarIssueNoGithub.executar(m.ctx, rec, dados, chave, {});
  assert.deepEqual([r.detalhes.rotulosPedidos, r.detalhes.rotulosAplicados], [2, 0]);
  assert.equal(await criarIssueNoGithub.confirmar(m.ctx, rec, dados, r, chave), true, 'a issue existe mesmo sem rótulos');
});

test('GitHub: resposta perdida é reconciliada pelo marcador; divergência ou PR não são aceitos', async () => {
  const m = mundo(); const r = await criarIssueNoGithub.executar(m.ctx, rec, dados, chave, {});
  assert.equal((await criarIssueNoGithub.reconciliar(m.ctx, rec, dados, chave)).id, r.id);
  assert.equal((await criarIssueNoGithub.reconciliar(m.ctx, rec, dados, chave, r)).id, r.id);
  assert.equal(await criarIssueNoGithub.reconciliar(m.ctx, rec, dados, 'cd'.repeat(32)), null, 'outra chave não é a mesma issue');
  m.issues[0].title = 'Outro título';
  assert.equal(await criarIssueNoGithub.confirmar(m.ctx, rec, dados, r, chave), false);
  await assert.rejects(criarIssueNoGithub.reconciliar(m.ctx, rec, dados, chave, r), /SERVICE_RESPONSE_INVALID/);
  m.issues[0].title = dados.titulo; m.issues[0].pull_request = { url: 'x' };
  assert.equal(await criarIssueNoGithub.confirmar(m.ctx, rec, dados, r, chave), false, 'um PR não confirma a issue');
  assert.equal(posts(m), 1);
});

test('GitHub: leitura das issues abertas retira PRs e pagina pelos itens brutos', async () => {
  const urls = []; const ctx = { servico: 'github', ler: async (u) => { urls.push(u); return [
    { number: 7, title: 'Bug aberto', state: 'open', html_url: 'https://github.com/ana/loja/issues/7', body: 'corpo', user: { login: 'ana' }, labels: [{ name: 'bug' }], comments: 2, updated_at: '2026-10-15T10:00:00Z' },
    { number: 8, title: 'PR', state: 'open', pull_request: { url: 'x' } }]; } };
  const r = await lerDetalheDoServico(ctx, rec, 'issues', { offset: 0, limite: 2 });
  assert.match(urls[0], /^\/repos\/ana\/loja\/issues\?state=open&/);
  assert.deepEqual(r.dados.map((i) => i.numero), [7]); assert.deepEqual(r.dados[0].rotulos, ['bug']);
  assert.equal(r.proxima, 2, 'a página cheia (contando o PR) continua paginando');
  await lerDetalheDoServico(ctx, rec, 'issues', { offset: 0, limite: 2 }, undefined, { status: 'qualquer' });
  assert.match(urls[1], /state=open/, 'status fora da API não vira parâmetro livre');
  await assert.rejects(lerDetalheDoServico({ ...ctx, servico: 'jira' }, rec, 'issues', { offset: 0, limite: 2 }), (e) => e.codigo === 'SERVICE_WRITE_BLOCKED');
});

test('GitHub: rascunho local vira issue com rótulo conforme a classificação e a falha de origem no corpo', () => {
  const base = { id: '11111111-1111-4111-8111-111111111111', tipo: 'bug', dados: { resumo: 'Falha no login', descricao: 'Erro 500', rotulos: ['prumo-qa'], classificacao: 'PRODUTO' } };
  assert.deepEqual(parametrosDaIssueGithub(base).rotulos, ['bug', 'prumo-qa']);
  assert.deepEqual(parametrosDaIssueGithub({ ...base, dados: { ...base.dados, classificacao: 'MELHORIA' } }).rotulos, ['enhancement', 'prumo-qa']);
  const comFalha = parametrosDaIssueGithub({ ...base, falhaDeOrigem: { runLocalId: '22222222-2222-4222-8222-222222222222', casoId: 12 } });
  assert.match(comFalha.corpo, /^Erro 500\n\nFalha de origem: caso 12 na run local 2222/);
  assert.equal(criarIssueNoGithub.schema.safeParse(comFalha).success, true);
});

test('GitHub: reencontra issue antiga na segunda página sem criar duplicata', async () => {
  const urls = []; let posts = 0;
  const antiga = { number: 9, html_url: 'https://github.com/ana/loja/issues/9', title: dados.titulo,
    body: 'Ao recarregar, o carrinho esvazia. token=[REDACTED]\\n\\n<!-- ' + marcadorDaOperacao(chave) + ' -->',
    state: 'open', labels: [{ name: 'bug' }] };
  // A assinatura do corpo é produzida pelo próprio contrato, evitando supor a máscara aplicada.
  const modelo = mundo();
  const criada = await criarIssueNoGithub.executar(modelo.ctx, rec, dados, chave, {});
  antiga.body = modelo.issues[0].body;
  const recente = Array.from({ length: 100 }, (_, i) => ({
    number: 500 + i, html_url: 'https://github.com/ana/loja/issues/' + (500 + i),
    title: 'Outra issue ' + i, body: 'sem marcador', state: 'open', labels: []
  }));
  const ctx = {
    ler: async (url) => { urls.push(url); return url.includes('page=2') ? [antiga] : recente; },
    enviar: async () => { posts++; throw Error('POST_INDEVIDO'); }
  };
  const recuperada = await criarIssueNoGithub.executar(ctx, rec, dados, chave, {});
  assert.equal(recuperada.id, criada.id === '9' ? criada.id : '9');
  assert.equal(recuperada.detalhes.existente, true);
  assert.equal(posts, 0);
  assert.equal(urls.some(u => u.includes('page=2')), true);
});
test('GitHub: paginação incompleta nunca autoriza novo POST', async () => {
  let posts = 0;
  const ctx = {
    ler: async (url) => Array.from({ length: 100 }, (_, i) => ({
      number: 100 * Number(new URL(url, 'https://github.com').searchParams.get('page')) + i,
      html_url: 'https://github.com/ana/loja/issues/' + i,
      title: 'Outro registro', body: 'outro', state: 'open'
    })),
    enviar: async () => { posts++; throw Error('POST_INDEVIDO'); }
  };
  await assert.rejects(criarIssueNoGithub.executar(ctx, rec, dados, chave, {}), /SERVICE_RESPONSE_LIMIT/);
  await assert.rejects(criarIssueNoGithub.reconciliar(ctx, rec, dados, chave), /SERVICE_RESPONSE_LIMIT/);
  assert.equal(posts, 0);
});
