import test from 'node:test';
import assert from 'node:assert/strict';
import { podeExcluir } from '../src/acesso.mjs';

test('ADMIN pode excluir', () => assert.equal(podeExcluir({ perfil: 'ADMIN' }, { status: 'FECHADO' }), true));
test('visitante não pode excluir', () => assert.equal(podeExcluir(null, { status: 'ABERTO' }), false));
