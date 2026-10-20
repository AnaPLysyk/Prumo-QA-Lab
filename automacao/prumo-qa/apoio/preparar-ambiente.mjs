/**
 * Preparação de homologação manual em perfil independente.
 * Por padrão é leitura pura: sem criar dados, sem abrir Electron e sem rede.
 * --iniciar só em terminal humano, fora da suíte de testes automatizados.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const raiz = process.env.PRUMO_QA_DIR ? path.resolve(process.env.PRUMO_QA_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flagsValidas = new Set(['--verificar', '--iniciar', '--ajuda']);
const diretorioNormal = path.resolve(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'PrumoQA');
const appCompilado = path.join(raiz, 'dist', 'aplicativo.js');
const preload = path.join(raiz, 'backend', 'aplicativo', 'preload.cjs');
const executavel = typeof electronPath === 'string' ? electronPath : '';

function preflight() {
  const ausentes = [[appCompilado, 'Faça npm run build antes de iniciar.'],
    [preload, 'Preload do aplicativo ausente.'],
    [executavel, 'Faça npm ci para instalar o Electron.']]
    .filter(([arquivo]) => !arquivo || !fs.existsSync(arquivo));
  console.log('PRUMO HOMOLOGACAO ISOLADA');
  console.log('Modo padrão: SOMENTE LEITURA. Nenhum aplicativo ou perfil é iniciado.');
  console.log('Código: ' + raiz);
  console.log('Perfil de uso normal (NÃO usar): ' + diretorioNormal);
  console.log('Perfil manual de homologação: pasta temporária nova, somente sob --iniciar.');
  console.log('Credenciais antigas: NÃO copiadas. Escrita remota: desligada por padrão.');
  console.log('Vínculos autorizados para homologação: Jira KAN / Qase PQ, conferir na tela.');
  for (const [, motivo] of ausentes) console.error('BLOQUEIO: ' + motivo);
  return ausentes.length === 0;
}
function ambienteSemSegredos(perfil) {
  // A homologação usa somente a URL pública da API Better Auth; nenhum token ou senha é herdado.
  // Mantém o isolamento do perfil e nunca herda tokens, senhas ou segredos locais.
  const publicas = new Set(['PRUMO_AUTH_API_URL']);
  const variaveis = Object.fromEntries(Object.entries(process.env).filter(([nome]) =>
    publicas.has(nome) || !/TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_KEY|PRIVATE_KEY|AUTHORIZATION|(^|_)KEY$|^NODE_OPTIONS$|^ELECTRON_RUN_AS_NODE$|^PRUMO_/i.test(nome)));
  variaveis.PRUMO_DATA_DIR = perfil;
  variaveis.PRUMO_LOGIN_MVP = '1';
  variaveis.PRUMO_SEM_AVISO_AUTOMATICO = '1';
  return variaveis;
}

if (args.includes('--ajuda')) {
  console.log('Uso: node automacao/prumo-qa/apoio/preparar-ambiente.mjs [--verificar|--iniciar]');
  console.log('Padrão: pré-verificação sem efeitos. --iniciar: abre Electron manual em perfil TEMP isolado.');
} else if (args.some(x => !flagsValidas.has(x)) ||
  (args.includes('--verificar') && args.includes('--iniciar')) ||
  args.filter(x => x === '--iniciar').length > 1) {
  console.error('Argumento inválido. Use --ajuda.'); process.exitCode = 2;
} else {
  const pronto = preflight();
  if (!pronto) process.exitCode = 1;
  else if (args.includes('--iniciar')) {
    // Não adicionar aos scripts de teste; só executar após consentimento explícito.
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-homologacao-manual-'));
    if (path.resolve(perfil).toLowerCase() === diretorioNormal.toLowerCase())
      throw new Error('Perfil de homologação colide com o perfil padrão.');
    console.log('PERFIL_ISOLADO=' + perfil);
    console.log('Aplicativo real; nenhuma conta ou token antigo foi copiado.');
    console.log('No fim, sair pela bandeja. O perfil isolado será preservado para revisão.');
    const filho = spawn(executavel, ['.'], {
      cwd: raiz, env: ambienteSemSegredos(perfil),
      windowsHide: false, stdio: 'inherit', shell: false
    });
    filho.once('error', err => {
      console.error('Não foi possível iniciar o Electron:', err.code ?? err.message);
      process.exitCode = 1;
    });
    filho.once('exit', (codigo, sinal) => {
      if (codigo !== 0) console.error('Electron encerrou com:', codigo ?? sinal);
      process.exitCode = codigo ?? 1;
      console.log('Perfil de homologação preservado: ' + perfil);
      console.log('Não excluir a pasta do perfil normal do Prumo.');
    });
  } else {
    console.log('PREPARADO_SEM_INICIAR');
  }
}
