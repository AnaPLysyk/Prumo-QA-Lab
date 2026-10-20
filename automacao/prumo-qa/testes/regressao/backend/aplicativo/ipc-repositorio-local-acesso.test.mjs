/** Fronteira IPC dos casos e suítes locais com Electron e sessão sintéticos; grava somente JSON TEMP. */
import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-ipc-local-')));
const antigaBase = process.env.PRUMO_DATA_DIR;
process.env.PRUMO_DATA_DIR = base;
after(() => {
  if (antigaBase === undefined) delete process.env.PRUMO_DATA_DIR;
  else process.env.PRUMO_DATA_DIR = antigaBase;
  fs.rmSync(base, { recursive: true, force: true });
});

const a = randomUUID();
const usuarioId = randomUUID();
const pastaDaConta = path.join(base, 'usuarios', usuarioId, 'plataforma');
const projeto = { id: a, vinculos: [] };
const registrados = new Map();
const diagnosticos = [];
const consultasSessao = [];
let situacao = 'SEM_SESSAO';
let nivel = 'VER';
let trocarSenha = false;
mock.module('electron', { exports: {
  app: { getVersion: () => 'teste' }, BrowserWindow: class {}, Tray: class {},
  dialog: {}, shell: {}, Menu: class {}, session: {}, nativeImage: {}, safeStorage: {}, Notification: class { static isSupported() { return false; } },
  ipcMain: { handle: (nome, fn) => registrados.set(nome, fn) }
} });
mock.module('../../../../dist/logs/banco/registrarDiagnostico.js', { exports: {
  registrarDiagnostico: reg => diagnosticos.push(reg)
} });
mock.module('../../../../dist/login/regras/sessao.js', { exports: {
  situacaoDaSessao: (_base, _agora, renovar) => {
    consultasSessao.push(renovar);
    if (situacao !== 'ATIVA') return { tipo: situacao };
    return { tipo: 'ATIVA',
      usuario: { id: usuarioId, papel: 'qa-teste', trocarSenha },
      papel: { id: 'qa-teste', nome: 'QA Teste', telas: { testes: nivel } } };
  },
  nivelNaTela: (papel, tela) => papel?.telas[tela] ?? 'NENHUM',
  // 2.15.1: o acesso passa pela conta (marca admin só na Administração); aqui a tela é Testes, então vale o papel.
  nivelDaConta: (_usuario, papel, tela) => papel?.telas[tela] ?? 'NENHUM',
  encerrarSessao: () => {},
  iniciarSessao: () => {},
  contaDaSessao: () => situacao === 'ATIVA' ? { id: usuarioId, papel: 'qa-teste' } : null,
  sessaoParaJanela: () => null,
  contaParaJanela: () => null,
  papelDaConta: () => null,
  ehAdmin: () => false,
  loginLigado: () => false,
  telasDoPapel: () => ({}),
  telasDaConta: () => ({})
} });
mock.module('../../../../dist/projetos/banco/obterEspaco.js', { exports: {
  obterEspaco: id => { if (id !== a) throw new Error('WORKSPACE_NOT_FOUND'); return projeto; }
} });
mock.module('../../../../dist/tickets/banco/listarPropostas.js', { exports: { listarPropostas: () => [] } });

const { registrarCanal } = await import('../../../../dist/aplicativo/api/registrarCanal.js');
const { estadoDoAplicativo } = await import('../../../../dist/aplicativo/estadoDoAplicativo.js');
const { origemPermitida } = await import('../../../../dist/aplicativo/tipos/aplicativo.js');
const { repositorioListar } = await import('../../../../dist/testes/api/repositorioListar.js');
const { repositorioCaso } = await import('../../../../dist/testes/api/repositorioCaso.js');
const { repositorioSuite } = await import('../../../../dist/testes/api/repositorioSuite.js');

registrarCanal('repositorio:listar', repositorioListar);
registrarCanal('repositorio:caso', repositorioCaso);
registrarCanal('repositorio:suite', repositorioSuite);
const frame = { url: origemPermitida };
const sender = { mainFrame: frame };
estadoDoAplicativo.janelaPrincipal = { webContents: sender, isDestroyed: () => false };
const evento = { sender, senderFrame: frame };
const chamar = (canal, dados, remetente = evento) => registrados.get('prumo:' + canal)(remetente, dados);
const ler = () => chamar('repositorio:listar', { espacoId: a });

test('canais privados são registrados e sem sessão não há leitura nem escrita', async () => {
  assert.deepEqual([...registrados.keys()].sort(), ['prumo:repositorio:caso', 'prumo:repositorio:listar', 'prumo:repositorio:suite']);
  for (const [canal, dados] of [
    ['repositorio:listar', { espacoId: a }],
    ['repositorio:caso', { espacoId: a, dados: { titulo: 'Sem sessão' } }],
    ['repositorio:suite', { espacoId: a, titulo: 'Sem sessão' }]
  ]) {
    const r = await chamar(canal, dados);
    assert.equal(r.ok, false);
    assert.match(r.error, /SESSION_REQUIRED/);
  }
  assert.equal(fs.existsSync(path.join(pastaDaConta, 'repositorio-testes-local.json')), false);
});

