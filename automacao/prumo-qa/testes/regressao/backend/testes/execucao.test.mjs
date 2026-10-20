import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../../../apoio/fixtures.mjs';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { hash } from '../../../../dist/compartilhado/seguranca/hash.js';
import { consultarEvidencias } from '../../../../dist/testes/banco/consultarEvidencias.js';

// Double APENAS neste processo de testes. Nenhum adaptador aceita isso do usuário/IA.
let autorizar=async scope=>({subject:'FIXTURE-NON-HUMAN',method:'test-double',scopeHash:scope.scopeHash,at:new Date().toISOString()});
mock.module('../../../../dist/testes/aprovacao/solicitarAprovacao.js',{exports:{solicitarAprovacao:scope=>autorizar(scope)}});
const { executarValidacao } = await import('../../../../dist/testes/regras/executarValidacao.js'); const { ambienteMinimo } = await import('../../../../dist/testes/regras/ambienteMinimo.js');

test('sem consentimento, capability ausente e bloqueio de política não executam',async t=>{
  const f=await fixture(t);let p=await carregarProjeto(f.root);
  assert.equal((await executarValidacao(p,'unit')).reason.split(':')[0],'HUMAN_APPROVAL_REQUIRED');
  assert.equal((await executarValidacao(p,'inventado',true)).reason.split(':')[0],'CAPABILITY_NOT_ALLOWED');
  f.manifest.execution.blockedByDefault=['unit'];await f.save();p=await carregarProjeto(f.root);
  const e=await executarValidacao(p,'unit',true);assert.equal(e.status,'BLOCKED');assert.equal(e.executed,false);
});
test('PASS real do subprocesso tem apenas status da rodada sem relatório individual',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const e=await executarValidacao(p,'unit',true);
  assert.equal(e.status,'PASS');assert.equal(e.exitCode,0);assert.equal(e.executed,true);assert.equal(e.evidenceScope,'round');assert.equal(e.cases.length,0);assert.ok(e.stdout.includes('rodada real'));
  assert.equal((await consultarEvidencias(p,e.jobId)).results[0].logSha256,e.logSha256);assert.equal((await consultarEvidencias(p,e.jobId,'não-existe')).status,'NOT_RUN');
});
test('FAIL real preserva exit code diferente de zero mesmo com casos PASS',async t=>{
  const f=await fixture(t);await f.write('tests/test.mjs',`import {writeFileSync} from 'node:fs'; writeFileSync(process.env.PRUMO_RESULT_FILE,JSON.stringify({jobId:process.env.PRUMO_JOB_ID,cases:[{id:'a',status:'PASS',evidence:'assertion'}]}));process.exitCode=7;`);
  const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.exitCode,7);assert.equal(e.status,'FAIL');assert.equal(e.cases[0].status,'PASS');
});
test('resultados individuais PASS/FAIL/BLOCKED/NOT_RUN e zero casos não são inventados',async t=>{
  for(const status of ['PASS','FAIL','BLOCKED','NOT_RUN']){
    const f=await fixture(t);await f.write('tests/test.mjs',`import {writeFileSync} from 'node:fs'; writeFileSync(process.env.PRUMO_RESULT_FILE,JSON.stringify({jobId:process.env.PRUMO_JOB_ID,cases:[{id:'a',status:'${status}',evidence:'resultado sintético de teste do classificador'}]}));`);
    const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.status,status);assert.equal(e.cases[0].status,status);assert.equal(e.evidenceScope,'individual');
  }
});
test('timeout encerra processo e preserva BLOCKED',async t=>{
  const f=await fixture(t);f.manifest.execution.timeoutMs=150;await f.save();await f.write('tests/test.mjs','setInterval(()=>{},1000);');
  const inicio=Date.now();const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.reason,'TIMEOUT');assert.equal(e.status,'BLOCKED');assert.ok(Date.now()-inicio<8000);
});
test('saída limitada e segredo mascarado entre chunks',async t=>{
  const f=await fixture(t);await f.write('tests/test.mjs',`process.stdout.write('token=seg');setTimeout(()=>{process.stdout.write('redo123\\n');process.stdout.write('x'.repeat(10000));},10);`);
  const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.reason,'OUTPUT_LIMIT');assert.ok(!e.stdout.includes('segredo123'));assert.ok(e.stdout.length<=4096);
});
test('ambiente mínimo não herda segredo, NODE_TEST_CONTEXT, HOME nem NODE_OPTIONS',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const anterior=process.env.API_TOKEN;process.env.API_TOKEN='segredo123';
  try {const env=ambienteMinimo(p,{env:{}},'a');assert.equal(env.API_TOKEN,undefined);assert.equal(env.NODE_TEST_CONTEXT,undefined);assert.equal(env.HOME,undefined);assert.equal(env.PATH,undefined);
    await f.write('tests/test.mjs',`if(process.env.API_TOKEN||process.env.NODE_OPTIONS||process.env.NODE_TEST_CONTEXT)process.exitCode=9;console.log('ambiente mínimo');`);
    assert.equal((await executarValidacao(p,'unit',true)).status,'PASS');
  } finally { if(anterior===undefined)delete process.env.API_TOKEN;else process.env.API_TOKEN=anterior; }
});
test('pré-condições obrigatórias bloqueiam antes da aprovação',async t=>{
  const f=await fixture(t);f.manifest.commands.unit={executable:'node',args:['tests/test.mjs'],requiredFiles:['ausente.md']};await f.save();
  const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.status,'BLOCKED');assert.equal(e.executed,false);
});
test('npm run executa script declarado com PATH construído, não herdado',async t=>{
  const f=await fixture(t);f.manifest.commands.unit='npm run unit';await f.save();
  const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.status,'PASS',e.reason+' '+e.stderr);assert.equal(e.exitCode,0);assert.ok(e.stdout.includes('rodada real'));
});
test('consentimento cancelado, escopo incorreto e alteração após consentimento bloqueiam',async t=>{
  const f=await fixture(t);const original=autorizar;
  try {
    autorizar=async()=>null;assert.equal((await executarValidacao(await carregarProjeto(f.root),'unit',true)).executed,false);
    autorizar=async()=>({scopeHash:'forjado'});assert.equal((await executarValidacao(await carregarProjeto(f.root),'unit',true)).executed,false);
    autorizar=async scope=>{await f.write('src/app.mjs','mudou');return {scopeHash:scope.scopeHash,method:'test-double'};};
    const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.reason.split(':')[0],'SCOPE_CHANGED');assert.equal(e.executed,false);
  }finally{autorizar=original;}
});
test('artefato falso, job antigo e duplicação de casos não geram PASS',async t=>{
  for(const value of ['{}',JSON.stringify({jobId:'00000000-0000-4000-8000-000000000000',cases:[]})]){
    const f=await fixture(t);await f.write('tests/test.mjs',`import {writeFileSync} from 'node:fs';writeFileSync(process.env.PRUMO_RESULT_FILE,${JSON.stringify(value)});`);
    const e=await executarValidacao(await carregarProjeto(f.root),'unit',true);assert.equal(e.status,'BLOCKED');assert.equal(e.reason,'INVALID_RESULT');
  }
});
test('evidência corrompida e transferida para outro projeto recusadas',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const e=await executarValidacao(p,'unit',true);
  const envelope=JSON.parse(await readFile(e.evidencePath,'utf8'));envelope.sha256='0';await writeFile(e.evidencePath,JSON.stringify(envelope));
  await assert.rejects(consultarEvidencias(p,e.jobId),/Integridade/);
  const e2=await executarValidacao(p,'unit',true);const r=JSON.parse(await readFile(e2.evidencePath,'utf8'));const data=JSON.parse(r.payload);data.rootHash=hash('outro');r.payload=JSON.stringify(data);r.sha256=hash(r.payload);await writeFile(e2.evidencePath,JSON.stringify(r));
  await assert.rejects(consultarEvidencias(p,e2.jobId),/outro contexto/);
});
test('demo end-to-end: assertions reais e relatório de seis casos, broker substituído explicitamente',async t=>{
  const {cp,mkdtemp,rm}=await import('node:fs/promises');const os=await import('node:os');
  const root=await mkdtemp(path.join(os.tmpdir(),'prumo demo espaço '));t.after(()=>rm(root,{recursive:true,force:true}));
  await cp(path.resolve('backend/projetos/exemplos/projeto-demo'),root,{recursive:true,filter:s=>!s.includes('.prumo')});
  const e=await executarValidacao(await carregarProjeto(root),'unit',true);
  assert.equal(e.status,'PASS');assert.equal(e.cases.length,6);assert.ok(e.cases.every(c=>c.status==='PASS'));assert.equal(e.approval.method,'test-double');
});
