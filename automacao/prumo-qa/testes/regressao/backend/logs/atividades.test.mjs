import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, mkdir, copyFile, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture } from '../../../apoio/fixtures.mjs';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { contextoProjeto } from '../../../../dist/agentes/mcp/contextoProjeto.js';
import { hash } from '../../../../dist/compartilhado/seguranca/hash.js';
import { aplicarConexao } from '../../../../dist/conexoes/ia/aplicarConexao.js';
import { prepararConexao } from '../../../../dist/conexoes/ia/prepararConexao.js';
import { executarValidacao } from '../../../../dist/testes/regras/executarValidacao.js';
import { consultarAtividades } from '../../../../dist/logs/banco/consultarAtividades.js';
import { pastaAtividades } from '../../../../dist/logs/banco/pastaAtividades.js';
import { acompanharLogs } from '../../../../dist/logs/regras/acompanharLogs.js';
import { iniciarAtividade } from '../../../../dist/logs/regras/iniciarAtividade.js';
import { observar } from '../../../../dist/logs/regras/observar.js';
import { limitesHistorico } from '../../../../dist/logs/tipos/atividade.js';
import { calcularMetricas } from '../../../../dist/metricas/regras/calcularMetricas.js';
import { revisarCobertura } from '../../../../dist/testes/regras/revisarCobertura.js';

