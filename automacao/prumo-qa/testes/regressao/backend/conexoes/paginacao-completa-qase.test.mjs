/** Qase paginado sintético: não acessa rede, banco nem projeto externo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { listarNoQase } from '../../../../dist/testes/integracoes/listarNoQase.js';
import { criarCasoNoQase } from '../../../../dist/testes/integracoes/criarCasoNoQase.js';
import { criarSuiteNoQase } from '../../../../dist/testes/integracoes/criarSuiteNoQase.js';
import { criarPlanoNoQase } from '../../../../dist/testes/integracoes/criarPlanoNoQase.js';
import { marcadorDaOperacao } from '../../../../dist/conexoes/escrita/marcadorDaOperacao.js';

const rec = { chave: 'PQ' };
function servico(lista, { semContagem = false, totalIncoerente = false } = {}) {
  const consultas = []; const escritas = [];
  const ctx = {
    ler: async url => {
      const u = new URL(url, 'https://api.qase.test');
      consultas.push({ path: u.pathname, offset: Number(u.searchParams.get('offset')), limit: Number(u.searchParams.get('limit')) });
      const filtro = u.searchParams.get('search');
      const suite = u.searchParams.get('suite_id');
      const filtrados = lista.filter(x => (!filtro || x.title.toLowerCase().includes(filtro.toLowerCase())) &&
        (!suite || String(x.suite_id) === suite));
      const offset = Number(u.searchParams.get('offset')), limit = Number(u.searchParams.get('limit'));
      const page = filtrados.slice(offset, offset + limit);
      return { status: true, result: { entities: page, ...(!semContagem ? {
        total: totalIncoerente ? 400 : lista.length, filtered: totalIncoerente ? 400 : filtrados.length
      } : {}) } };
    },
    enviar: async (...params) => { escritas.push(params); throw new Error('Não deve gravar quando há duplicata'); }
  };
  return { ctx, consultas, escritas };
}
test('Qase: percorre 3 páginas e encontra registros na posição 240 sem duplicar offsets', async () => {
  const lista = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, title: 'Caso ' + i }));
  const t = servico(lista);
  const encontrados = await listarNoQase(t.ctx, rec, 'case', {});
  assert.equal(encontrados.length, 250);
  assert.deepEqual(t.consultas.map(x => x.offset), [0, 100, 200]);
  assert.deepEqual(t.consultas.map(x => x.limit), [100, 100, 100]);
});
test('Qase: criação não duplica caso cujo título aparece apenas na terceira página', async () => {
  const lista = Array.from({ length: 235 }, (_, i) => ({ id: i + 1, title: 'Exemplo duplicado 230 - variante ' + i, suite_id: 9 }));
  lista[230].title = 'Exemplo duplicado 230';
  const t = servico(lista);
  await assert.rejects(criarCasoNoQase.executar(t.ctx, rec, {
    titulo: 'Exemplo duplicado 230', descricao: '', preCondicoes: '', posCondicoes: '',
    passos: [], automacao: 'manual', tags: [], suiteId: 9
  }), /SERVICE_DUPLICATE/);
  assert.equal(t.escritas.length, 0);
  assert.deepEqual(t.consultas.map(x => x.offset), [0, 100, 200]);
});
test('Qase: suíte pai correta na terceira página bloqueia criação duplicada', async () => {
  const lista = Array.from({ length: 224 }, (_, i) => ({ id: i + 1, title: 'Login E2E variante ' + i, description: '', parent_id: null }));
  lista[216] = { id: 217, title: 'Login E2E', description: '', parent_id: 12 };
  const t = servico(lista);
  await assert.rejects(criarSuiteNoQase.executar(t.ctx, rec, { titulo: 'Login E2E', descricao: '', paiId: 12 }), /SERVICE_DUPLICATE/);
  assert.equal(t.escritas.length, 0);
  assert.deepEqual(t.consultas.map(x => x.offset), [0, 100, 200]);
});
test('Qase: plano criado, mas com resposta perdida, é reconciliado na última página', async () => {
  const chave = 'ab'.repeat(32);
  const marcador = '[' + marcadorDaOperacao(chave) + ']';
  const lista = Array.from({ length: 245 }, (_, i) => ({ id: i + 1, title: 'Plano ' + i, description: '' }));
  lista[244].description = 'Caso regressão\n' + marcador;
  const t = servico(lista);
  const x = await criarPlanoNoQase.reconciliar(t.ctx, rec, { titulo: 'Plano regressão', descricao: '', casos: [5, 6] }, chave);
  assert.equal(x.id, '245');
  assert.deepEqual(t.consultas.map(q => q.offset), [0, 100, 200]);
});
test('Qase: sem contagem, lista completa por página curta; sem registros retorna vazia', async () => {
  const lista = Array.from({ length: 170 }, (_, i) => ({ id: i + 1, title: 'Sem contagem ' + i }));
  const t = servico(lista, { semContagem: true });
  assert.equal((await listarNoQase(t.ctx, rec, 'case', {})).length, 170);
  assert.deepEqual(t.consultas.map(x => x.offset), [0, 100]);
  assert.deepEqual(await listarNoQase(servico([]).ctx, rec, 'case', {}), []);
});
test('Qase: limite de 1000 e página incompleta impedem conclusão falsa', async () => {
  const muitos = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, title: 'Registro ' + i }));
  const a = servico(muitos);
  await assert.rejects(listarNoQase(a.ctx, rec, 'case', {}), /SERVICE_RESPONSE_INVALID/);
  const b = servico([{ id: 1, title: 'Caso' }], { totalIncoerente: true });
  await assert.rejects(listarNoQase(b.ctx, rec, 'case', {}), /SERVICE_RESPONSE_INVALID/);
});
