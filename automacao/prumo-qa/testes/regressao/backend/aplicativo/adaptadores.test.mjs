import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture } from '../../../apoio/fixtures.mjs';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { executarValidacao } from '../../../../dist/testes/regras/executarValidacao.js';

const cli=path.resolve('dist/cli.js');
test('CLI doctor/context/review/run/evidence funciona por processo em caminho com espaços',async t=>{
  const f=await fixture(t);
  for(const comando of ['doctor','context','evidence']){
    const r=spawnSync(process.execPath,[cli,comando,'--root',f.root],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.doesNotThrow(()=>JSON.parse(r.stdout));
  }
  const plano={requirement:'R1: Apenas Editor grava.',source:'README',sourcePath:'README.md',existingTests:[],candidates:[]};await f.write('plano com espaços.json',JSON.stringify(plano));
  const review=spawnSync(process.execPath,[cli,'review',path.join(f.root,'plano com espaços.json'),'--root',f.root],{encoding:'utf8'});assert.equal(JSON.parse(review.stdout).executed,false);
  const r=spawnSync(process.execPath,[cli,'run','unit','--root',f.root],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).status,'BLOCKED');
  const evidence=spawnSync(process.execPath,[cli,'evidence',JSON.parse(r.stdout).jobId,'--root',f.root],{encoding:'utf8'});assert.equal(JSON.parse(evidence.stdout).results[0].status,'BLOCKED');
  for(const args of [['run','unit','--approved','true'],['run','unit','node tests/test.mjs'],['inventado']]){const r=spawnSync(process.execPath,[cli,...args,'--root',f.root],{encoding:'utf8'});assert.equal(r.status,2);}
});
test('produção não aceita booleano forjado nem env de aprovação',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);
  const e=await executarValidacao(p,'unit',false);assert.equal(e.executed,false);assert.equal(e.approval,null);
  const r=spawnSync(process.execPath,[cli,'run','unit','--root',f.root],{encoding:'utf8',env:{...process.env,PRUMO_APPROVED:'true',QA_APPROVED:'true'}});
  assert.equal(JSON.parse(r.stdout).executed,false);
});
test('MCP real stdio: handshake, tools/list e quatro tools/call, sem stdout extra',async t=>{
  const f=await fixture(t);const transport=new StdioClientTransport({command:process.execPath,args:['--require',path.resolve('testes/apoio/conhecimento-hook.cjs'),path.resolve('dist/mcp.js'),f.root],env:{PRUMO_DATA_DIR:process.env.PRUMO_DATA_DIR},stderr:'pipe'});
  const client=new Client({name:'prumo-acceptance-client',version:'1.0.0'});await client.connect(transport);t.after(()=>client.close());
  const lista=await client.listTools();assert.deepEqual(lista.tools.map(t=>t.name).sort(),['consultar_evidencias','contexto_projeto','executar_validacao','listar_politicas','propor_aprendizado','propor_bug','propor_caso','revisar_cobertura']);
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);};
  const ctx=await call('contexto_projeto');assert.equal(ctx.projectId,'fixture');
  const r=await call('revisar_cobertura',{requirement:'R1: Apenas Editor grava.',source:'README',sourcePath:'README.md',existingTests:[],candidates:[]});assert.equal(r.state,'NOT_VERIFIED');
  const e=await call('executar_validacao',{capability:'unit'});assert.equal(e.status,'BLOCKED');assert.equal(e.executed,false);
  const ev=await call('consultar_evidencias',{jobId:e.jobId});assert.equal(ev.results[0].jobId,e.jobId);
  for(const [name,args] of [['executar_validacao',{capability:'unit',approved:true}],['contexto_projeto',{root:'C:/Windows'}],['consultar_evidencias',{jobId:'../../../'}]]){
    const r=await client.callTool({name,arguments:args});assert.equal(r.isError,true,JSON.stringify(r));
  }
  const ausente=await call('executar_validacao',{capability:'inexistente'});assert.ok(ausente.reason.includes('CAPABILITY_NOT_ALLOWED'));
});
test('CLI inválido e servidor sem raiz falham explicitamente',()=>{
  const r=spawnSync(process.execPath,[path.resolve('dist/mcp.js')],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.ok(r.stderr.includes('raiz-absoluta'));
  const c=spawnSync(process.execPath,[cli,'doctor','--root'],{encoding:'utf8'});assert.equal(c.status,2);
});
test('broker compilado no Windows recusa JSON sem escopo e data expirada sem pedir senha',async()=>{
  if(process.platform!=='win32')return;
  for(const input of [JSON.stringify({approved:true}),JSON.stringify({expiresAt:'2000-01-01T00:00:00Z'})]){
    const r=spawnSync(path.resolve('dist/aprovar.exe'),[],{input,encoding:'utf8'});assert.equal(r.status,1,JSON.stringify({error:r.error,stderr:r.stderr}));assert.equal(r.stdout,'');
  }
});
test('build do broker é incremental e só termina depois de confirmar que o Windows executa o broker',async()=>{
  if(process.platform!=='win32')return;
  const exe=path.resolve('dist/aprovar.exe'),antes=fs.statSync(exe);
  const r=spawnSync(process.execPath,['site/release/build-broker.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/já compilado \(fonte inalterada\)/);assert.match(r.stdout,/executável e recusando entrada sem escopo \(verificado\)/);
  const depois=fs.statSync(exe);assert.equal(depois.mtimeMs,antes.mtimeMs,'o executável não foi recriado sem necessidade');assert.equal(depois.ino,antes.ino);
});
