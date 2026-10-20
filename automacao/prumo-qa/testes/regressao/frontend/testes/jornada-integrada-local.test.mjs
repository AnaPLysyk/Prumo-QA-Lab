/** Jornada integrada sem Electron: frontend verdadeiro -> contrato IPC -> handlers -> JSON isolado.
 * Não testa o transporte IPC real, autenticação da janela nem Chromium.
 */
import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-jornada-ui-')));
const anterior = process.env.PRUMO_DATA_DIR;
process.env.PRUMO_DATA_DIR = base;
after(() => { if (anterior === undefined) delete process.env.PRUMO_DATA_DIR; else process.env.PRUMO_DATA_DIR = anterior;
  fs.rmSync(base, { recursive: true, force: true }); });
const A = randomUUID(), B = randomUUID();
const projetos = new Map([[A, { id: A, vinculos: [] }], [B, { id: B, vinculos: [] }]]);
mock.module('../../../../dist/projetos/banco/obterEspaco.js', { exports: { obterEspaco: id => {
  if (!projetos.has(id)) throw new Error('WORKSPACE_NOT_FOUND'); return projetos.get(id);
} } });
mock.module('../../../../dist/tickets/banco/listarPropostas.js', { exports: { listarPropostas: () => [] } });
const { esquemasIpc } = await import('../../../../dist/aplicativo/api/catalogoDeContratos.js');
const { repositorioCaso } = await import('../../../../dist/testes/api/repositorioCaso.js');
const { repositorioSuite } = await import('../../../../dist/testes/api/repositorioSuite.js');
const { repositorioListar } = await import('../../../../dist/testes/api/repositorioListar.js');
const { diretorioDados } = await import('../../../../dist/compartilhado/banco/diretorioDados.js');
const handlers = { 'repositorio:caso': repositorioCaso, 'repositorio:suite': repositorioSuite, 'repositorio:listar': repositorioListar };
async function canal(nome, bruto) {
  const parsed = esquemasIpc[nome].safeParse(bruto);
  if (!parsed.success) return { ok: false, error: 'INVALID_ARGUMENTS' };
  try { return { ok: true, data: await handlers[nome](parsed.data) }; }
  catch (e) { return { ok: false, error: String(e.message) }; }
}
const api = {
  casoLocalSalvar: args => canal('repositorio:caso', args),
  suiteLocalSalvar: args => canal('repositorio:suite', args),
  repositorioLocal: espacoId => canal('repositorio:listar', { espacoId })
};
class No {
  constructor(tag, attrs = {}, itens = []) {
    this.tag = tag; this.attrs = attrs; this.children = []; this.parent = null;
    this.value = attrs.value == null ? '' : String(attrs.value); this.disabled = false;
    this.onclick = attrs.onclick; this.append(...itens);
    if (tag === 'textarea' && itens.length) this.value = String(itens[0]);
    if (tag === 'select') this.value = this.querySelectorAll('option').find(n => n.attrs.selected)?.value ??
      this.querySelectorAll('option')[0]?.value ?? '';
  }
  append(...itens) { for (const x of itens.flat(Infinity)) if (x != null && x !== false) {
    if (x instanceof No) x.parent = this; this.children.push(x);
  } }
  replaceChildren(...xs) { this.children = []; this.append(...xs); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
  focus() {}
  querySelectorAll(selector) {
    const out = [], match = n => selector.startsWith('#') ? n.attrs.id === selector.slice(1)
      : selector.startsWith('.') ? String(n.attrs.class || '').split(' ').includes(selector.slice(1)) : n.tag === selector;
    const walk = n => { for (const x of n.children) if (x instanceof No) { if (match(x)) out.push(x); walk(x); } };
    walk(this); return out;
  }
  querySelector(s) { return this.querySelectorAll(s)[0] ?? null; }
}
const h = (tag, attrs, ...filhos) => new No(tag, attrs, filhos);
const campo = (_, attrs) => { const input = h('input', attrs); return { input, no: h('div', {}, input) }; };
const source = p => fs.readFileSync(path.join(root, p), 'utf8');
const suitesJS = source('frontend/testes/fluxos-repositorio-local.parte.js');
const i = suitesJS.indexOf('  function formularioSuiteLocal(e, suites, atual = null) {');
const j = suitesJS.indexOf('  async function telaCasosLocais(e, _mem, corpo) {', i);
assert.ok(i >= 0 && j > i, 'formulário original de suíte localizado');
function montarUI() {
  const s = { modal: null, avisos: [], salvos: 0, fechados: 0 };
  const DS = { acao: (t, fn, p = {}) => h('button', { id: p.id, onclick: fn }, t),
    info: t => h('p', {}, t), alerta: t => h('span', {}, t),
    campo: (t, el) => h('label', {}, t, el), rodape: (...xs) => h('footer', {}, xs),
    modal: (_, filhos) => { s.modal = h('div', {}, filhos); },
    fecharModal: () => { s.fechados++; } };
  const ctx = { h, api, DS, tr: t => t, avisar: t => s.avisos.push(t), mostrar: async () => {},
    campoPlataforma: campo, campoTexto: (_, id, attrs) => campo('', { ...attrs, id }) };
  vm.createContext(ctx);
  vm.runInContext(source('frontend/compartilhado/criarBotaoAcao.js') + '\n' +
    source('frontend/testes/formularios/montarFormularioProposta.js') + '\n' +
    suitesJS.slice(i, j) + '\nthis.caso = (p,c,s) => formularioProposta(p,c, () => this.salvou(),s); this.suite = formularioSuiteLocal;',ctx);
  ctx.salvou = () => { s.salvos++; }; return { ctx, s };
}
const projeto = (id = A) => ({ id, vinculos: projetos.get(id).vinculos });
const preencher = (no, id, val) => { const el = no.querySelector('#' + id); assert.ok(el, id); el.value = val; };
const clicar = async (no, id) => { const b = no.querySelector('#' + id); assert.ok(b, id); await b.onclick({ currentTarget: b }); };
test('UI cria suíte e caso via contratos/handlers reais e relê persistência após edição', async () => {
  const u = montarUI(); u.ctx.suite(projeto(), []);
  preencher(u.s.modal, 'suite-local-titulo', 'Funcional'); await clicar(u.s.modal, 'suite-local-salvar');
  let res = await api.repositorioLocal(A); assert.equal(res.ok, true); assert.equal(res.data.suites.length, 1);
  const suite = res.data.suites[0];
  const form = u.ctx.caso(projeto(), null, [suite]);
  preencher(form, 'pr-titulo', 'Validar autenticação'); preencher(form, 'pr-suite-local', suite.id);
  preencher(form, 'pr-requisito', 'REQ-LOGIN');
  const passo = form.querySelector('.passo');
  passo.querySelector('.passo-acao').value = 'Abrir login';
  passo.querySelector('.passo-dados').value = 'usuario=qa';
  passo.querySelector('.passo-esperado').value = 'Acesso liberado';
  await clicar(form, 'pr-salvar'); assert.equal(u.s.salvos, 1);
  res = await api.repositorioLocal(A); assert.equal(res.data.casos.length, 1);
  const caso = res.data.casos[0];
  assert.equal(caso.suiteLocalId, suite.id); assert.equal(caso.dados.passos[0].dados, 'usuario=qa');
  const edit = u.ctx.caso(projeto(), caso, [suite]);
  preencher(edit, 'pr-titulo', 'Autenticação revisada'); await clicar(edit, 'pr-salvar');
  res = await api.repositorioLocal(A);
  assert.equal(res.data.casos.length, 1); assert.equal(res.data.casos[0].id, caso.id);
  assert.equal(res.data.casos[0].dados.passos[0].dados, 'usuario=qa');
  assert.equal(res.data.casos[0].dados.titulo, 'Autenticação revisada');
  const pastaDados = path.join(diretorioDados(), 'plataforma');
  assert.equal(fs.existsSync(path.join(pastaDados, 'repositorio-testes-local.json')), true);
  assert.equal(fs.existsSync(path.join(pastaDados, 'propostas.json')), false);
  assert.equal(fs.existsSync(path.join(base, 'plataforma', 'repositorio-testes-local.json')), false, 'não grava fora do escopo da conta');
});
test('schema estrito bloqueia payload adicional e impede gravação', async () => {
  const antes = (await api.repositorioLocal(A)).data.casos.length;
  const res = await api.casoLocalSalvar({ espacoId: A, dados: { titulo: 'Teste de limite' }, extra: 1 });
  assert.equal(res.ok, false); assert.equal(res.error, 'INVALID_ARGUMENTS');
  assert.equal((await api.repositorioLocal(A)).data.casos.length, antes);
});
test('isolamento cruzado e Qase vinculado impedem cadastros locais concorrentes', async () => {
  const criada = await api.suiteLocalSalvar({ espacoId: A, titulo: 'Suíte para verificar isolamento' });
  assert.equal(criada.ok, true);
  const suiteId = criada.data.id;
  assert.equal((await api.repositorioLocal(B)).data.casos.length, 0);
  const cruzado = await api.casoLocalSalvar({ espacoId: B, suiteLocalId: suiteId, dados: { titulo: 'Outro projeto' } });
  assert.match(cruzado.error, /LOCAL_SUITE_SCOPE/);
  projetos.get(A).vinculos = [{ servico: 'qase' }];
  try {
    const c = await api.casoLocalSalvar({ espacoId: A, dados: { titulo: 'Caso remoto' } });
    const s = await api.suiteLocalSalvar({ espacoId: A, titulo: 'Suite remota' });
    assert.match(c.error, /LOCAL_CASE_QASE_LINKED/); assert.match(s.error, /LOCAL_SUITE_QASE_LINKED/);
  } finally { projetos.get(A).vinculos = []; }
});

test('UI mostra erro de validação e mantém caso aberto sem salvar dados inválidos', async () => {
  const ui = montarUI();
  const form = ui.ctx.caso(projeto(B), null, []);
  preencher(form, 'pr-titulo', 'x');
  await clicar(form, 'pr-salvar');
  assert.equal(ui.s.salvos, 0);
  assert.match(form.querySelector('#pr-saida').children[0].children[0], /INVALID_ARGUMENTS/);
  assert.equal((await api.repositorioLocal(B)).data.casos.length, 0);
});

test('UI de suíte impede ciclo e preserva cadastro anterior', async () => {
  const pai = await api.suiteLocalSalvar({ espacoId: B, titulo: 'Pai' });
  assert.equal(pai.ok, true);
  const filha = await api.suiteLocalSalvar({ espacoId: B, titulo: 'Filha', paiId: pai.data.id });
  assert.equal(filha.ok, true);
  const ui = montarUI();
  ui.ctx.suite(projeto(B), [pai.data, filha.data], pai.data);
  preencher(ui.s.modal, 'suite-local-pai', filha.data.id);
  await clicar(ui.s.modal, 'suite-local-salvar');
  assert.equal(ui.s.fechados, 0);
  assert.match(ui.s.modal.querySelector('#suite-local-saida').children[0].children[0], /LOCAL_SUITE_CYCLE/);
  const registro = (await api.repositorioLocal(B)).data;
  assert.equal(registro.suites.find(s => s.id === pai.data.id).paiId, null);
});
