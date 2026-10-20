import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { montarRecursosUnitarios } from './montar-recursos.mjs';

test('recursos unitários só existem durante a execução e são retirados depois', t => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-recursos-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  fs.mkdirSync(path.join(raiz, 'testes', 'unitario'), { recursive: true });
  const pasta = path.join(raiz, 'testes', 'unitario', 'infra');
  const limpar = montarRecursosUnitarios(raiz);
  assert.equal(fs.readdirSync(pasta).length, 9);
  assert.throws(() => montarRecursosUnitarios(raiz), /LAB_INFRA_OCUPADA/);
  limpar();
  limpar();
  assert.equal(fs.existsSync(pasta), false);
});

test('montagem nunca apaga arquivos preexistentes', t => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-ocupado-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const pasta = path.join(raiz, 'testes', 'unitario', 'infra');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'usuario.txt'), 'preservar');
  assert.throws(() => montarRecursosUnitarios(raiz), /LAB_INFRA_OCUPADA/);
  assert.equal(fs.readFileSync(path.join(pasta, 'usuario.txt'), 'utf8'), 'preservar');
});
