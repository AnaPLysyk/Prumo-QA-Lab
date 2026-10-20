/** Testes locais da ponte do Lab: selecao segura, sem abrir Electron ou tocar em contas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { argumentos, selecionar } from './executar.mjs';

test('catalogo externo preserva arquivos smoke e regressao', () => {
  assert.equal(selecionar(argumentos(['--tipo', 'smoke'])).length, 2);
  assert.equal(selecionar(argumentos(['--tipo', 'regressao'])).length, 78);
  assert.deepEqual(selecionar(argumentos(['--tipo', 'smoke',
    '--arquivo', 'frontend/aplicativo/todas-as-telas.test.mjs'])),
    ['frontend/aplicativo/todas-as-telas.test.mjs']);
});

test('ponte recusa comandos e caminhos nao autorizados', () => {
  for (const args of [
    ['--tipo', 'unitario'], ['--tipo', 'smoke', '--arquivo', '../outro.test.mjs'],
    ['--tipo', 'regressao', '--empacotado'], ['--tipo', 'smoke', '--exec'],
    ['--tipo', 'smoke', '--arquivo', 'frontend/../login/x.test.mjs']
  ]) assert.throws(() => argumentos(args), /LAB_/);
  assert.throws(() => selecionar(argumentos(['--tipo', 'smoke',
    '--arquivo', 'frontend/login/inexistente.test.mjs'])), /LAB_SELECAO_VAZIA/);
});
