/** Contrato do pré-voo manual: não cria perfil, não executa Electron e não acessa serviço. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const programa = path.join(raiz, 'testes', 'regressao', 'infra', 'preparar-ambiente.mjs');
function executar(arg) {
  return spawnSync(process.execPath, [programa, ...arg], {
    cwd: raiz,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, PRUMO_DATA_DIR: 'C:\\nao-e-perfil-normal',
      PRUMO_TESTE_TOKEN: 'valor-sintetico-nunca-utilizado' }
  });
}
test('homologação padrão apenas verifica pré-requisitos e não inicia Electron', () => {
  const result = executar([]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SOMENTE LEITURA/);
  assert.match(result.stdout, /PREPARADO_SEM_INICIAR/);
  assert.doesNotMatch(result.stdout, /PERFIL_ISOLADO=/);
  assert.doesNotMatch(result.stdout, /valor-sintetico-nunca-utilizado/);
});
test('pré-voo explícito é só leitura e ignora PRUMO_DATA_DIR herdado', () => {
  const result = executar(['--verificar']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PrumoQA/);
  assert.doesNotMatch(result.stdout, /nao-e-perfil-normal/);
  assert.doesNotMatch(result.stdout, /PERFIL_ISOLADO=/);
});
test('comandos desconhecidos e opções conflitantes são bloqueados sem efeitos', () => {
  for (const args of [['--executar'], ['--iniciar', '--verificar'], ['--iniciar', '--iniciar']]) {
    const result = executar(args);
    assert.equal(result.status, 2, 'argumentos recusados: ' + args.join(' '));
    assert.doesNotMatch(result.stdout, /PERFIL_ISOLADO=/);
  }
});
