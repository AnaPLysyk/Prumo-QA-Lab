import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fixture } from '../../../apoio/fixtures.mjs';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
mock.module('../../../../dist/testes/aprovacao/solicitarAprovacao.js',{exports:{solicitarAprovacao:async s=>({method:'test-double',scopeHash:s.scopeHash})}});
mock.module('node:child_process',{exports:{spawn:()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  queueMicrotask(()=>{child.emit('error',new Error('ENOENT synthetic spawn failure'));child.emit('close',null);});return child;
}}});
const { executarValidacao } = await import('../../../../dist/testes/regras/executarValidacao.js');
test('erro de criação do subprocesso é BLOCKED e não PASS',async t=>{
  const f=await fixture(t);const r=await executarValidacao(await carregarProjeto(f.root),'unit',true);
  assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'SUBPROCESS_ERROR');assert.equal(r.executed,false);assert.equal(r.exitCode,null);
});
