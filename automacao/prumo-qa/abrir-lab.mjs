/**
 * Abre o front-end REAL do Prumo QA com conta descartável e e-mail simulado.
 * Exclusivo do Prumo-QA-Lab: não é importado pelo app, nem empacotado no release.
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arquivo = fileURLToPath(import.meta.url);
const qa = path.resolve(path.dirname(arquivo), '../../../Prumo-Qa');

/** Restringe o modo Lab a um serviço local e a um perfil temporário. */
export function ambienteLab(url, pasta, original = process.env) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port ||
      !path.isAbsolute(pasta)) {
    throw new Error('LAB_AMBIENTE_INVALIDO');
  }
  // Lista positiva: tokens e segredos herdados do terminal jamais chegam ao Electron do Lab.
  const permitidas = [
    'PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA',
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'ProgramFiles', 'ProgramFiles(x86)',
    'ProgramData', 'ComSpec', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
    'HOME', 'LANG', 'DISPLAY', 'XDG_RUNTIME_DIR'
  ];
  const sistema = Object.fromEntries(permitidas.filter(chave => original[chave] !== undefined)
    .map(chave => [chave, original[chave]]));
  const env = {
    ...sistema, PRUMO_SERVICO: parsed.origin, PRUMO_DATA_DIR: pasta,
    PRUMO_AUTH_API_URL: '', PRUMO_LOGIN_MVP: '0', PRUMO_AMBIENTE: 'lab',
    PRUMO_SEM_AVISO_AUTOMATICO: '1', NODE_OPTIONS: ''
  };
  for (const chave of ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'RESEND_API_KEY',
    'PRUMO_EMAIL_REMETENTE', 'NEON_API_KEY', 'PRUMO_SUPORTE_TOKEN',
    'PRUMO_SUPORTE_CHAVE_ADMIN', 'ELECTRON_RUN_AS_NODE']) delete env[chave];
  return env;
}

/** Extrai apenas o código emitido pela caixa local, para o e-mail fictício solicitado. */
export function ultimoCodigoLab(mensagens, email) {
  const ultima = mensagens.filter(m => m.para === email).at(-1);
  const achado = ultima && /\b(\d{6})\b/.exec(ultima.texto);
  if (!achado) throw new Error('LAB_EMAIL_LOCAL_NAO_RECEBIDO');
  return achado[1];
}

async function abrirLab() {
  if (process.env.PRUMO_DATA_DIR || process.env.PRUMO_APP_EXE) throw new Error('LAB_PERFIL_EXTERNO_RECUSADO');
  for (const caminho of ['dist/aplicativo.js', 'site/scripts/desktop-entry.cjs']) {
    if (!fs.existsSync(path.join(qa, caminho))) throw new Error('LAB_APP_NAO_COMPILADO: execute npm run build no Prumo-Qa');
  }
  const requireQa = createRequire(path.join(qa, 'package.json'));
  const { _electron: electron } = requireQa('playwright-core');
  const electronPath = requireQa('electron');
  const { criarServico } = await import(pathToFileURL(path.join(qa, 'backend/aplicativo/servidor/servidor.mjs')).href);
  const mensagens = [];
  const servidor = http.createServer(criarServico({
    enviar: async msg => { mensagens.push(msg); }, registrar: () => {}
  }));
  const pasta = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'PrumoQA-Lab-')));
  let aplicativo = null;
  try {
    await new Promise((resolve, reject) => {
      servidor.once('error', reject);
      servidor.listen(0, '127.0.0.1', resolve);
    });
    const url = 'http://127.0.0.1:' + servidor.address().port;
    const env = ambienteLab(url, pasta);
    const conta = {
      email: 'laboratorio@prumo.test',
      nome: 'Prumo Lab',
      senha: 'Lab-' + randomBytes(24).toString('hex') + '-2026'
    };
    aplicativo = await electron.launch({
      executablePath: electronPath,
      args: [path.join(qa, 'site/scripts/desktop-entry.cjs')],
      cwd: qa, env
    });
    const pagina = await aplicativo.firstWindow();
    await pagina.waitForSelector('#entrada[open]', { timeout: 45000 });
    const pedido = await pagina.evaluate(email => window.prumo.contaCodigo(email, 'CADASTRO'), conta.email);
    if (!pedido?.ok) throw new Error('LAB_ENVIO_LOCAL_FALHOU: ' + String(pedido?.error || 'resposta inválida').slice(0, 100));
    const codigo = ultimoCodigoLab(mensagens, conta.email);
    const ativacao = await pagina.evaluate(c => window.prumo.usuariosAtivar(c.email, c.nome, c.senha, c.codigo),
      { ...conta, codigo });
    if (!ativacao?.ok) throw new Error('LAB_ATIVACAO_FALHOU: ' + String(ativacao?.error || 'resposta inválida').slice(0, 100));
    await pagina.reload();
    await pagina.waitForSelector('#conta-botao', { timeout: 45000 });
    await pagina.evaluate(() => { document.title = 'Prumo QA — LAB | dados temporários'; });
    await pagina.click('#nav button[data-aba="projetos"]');
    await pagina.waitForSelector('#nav button[data-aba="projetos"][aria-current="page"]');
    console.log('PRUMO LAB ABERTO: Projetos. E-mail simulado localmente; nenhuma conta externa utilizada.');
    console.log('Feche a janela do Prumo QA — LAB para descartar a conta e os dados fictícios.');
    await new Promise(resolve => aplicativo.once('close', resolve));
  } finally {
    try { await aplicativo?.close(); } catch { /* janela já encerrada */ }
    await new Promise(resolve => servidor.close(() => resolve()));
    fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === arquivo) {
  abrirLab().catch(e => { console.error('LAB_ERRO: ' + e.message); process.exitCode = 1; });
}