const cli=path.resolve('dist/cli.js');
const executar=(root,args,env={})=>spawnSync(process.execPath,[cli,...args,'--root',root],{encoding:'utf8',env:{...process.env,...env}});
const dados=()=>mkdtemp(path.join(process.env.PRUMO_DATA_DIR,'histórico '));
const origem={origin:'MCP',client:'sdk-acceptance'};
const plano={requirement:'R1: Apenas Editor grava.',source:'README',sourcePath:'README.md',existingTests:[],candidates:[]};
async function cliente(t,root,base=process.env.PRUMO_DATA_DIR){
  const transport=new StdioClientTransport({command:process.execPath,args:['--require',path.resolve('testes/apoio/conhecimento-hook.cjs'),path.resolve('dist/mcp.js'),root],env:{PRUMO_DATA_DIR:base},stderr:'pipe'});
  let stderr='';transport.stderr.on('data',b=>stderr+=b);
  const c=new Client({name:'sdk-acceptance',version:'1.0.0'});await c.connect(transport);t.after(()=>c.close());
  return {c,stderr:()=>stderr};
}
test('histórico vazio não fabrica atividades, duração, conexão, tokens ou custos',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const m=calcularMetricas(consultarAtividades(p));
  assert.equal(m.totalOperations,0);assert.equal(m.averageDurationMs,null);assert.equal(m.tokens,null);assert.equal(m.cost,null);assert.equal(m.lastActivity,null);
  const r=executar(f.root,[]);assert.equal(r.status,0);assert.match(r.stdout,/nenhuma chamada MCP observada/);assert.match(r.stdout,/0 operações/);
});
test('revisão real: contagens, duração e recomendações sobrevivem a novos processos',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);
  const c={id:'A',behavior:'Salvar',risk:'Perder dados',expected:'Persistência',oracle:'Leitura',source:'README',technique:'equivalence'};
  const entrada={...plano,candidates:[c,{...c,id:'B'},{id:'C',behavior:'Sem oráculo'}]};
  const r=await observar(p,'revisar_cobertura',origem,entrada,async()=>{await esperar(10);return revisarCobertura(p,entrada);});
  const h=consultarAtividades(p);assert.equal(h.events.length,2);assert.equal(h.activities.length,1);
  const e=h.activities[0];assert.equal(e.state,'NOT_VERIFIED');assert.ok(e.durationMs>=10);assert.equal(e.summary.findings,r.findings.length);assert.equal(e.summary.candidateRedundancies,1);assert.equal(e.summary.recommendations,r.findings.length);
  const a=executar(f.root,['atividade','--json']);const b=executar(f.root,['atividade','--json']);
  assert.equal(a.status,0,a.stderr);assert.deepEqual(JSON.parse(a.stdout),JSON.parse(b.stdout));
  const m=JSON.parse(executar(f.root,['metricas','--json']).stdout);assert.equal(m.mcpCalls,1);assert.equal(m.coverageReviews,1);assert.equal(m.executions.PASS,0);assert.ok(m.gaps>0);
  assert.match(executar(f.root,['atividade']).stdout,/redundância ainda é candidata/);
});
test('raízes distintas e identidades distintas não compartilham histórico',async t=>{
  const a=await fixture(t);const b=await fixture(t);const p=await carregarProjeto(a.root);const q=await carregarProjeto(b.root);
  await observar(p,'contexto_projeto',origem,{},()=>contextoProjeto(p));
  assert.equal(consultarAtividades(q).activities.length,0);assert.notEqual(pastaAtividades(p),pastaAtividades(q));
  a.manifest.id='outro';await a.save();assert.equal(consultarAtividades(await carregarProjeto(a.root)).activities.length,0);
  await mkdir(pastaAtividades(q),{recursive:true});const nome=(await readdir(pastaAtividades(p)))[0];await copyFile(path.join(pastaAtividades(p),nome),path.join(pastaAtividades(q),nome));
  const h=consultarAtividades(q);assert.equal(h.activities.length,0);assert.equal(h.complete,false);
});
test('logs omitem prompts, nomes privados, códigos, requisitos, credenciais e texto livre',async t=>{
  const f=await fixture(t,{id:'segredoProjetoXYZ'});const p=await carregarProjeto(f.root);const segredo='senha-super-secreta-xyz';
  const entrada={...plano,requirement:segredo,source:'Bearer sk-0000000000000000000'};
  const r={state:'NOT_VERIFIED',requirement:segredo,stdout:segredo,source:'código privado',password:segredo,findings:[{type:'CONTRADICTORY_REQUIREMENT',recommendation:segredo,source:segredo},{type:segredo,recommendation:segredo}]};
  await observar(p,'revisar_cobertura',{origin:'MCP',client:'token='+segredo},entrada,async()=>r);
  const pasta=pastaAtividades(p);const log=await readFile(path.join(pasta,(await readdir(pasta))[0]),'utf8');
  for(const valor of [segredo,'segredoProjetoXYZ','sk-0000000000000000000','código privado',f.root])assert.ok(!log.includes(valor),valor);
  const h=consultarAtividades(p);assert.equal(h.complete,true);assert.equal(h.activities[0].client,'outro');assert.equal(h.activities[0].summary.types[1].type,'OTHER_FINDING');
});
test('somente leitura mantém raiz intacta e registra bloqueio fora dela',async t=>{
  const f=await fixture(t);f.manifest.execution.readOnly=true;f.manifest.commands={};await f.save();const antes=await readdir(f.root);const p=await carregarProjeto(f.root);
  const e=await observar(p,'executar_validacao',origem,{capability:'unit'},()=>executarValidacao(p,'unit'));
  assert.equal(e.status,'BLOCKED');assert.equal(e.persisted,false);assert.deepEqual(await readdir(f.root),antes);
  const h=consultarAtividades(p);assert.ok(!h.directory.startsWith(f.root));assert.equal(h.activities[0].summary.code,'POLICY_BLOCKED');assert.equal(h.activities[0].summary.evidencePersisted,false);
});
test('métricas de estados são derivadas dos eventos sem confundir erro, revisão e PASS',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);
  for(const status of ['PASS','FAIL','BLOCKED','NOT_RUN'])await observar(p,'executar_validacao',origem,{},async()=>({status,reason:status==='BLOCKED'?'TIMEOUT':undefined}));
  await observar(p,'revisar_cobertura',origem,{},async()=>({state:'NOT_VERIFIED'}));
  await assert.rejects(observar(p,'contexto_projeto',origem,{},async()=>{throw new Error('password=nao-gravar');}));
  iniciarAtividade(p,'executar_validacao',origem); // Interrupção sintética: nunca deve virar NOT_RUN/PASS.
  const m=calcularMetricas(consultarAtividades(p));assert.equal(m.totalOperations,7);assert.equal(m.mcpCalls,7);assert.equal(m.unfinished,1);assert.equal(m.errors,1);assert.equal(m.executionsRequested,5);
  assert.deepEqual(m.executions,{PASS:1,FAIL:1,BLOCKED:1,NOT_RUN:1});
});
test('concorrência de oito processos preserva pares de eventos completos sem sobrescrita',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);
  await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{
    const c=spawn(process.execPath,[cli,'context','--root',f.root],{env:process.env,stdio:['ignore','ignore','pipe'],windowsHide:true});let erro='';c.stderr.on('data',b=>erro+=b);c.on('error',reject);c.on('close',code=>code===0?resolve():reject(new Error(erro)));
  })));
  const h=consultarAtividades(p);assert.equal(h.complete,true);assert.equal(h.events.length,16);assert.equal(h.activities.length,8);assert.equal(calcularMetricas(h).unfinished,0);
});
test('registro corrompido excluído e linha final parcial sinalizada sem inventar término',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);
  await observar(p,'contexto_projeto',origem,{},()=>contextoProjeto(p));
  const a=iniciarAtividade(p,'revisar_cobertura',origem);const arquivo=path.join(pastaAtividades(p),a.id+'.jsonl');await writeFile(arquivo,(await readFile(arquivo,'utf8'))+'{"incompleto":');
  const b=iniciarAtividade(p,'contexto_projeto',origem);await writeFile(path.join(pastaAtividades(p),b.id+'.jsonl'),'invalido\n');
  const h=consultarAtividades(p);assert.equal(h.complete,false);assert.equal(h.activities.length,2);assert.equal(calcularMetricas(h).unfinished,1);assert.equal(h.problems.length,2);
  const r=executar(f.root,['metricas','--json']);assert.equal(r.status,3);assert.equal(JSON.parse(r.stdout).complete,false);assert.match(r.stderr,/HISTORY_INCOMPLETE/);
});
test('paths internos, relativos, junctions, hardlinks e arquivos grandes são recusados',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);assert.throws(()=>pastaAtividades(p,'relativo'));assert.throws(()=>pastaAtividades(p,path.join(f.root,'logs')));
  const base=await dados();const real=await dados();const jun=path.join(base,'link');await symlink(real,jun,process.platform==='win32'?'junction':'dir');assert.throws(()=>pastaAtividades(p,jun),/HISTORY_SYMLINK/);
  const a=iniciarAtividade(p,'contexto_projeto',origem,{}, {base});const arquivo=path.join(pastaAtividades(p,base),a.id+'.jsonl');await link(arquivo,path.join(base,'hardlink'));assert.equal(consultarAtividades(p,base).complete,false);
  const b=iniciarAtividade(p,'contexto_projeto',origem);await writeFile(path.join(pastaAtividades(p),b.id+'.jsonl'),'x'.repeat(limitesHistorico.arquivoBytes+1));assert.equal(consultarAtividades(p).complete,false);
});
test('alteração de valor válido em JSON é detectada pelo digest de integridade',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);
  const a=iniciarAtividade(p,'contexto_projeto',origem);a.finalizar({state:'NOT_VERIFIED'});
  const alvo=path.join(pastaAtividades(p),a.id+'.jsonl');
  const linhas=(await readFile(alvo,'utf8')).trim().split('\n').map(JSON.parse);linhas[1].durationMs+=42;
  await writeFile(alvo,linhas.map(l=>JSON.stringify(l)).join('\n')+'\n');
  assert.equal(consultarAtividades(p).complete,false);assert.equal(consultarAtividades(p).activities.length,0);
});
test('falha de observabilidade no início ou término avisa sem alterar FAIL do núcleo',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const avisos=[];const r={status:'FAIL',executed:true};
  assert.equal(await observar(p,'executar_validacao',origem,{},async()=>r,{base:f.root,diagnostico:f=>avisos.push(f)}),r);
  const base=await dados();await observar(p,'executar_validacao',origem,{},async()=>{
    const pasta=pastaAtividades(p,base);await writeFile(path.join(pasta,(await readdir(pasta))[0]),'x'.repeat(limitesHistorico.arquivoBytes+1));return r;
  },{base,diagnostico:f=>avisos.push(f)});
  assert.deepEqual(avisos,['start','end']);
  const cliResult=executar(f.root,['run','unit'],{PRUMO_DATA_DIR:f.root});assert.equal(cliResult.status,2);assert.equal(JSON.parse(cliResult.stdout).status,'BLOCKED');assert.match(cliResult.stderr,/PRUMO_OBSERVABILITY_ERROR/);
});
test('MCP real registra as oito tools, erros de schema e ferramenta desconhecida',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const {c,stderr}=await cliente(t,f.root);
  assert.equal((await c.listTools()).tools.length,8);
  for(const [name,args] of [['contexto_projeto',{}],['revisar_cobertura',plano],['executar_validacao',{capability:'unit'}],['consultar_evidencias',{}],['contexto_projeto',{root:'../../../'}],['executar_validacao',{capability:'unit',approved:true}],['nao_existe',{}]])await c.callTool({name,arguments:args});
  const h=consultarAtividades(p);assert.equal(h.complete,true);assert.equal(h.events.length,14);assert.equal(calcularMetricas(h).mcpCalls,7);assert.equal(calcularMetricas(h).errors,3);assert.equal(calcularMetricas(h).executions.BLOCKED,1);assert.equal(calcularMetricas(h).executions.PASS,0);
  assert.equal(h.activities.filter(e=>e.tool==='revisar_cobertura')[0].state,'NOT_VERIFIED');assert.equal(stderr(),'');
});
test('falha dos logs MCP é visível em stderr e preserva resposta e protocolo',async t=>{
  const f=await fixture(t);const {c,stderr}=await cliente(t,f.root,f.root);
  const r=await c.callTool({name:'executar_validacao',arguments:{capability:'unit'}});assert.ok(!r.isError);assert.equal(JSON.parse(r.content[0].text).status,'BLOCKED');
  await esperar(50);assert.match(stderr(),/PRUMO_OBSERVABILITY_ERROR/);assert.equal((await c.listTools()).tools.length,8);
});
test('mudança de identidade exige reiniciar MCP e não mistura projetos no diário',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const {c}=await cliente(t,f.root);
  f.manifest.id='novo-projeto';await f.save();
  const r=await c.callTool({name:'contexto_projeto',arguments:{}});assert.equal(r.isError,true);assert.match(r.content[0].text,/Identidade do projeto mudou/);
  assert.equal(consultarAtividades(p).activities[0].state,'ERROR');assert.equal(consultarAtividades(await carregarProjeto(f.root)).activities.length,0);
});
test('consultas CLI em caminho com espaços não incrementam métricas de ferramentas',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const r=executar(f.root,['context']);assert.equal(r.status,0,r.stderr);
  for(const comando of ['atividade','metricas','logs','doctor']) {const c=executar(f.root,[comando,'--json']);assert.equal(c.status,0,c.stderr);}
  assert.equal(calcularMetricas(consultarAtividades(p)).totalOperations,1);
  const evid=executar(f.root,['evidencias']);assert.equal(evid.status,0);assert.match(evid.stdout,/NOT_RUN/);assert.equal(calcularMetricas(consultarAtividades(p)).totalOperations,2);
});
test('follow acompanha novos eventos uma única vez e AbortSignal encerra sem gravar',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const ctrl=new AbortController();const recebidos=[];
  const fim=acompanharLogs(p,e=>{recebidos.push(e);if(e.phase==='end')ctrl.abort();},{signal:ctrl.signal,intervalMs:10});
  await observar(p,'contexto_projeto',origem,{},()=>contextoProjeto(p));await fim;
  assert.equal(recebidos.length,2);assert.deepEqual(recebidos.map(e=>e.phase),['start','end']);assert.equal(consultarAtividades(p).events.length,2);
});
test('CLI logs --follow real entrega JSONL sem duplicação',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);
  const c=spawn(process.execPath,[cli,'logs','--follow','--json','--root',f.root],{env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>c.kill());let out='';let err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',e=>{throw e;});
  await observar(p,'contexto_projeto',origem,{},()=>contextoProjeto(p));
  const deadline=Date.now()+5000;while(out.split('\n').filter(Boolean).length<2&&Date.now()<deadline)await esperar(30);
  assert.equal(out.trim().split('\n').length,2,err);await esperar(1100);assert.equal(out.trim().split('\n').length,2);
  assert.equal(JSON.parse(out.trim().split('\n')[1]).phase,'end');assert.equal(err,'');
});
test('conexão somente propõe configuração em JSON e não aceita aprovação por flag',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const plano=prepararConexao(p,'codex');
  assert.equal(plano.connected,false);assert.ok(plano.configuration.args.includes(f.root));assert.equal(aplicarConexao(plano,'sim').configured,false);
  const c=executar(f.root,['conectar','codex','--json']);assert.equal(c.status,0,c.stderr);assert.equal(JSON.parse(c.stdout).connected,false);
  assert.equal(executar(f.root,['conectar','codex','--yes']).status,2);assert.equal(executar(f.root,['conectar','desconhecido']).status,2);
  const pkg=JSON.parse(await readFile('package.json','utf8'));assert.deepEqual(Object.keys(pkg.bin),['prumo']);assert.equal(pkg.private,true);assert.equal(pkg.license,'UNLICENSED');
});
