/** Executa suites externas do Prumo QA, sem manter smoke/regressao no repositorio do aplicativo. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const origem = path.dirname(fileURLToPath(import.meta.url));
const padraoQa = path.resolve(origem, '../../../Prumo-Qa');
const auxiliares = ['janela.mjs', 'mundo-servicos.mjs', '_worker-filho.mjs', 'preparar-ambiente.mjs'];

export function argumentos(argv) {
  const opcoes = { qa: padraoQa, tipo: null, arquivo: null, listar: false, empacotado: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--listar' || a === '--empacotado') {
      if (opcoes[a.slice(2)]) throw new Error('LAB_ARGUMENTO_REPETIDO');
      opcoes[a.slice(2)] = true;
    } else if (a === '--qa' || a === '--tipo' || a === '--arquivo') {
      const valor = argv[++i];
      if (!valor || valor.startsWith('--')) throw new Error('LAB_ARGUMENTO_INVALIDO: ' + a);
      opcoes[a.slice(2)] = valor;
    } else throw new Error('LAB_ARGUMENTO_INVALIDO: ' + a);
  }
  if (!['smoke', 'regressao'].includes(opcoes.tipo)) throw new Error('LAB_TIPO_INVALIDO');
  if (opcoes.arquivo && !/^(backend|frontend)\/[a-z-]+\/[a-z0-9._-]+\.test\.mjs$/.test(opcoes.arquivo)) throw new Error('LAB_ARQUIVO_INVALIDO');
  if (opcoes.empacotado && (!opcoes.arquivo || opcoes.tipo !== 'smoke')) throw new Error('LAB_EMPACOTADO_INVALIDO');
  return opcoes;
}

function percorrer(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.isSymbolicLink()) throw new Error('LAB_LINK_RECUSADO');
    const nome = path.join(dir, e.name);
    return e.isDirectory() ? percorrer(nome) : e.isFile() && e.name.endsWith('.test.mjs') ? [nome] : [];
  }).sort();
}

export function selecionar(op, base = origem) {
  const pasta = path.join(base, 'testes', op.tipo);
  const lista = percorrer(pasta).map(p => path.relative(pasta, p).split(path.sep).join('/'));
  const encontrados = op.arquivo ? lista.filter(n => n === op.arquivo) : lista;
  if (!encontrados.length) throw new Error('LAB_SELECAO_VAZIA');
  return encontrados;
}

export function executar(argv = process.argv.slice(2)) {
  const op = argumentos(argv);
  const qa = path.resolve(op.qa);
  if (!fs.existsSync(path.join(qa, 'testes', 'unitario')) ||
      !fs.existsSync(path.join(qa, 'dist', 'aplicativo.js')) ||
      !fs.existsSync(path.join(qa, 'testes', 'unitario', 'infra', 'conhecimento-hook.cjs')))
    throw new Error('LAB_PRUMO_NAO_COMPILADO: execute npm run build no Prumo QA');
  if (process.env.PRUMO_DATA_DIR || (!op.empacotado && process.env.PRUMO_APP_EXE))
    throw new Error('LAB_PERFIL_EXTERNO_RECUSADO');
  const lista = selecionar(op);
  if (op.listar) { console.log(JSON.stringify(lista)); return 0; }
  const copiados = [], diretorios = new Set();
  const copiar = (fonte, destino) => {
    if (fs.existsSync(destino)) throw new Error('LAB_DESTINO_OCUPADO: ' + destino);
    const pai = path.dirname(destino);
    if (!fs.existsSync(pai)) {
      const novos = [];
      let d = pai;
      while (!fs.existsSync(d)) { novos.push(d); d = path.dirname(d); }
      novos.reverse().forEach(d => { fs.mkdirSync(d); diretorios.add(d); });
    }
    fs.copyFileSync(fonte, destino, fs.constants.COPYFILE_EXCL);
    copiados.push(destino);
  };
  try {
    for (const nome of lista) {
      const partes = nome.split('/');
      copiar(path.join(origem, 'testes', op.tipo, ...partes),
        path.join(qa, 'testes', op.tipo, ...partes));
    }
    for (const a of auxiliares) {
      const arquivo = path.join(origem, 'apoio', a);
      if (fs.existsSync(arquivo)) copiar(arquivo, path.join(qa, 'testes', op.tipo, 'infra', a));
    }
    const caminhos = lista.map(n => 'testes/' + op.tipo + '/' + n);
    const cmd = ['--require', './testes/unitario/infra/conhecimento-hook.cjs',
      '--experimental-test-module-mocks', '--test', '--test-concurrency=1', ...caminhos];
    const r = spawnSync(process.execPath, cmd, { cwd: qa, env: { ...process.env, NODE_OPTIONS: '' },
      stdio: 'inherit', windowsHide: true });
    if (r.error) throw r.error;
    return r.status ?? 1;
  } finally {
    for (const arquivo of copiados.reverse()) fs.rmSync(arquivo, { force: true });
    for (const pasta of [...diretorios].sort((a, b) => b.length - a.length)) {
      if (fs.existsSync(pasta) && fs.readdirSync(pasta).length === 0) fs.rmdirSync(pasta);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = executar(); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
