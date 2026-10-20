/** Testes locais da ponte do Lab: selecao segura, sem abrir Electron ou tocar em contas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { argumentos, selecionar } from './executar.mjs';

test('catálogo externo distingue smoke, regressão, integração e E2E', () => {
  assert.equal(selecionar(argumentos(['--tipo', 'smoke'])).length, 1);
  assert.equal(selecionar(argumentos(['--tipo', 'e2e'])).length, 1);
  assert.equal(selecionar(argumentos(['--tipo', 'regressao'])).length, 79);
  assert.equal(selecionar(argumentos(['--tipo', 'integracao'])).length, 3);
  assert.deepEqual(selecionar(argumentos(['--tipo', 'e2e',
    '--arquivo', 'frontend/aplicativo/todas-as-telas.test.mjs'])),
    ['frontend/aplicativo/todas-as-telas.test.mjs']);
});

test('ponte recusa comandos e caminhos nao autorizados', () => {
  for (const args of [
    ['--tipo', 'unitario'], ['--tipo', 'smoke', '--arquivo', '../outro.test.mjs'],
    ['--tipo', 'regressao', '--empacotado'], ['--tipo', 'smoke', '--arquivo', 'backend/aplicativo/backend-sobe.test.mjs', '--empacotado'], ['--tipo', 'smoke', '--exec'],
    ['--tipo', 'smoke', '--arquivo', 'frontend/../login/x.test.mjs']
  ]) assert.throws(() => argumentos(args), /LAB_/);
  assert.throws(() => selecionar(argumentos(['--tipo', 'smoke',
    '--arquivo', 'frontend/login/inexistente.test.mjs'])), /LAB_SELECAO_VAZIA/);
});