test('sem login inicial e sessão expirada recusam os três canais', async () => {
  for (const [tipo, codigo] of [['SEM_LOGIN', 'LOGIN_SETUP_REQUIRED'], ['EXPIRADA', 'SESSION_EXPIRED']]) {
    situacao = tipo;
    for (const [canal, dados] of [
      ['repositorio:listar', { espacoId: a }],
      ['repositorio:caso', { espacoId: a, dados: { titulo: 'Caso protegido' } }],
      ['repositorio:suite', { espacoId: a, titulo: 'Suíte protegida' }]
    ]) {
      const r = await chamar(canal, dados);
      assert.equal(r.ok, false); assert.match(r.error, new RegExp(codigo));
    }
  }
  situacao = 'ATIVA';
});

test('papel somente leitura lista; escrita em casos e suítes é negada sem alterar o arquivo', async () => {
  nivel = 'VER';
  const lista = await ler();
  assert.equal(lista.ok, true);
  assert.deepEqual(lista.data.casos, []); assert.deepEqual(lista.data.suites, []);
  const c = await chamar('repositorio:caso', { espacoId: a, dados: { titulo: 'Não deve salvar' } });
  const s = await chamar('repositorio:suite', { espacoId: a, titulo: 'Não deve salvar' });
  assert.match(c.error, /PERMISSION_DENIED/); assert.match(s.error, /PERMISSION_DENIED/);
  assert.equal(fs.existsSync(path.join(pastaDaConta, 'repositorio-testes-local.json')), false);
});

test('papel sem acesso não pode sequer consultar casos', async () => {
  nivel = 'NENHUM';
  const r = await ler();
  assert.match(r.error, /PERMISSION_DENIED/);
  nivel = 'USAR';
});

test('papel com permissão usa handlers reais, grava JSON temporário e consulta resultado', async () => {
  const s = await chamar('repositorio:suite', { espacoId: a, titulo: 'Suíte funcional' });
  assert.equal(s.ok, true, JSON.stringify(s)); assert.equal(s.data.titulo, 'Suíte funcional');
  const c = await chamar('repositorio:caso', { espacoId: a, suiteLocalId: s.data.id,
    dados: { titulo: 'Autenticação', passos: [{ acao: 'Entrar', esperado: 'Acesso liberado', dados: 'login=qa' }] } });
  assert.equal(c.ok, true);
  const l = await ler();
  assert.equal(l.ok, true); assert.equal(l.data.casos[0].id, c.data.id);
  assert.equal(l.data.casos[0].suiteLocalId, s.data.id);
  assert.equal(l.data.casos[0].dados.passos[0].dados, 'login=qa');
  assert.equal(fs.existsSync(path.join(pastaDaConta, 'repositorio-testes-local.json')), true);
  assert.equal(fs.existsSync(path.join(pastaDaConta, 'propostas.json')), false);
});

test('rebaixar permissão e exigir troca de senha bloqueia gravações imediatamente', async () => {
  nivel = 'VER';
  let r = await chamar('repositorio:caso', { espacoId: a, dados: { titulo: 'Bloqueado após rebaixamento' } });
  assert.match(r.error, /PERMISSION_DENIED/);
  nivel = 'USAR'; trocarSenha = true;
  r = await chamar('repositorio:suite', { espacoId: a, titulo: 'Bloqueado senha pendente' });
  assert.match(r.error, /PASSWORD_CHANGE_REQUIRED/);
  trocarSenha = false;
});

test('origem, webContents e mainFrame diferentes não acessam os handlers privados', async () => {
  for (const invasor of [
    { sender: { mainFrame: frame }, senderFrame: frame },
    { sender, senderFrame: { url: origemPermitida } },
    { sender, senderFrame: { url: origemPermitida + '#sub' } }
  ]) {
    const r = await chamar('repositorio:caso', { espacoId: a, dados: { titulo: 'Tentativa inválida' } }, invasor);
    assert.match(r.error, /IPC_SENDER_REJECTED/);
  }
  frame.url = origemPermitida + '?outra-pagina';
  assert.match((await ler()).error, /IPC_SENDER_REJECTED/);
  frame.url = origemPermitida;
});

test('schema estrito recusa campo inesperado e projeto inválido antes de consultar a sessão', async () => {
  const antes = consultasSessao.length;
  const r1 = await chamar('repositorio:caso', { espacoId: a, dados: { titulo: 'Inválido' }, campoExtra: 'injetado' });
  const r2 = await chamar('repositorio:suite', { espacoId: 'outro-projeto', titulo: 'Inválido' });
  assert.match(r1.error, /INVALID_ARGUMENTS/); assert.match(r2.error, /INVALID_ARGUMENTS/);
  assert.equal(consultasSessao.length, antes);
});

test('Qase vinculado impede cadastro local mesmo com permissão de escrita', async () => {
  projeto.vinculos = [{ servico: 'qase' }];
  try {
    const c = await chamar('repositorio:caso', { espacoId: a, dados: { titulo: 'Caso remoto concorrente' } });
    const s = await chamar('repositorio:suite', { espacoId: a, titulo: 'Suíte remota concorrente' });
    assert.match(c.error, /LOCAL_CASE_QASE_LINKED/);
    assert.match(s.error, /LOCAL_SUITE_QASE_LINKED/);
  } finally { projeto.vinculos = []; }
});

test('diagnóstico IPC registra somente metadados, sem título, passos ou dados de casos', () => {
  const texto = JSON.stringify(diagnosticos);
  assert.ok(diagnosticos.some(x => x.channel === 'repositorio:caso' && x.state === 'ERROR'));
  assert.ok(diagnosticos.some(x => x.channel === 'repositorio:caso' && x.state === 'OK'));
  assert.doesNotMatch(texto, /Autenticação|login=qa|Tentativa inválida/);
  assert.ok(consultasSessao.includes(true));
});
