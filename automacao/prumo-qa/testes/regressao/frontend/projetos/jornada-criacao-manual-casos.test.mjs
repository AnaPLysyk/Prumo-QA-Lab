/** Jornada isolada: UI real Projetos -> Repositório -> suíte/caso local, somente JSON em TEMP.
 * Sem Electron, Chromium, SQLite, projetos externos, rede ou perfil normal.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const dados = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-projeto-manual-')));
const baseOriginal = process.env.PRUMO_DATA_DIR;
process.env.PRUMO_DATA_DIR = dados;
after(() => {
  if (baseOriginal === undefined) delete process.env.PRUMO_DATA_DIR;
  else process.env.PRUMO_DATA_DIR = baseOriginal;
  fs.rmSync(dados, { recursive: true, force: true });
});

const { esquemasIpc } = await import('../../../../dist/aplicativo/api/catalogoDeContratos.js');
const { criarEspaco } = await import('../../../../dist/projetos/servicoProjetos.js');
const { listarEspacos } = await import('../../../../dist/projetos/banco/projetos.js');
const { salvarSuiteLocal } = await import('../../../../dist/testes/servicoCasos.js');
const { salvarCasoLocal } = await import('../../../../dist/testes/servicoCasos.js');
const { listarRepositorioLocal } = await import('../../../../dist/testes/servicoCasos.js');
const validar = (canal, entrada, fn) => {
  const r = esquemasIpc[canal].safeParse(entrada);
  if (!r.success) return Promise.resolve({ ok: false, error: 'INVALID_ARGUMENTS' });
  return Promise.resolve().then(() => fn(r.data)).then(data => ({ ok: true, data }))
    .catch(e => ({ ok: false, error: e.message }));
};
const api = {
  espacos: () => Promise.resolve({ ok: true, data: listarEspacos(dados) }),
  projetos: () => Promise.resolve({ ok: true, data: [] }),
  espacoCriar: entrada => validar('espacos:criar', entrada, d => criarEspaco(d, dados)),
  espacoEditar: (_id, _entrada) => Promise.resolve({ ok: false, error: 'Não testado' }),
  suiteLocalSalvar: entrada => validar('repositorio:suite', entrada, d => salvarSuiteLocal(d, dados)),
  casoLocalSalvar: entrada => validar('repositorio:caso', entrada, d => salvarCasoLocal(d, dados)),
  repositorioLocal: espacoId => validar('repositorio:listar', { espacoId }, d => listarRepositorioLocal(d.espacoId, dados))
};

class No {
  constructor(tag, attrs = {}, itens = []) {
    this.tag = tag; this.attrs = attrs || {}; this.children = []; this.parent = null;
    this.value = this.attrs.value == null ? '' : String(this.attrs.value); this.disabled = false;
    this.onclick = this.attrs.onclick ?? null; this.append(...itens);
    if (tag === 'textarea' && itens.length) this.value = String(itens[0]);
    if (tag === 'select') this.value = this.querySelectorAll('option').find(n => n.attrs.selected)?.value ??
      this.querySelectorAll('option')[0]?.value ?? '';
  }
  append(...args) { for (const x of args.flat(Infinity)) if (x != null && x !== false) {
    if (x instanceof No) x.parent = this;
    this.children.push(x);
  }}
  replaceChildren(...xs) { this.children = []; this.append(...xs); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
  focus() { this.focused = true; }
  addEventListener() {}
  querySelectorAll(selector) {
    const out = [], match = n => selector.startsWith('#') ? n.attrs.id === selector.slice(1)
      : selector.startsWith('.') ? String(n.attrs.class || '').split(' ').includes(selector.slice(1))
      : selector.startsWith('[data-espaco=') ? n.attrs['data-espaco'] === selector.slice(13, -1)
      : n.tag === selector;
    const walk = no => { for (const x of no.children) if (x instanceof No) {
      if (match(x)) out.push(x); walk(x);
    }};
    walk(this); return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
const h = (tag, attrs, ...filhos) => new No(tag, attrs, filhos);
const source = p => fs.readFileSync(path.join(raiz, p), 'utf8');
const campo = (_, attrs) => { const input = h('input', attrs); return { input, no: h('label', {}, input) }; };
const suitesJS = source('frontend/testes/fluxos-repositorio-local.parte.js');
const i = suitesJS.indexOf('  function formularioSuiteLocal(');
const botaoJS = source('frontend/design-system/ds.js').split(/\r?\n/).find(l => l.startsWith('const botao = '));
const propostaJS = source('frontend/testes/propostas.js').split('/** Mostra cada proposta')[0];
// Projetos agora é um arquivo só: carrega apenas escolherEspaco e abrirFormularioProjeto (o formulário real de cadastro).
const projetosCompleto = source('frontend/projetos/tela-projetos.js');
const projetosJS = projetosCompleto.slice(0, projetosCompleto.indexOf('/** Projetos: importa cada recurso'));
assert.ok(projetosJS.includes('function abrirFormularioProjeto(') && projetosJS.includes('function escolherEspaco('));
// A bancada real de um projeto (montarSecaoProjeto), com o mapa de conexões substituído por um bloco vazio.
const bancadaJS = projetosCompleto.slice(projetosCompleto.indexOf('/** Projetos: uma bancada por vez'), projetosCompleto.indexOf('/** Tela Projetos: um único mapa ativo'));
assert.ok(bancadaJS.includes('function montarSecaoProjeto('));
const j = suitesJS.indexOf('  async function telaCasosLocais(e, _mem, corpo) {', i);
assert.ok(i > 0 && j > i);

function montarUI() {
  const estado = { espaco: null, root: null, sub: {} };
  const controle = { tela: null, modal: null, salvou: 0, raizSalva: 0, podeTestes: true, avisos: [] };
  const abas = { projetos: async () => {} };
  const DS = {
    link: (texto, fn) => h('button', { onclick: fn }, texto),
    info: texto => h('p', {}, texto),
    origem: (_servico, texto) => h('span', {}, texto),
    nomesServico: { qase: 'Qase', github: 'GitHub', jira: 'Jira' },
    acao: (texto, fn, opt = {}) => h('button', { id: opt.id, onclick: fn }, texto),
    alerta: texto => h('span', {}, texto),
    campo: (nome, el) => h('label', {}, nome, el),
    rodape: (...args) => h('footer', {}, args),
    modal: (_titulo, filhos) => { controle.modal = h('div', {}, filhos); },
    fecharModal: () => { controle.fechou = true; }
  };
  const ctx = {
    estado, abas, api, h, DS, window: { PrumoConta: { pode: aba => aba !== 'testes' || controle.podeTestes } },
    tr: texto => texto, textoErro: t => String(t), selo: x => h('span', {}, x), hora: x => x,
    avisar: mensagem => controle.avisos.push(mensagem),
    campoPlataforma: campo,
    campoTexto: (_titulo, id, attrs) => campo('', { ...attrs, id }),
    salvarRaiz: () => { controle.raizSalva++; },
    chamar: async fn => { const r = await fn(); if (!r.ok) { controle.avisos.push(r.error); return null; } return r.data; },
    abrirRepositoriosGithub: () => {},
    montarFluxoProjeto: () => h('div', {}),
    mostrar: async aba => {
      controle.tela = aba;
      if (aba === 'projetos') { controle.vista = h('main', {}); await ctx.abas.projetos(controle.vista); }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(
    botaoJS + '\n' +
    projetosJS + '\n' +
    bancadaJS + '\n' +
    propostaJS + '\n' +
    suitesJS.slice(i, j) +
    '\nthis.criarCaso = (e,c,s) => formularioProposta(e,c,() => this.salvo(),s); this.criarSuite = formularioSuiteLocal;', ctx);
  ctx.salvo = () => { controle.salvou++; };
  return { ctx, estado, controle };
}
const u = montarUI();
const preencher = (no, id, val) => { const el = no.querySelector('#' + id); assert.ok(el, 'campo '+id); el.value = val; };
const clicar = async (no, id) => { const el = no.querySelector('#' + id); assert.ok(el, 'botão '+id); await el.onclick({ currentTarget: el }); };

async function criarPelaUI(nome) {
  u.controle.vista = h('main', {});
  u.ctx.abrirFormularioProjeto(u.controle.vista, null);
  assert.equal(u.controle.vista.querySelector('#espaco-nome').focused, true);
  preencher(u.controle.vista, 'espaco-nome', nome);
  preencher(u.controle.vista, 'espaco-descricao', 'Projeto manual sem integração');
  await clicar(u.controle.vista, 'espaco-salvar');
  assert.equal(u.controle.tela, 'projetos');
  assert.equal(u.estado.espaco.nome, nome);
  return u.estado.espaco;
}

test('criar projeto manual pela tela sem Qase ou GitHub abre repositório de testes correto', async () => {
  const e = await criarPelaUI('Projeto QA Manual');
  assert.equal(e.vinculos.length, 0); assert.equal(e.pastaLocal, undefined);
  assert.equal(fs.existsSync(path.join(e.raizContextos, 'qa.project.json')), true);
  const contrato = JSON.parse(fs.readFileSync(path.join(e.raizContextos, 'qa.project.json'), 'utf8'));
  assert.equal(contrato.execution.readOnly, true);
  assert.deepEqual(contrato.context.tests, []);
  assert.equal(u.controle.raizSalva, 1);
  await u.ctx.escolherEspaco(e, 'testes'); // o mesmo que o botão "Abrir testes" da bancada de Projetos chama
  assert.equal(u.controle.tela, 'testes');
  assert.equal(u.estado.sub.testes, 'repositorio');
  assert.equal(u.estado.espaco.id, e.id);
});

test('repositório do projeto manual cria suíte e caso usando a interface e persistência reais', async () => {
  const e = u.estado.espaco;
  u.ctx.criarSuite(e, []);
  preencher(u.controle.modal, 'suite-local-titulo', 'Funcionais');
  await clicar(u.controle.modal, 'suite-local-salvar');
  let repo = await api.repositorioLocal(e.id);
  assert.equal(repo.ok, true); assert.equal(repo.data.suites.length, 1);
  const suite = repo.data.suites[0];
  const form = u.ctx.criarCaso(e, null, [suite]);
  preencher(form, 'pr-titulo', 'Validar login de administrador');
  preencher(form, 'pr-suite-local', suite.id);
  const passo = form.querySelector('.passo');
  passo.querySelector('.passo-acao').value = 'Abrir a entrada';
  passo.querySelector('.passo-esperado').value = 'Formulário visível';
  passo.querySelector('.passo-dados').value = 'Perfil fictício';
  await clicar(form, 'pr-salvar');
  repo = await api.repositorioLocal(e.id);
  assert.equal(repo.data.casos.length, 1);
  assert.equal(repo.data.casos[0].suiteLocalId, suite.id);
  assert.equal(repo.data.casos[0].dados.passos[0].dados, 'Perfil fictício');
  assert.equal(fs.existsSync(path.join(dados, 'plataforma', 'repositorio-testes-local.json')), true);
  assert.equal(fs.existsSync(path.join(dados, 'plataforma', 'credenciais.json')), false);
});

test('trocar de projeto abre repositório correto, sem casos do outro projeto', async () => {
  const primeiro = u.estado.espaco;
  const segundo = await criarPelaUI('Projeto Independente');
  assert.notEqual(segundo.id, primeiro.id);
  await u.ctx.escolherEspaco(segundo, 'testes');
  const repoB = await api.repositorioLocal(segundo.id);
  assert.deepEqual(repoB.data.casos, []); assert.deepEqual(repoB.data.suites, []);
  assert.equal((await api.repositorioLocal(primeiro.id)).data.casos.length, 1);
  assert.equal(u.estado.espaco.id, segundo.id);
  assert.equal(u.estado.sub.testes, 'repositorio');
});

// A bancada mostra um projeto por vez; cada projeto é desenhado com e sem permissão à tela Testes.
test('atalho de casos não aparece sem permissão à tela Testes', async () => {
  const projetos = (await api.espacos()).data;
  assert.ok(projetos.length >= 2);
  try {
    for (const e of projetos) {
      u.controle.podeTestes = false;
      assert.equal(u.ctx.montarSecaoProjeto(e, projetos).querySelector('#espaco-testes-' + e.id), null, 'sem permissão: ' + e.nome);
      u.controle.podeTestes = true;
      assert.ok(u.ctx.montarSecaoProjeto(e, projetos).querySelector('#espaco-testes-' + e.id), 'com permissão: ' + e.nome);
    }
  } finally { u.controle.podeTestes = true; }
});
