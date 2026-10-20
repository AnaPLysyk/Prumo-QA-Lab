import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from '../../../apoio/fixtures.mjs';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
import { registrosIntegracao } from '../../../../dist/conexoes/banco/registrosIntegracao.js';
import { conferirServidores } from '../../../../dist/conexoes/ia/conferirServidores.js';
import { prepararConexao } from '../../../../dist/conexoes/ia/prepararConexao.js';
import { testarProtocolo } from '../../../../dist/conexoes/ia/testarProtocolo.js';
import { consultarAtividades } from '../../../../dist/logs/banco/consultarAtividades.js';
import { iniciarAtividade } from '../../../../dist/logs/regras/iniciarAtividade.js';

test('configuração exige runtime, servidor, raiz e ambiente exatos, sem expor credenciais', async t => {
  const f=await fixture(t); const p=await carregarProjeto(f.root); const plano=prepararConexao(p,'codex');
  const c={name:'nome-existente',transport:{...plano.configuration,type:'stdio'}};
  assert.deepEqual(conferirServidores(plano,[c]),{found:true,matches:1});
  for(const transport of [{...c.transport,command:'cmd.exe'}, {...c.transport,args:[...c.transport.args,'extra']}, {...c.transport,args:[c.transport.args[0],path.dirname(f.root)]}, {...c.transport,env:{...c.transport.env,TOKEN:'segredo-sintetico'}}]) {
    const r=conferirServidores(plano,[{...c,transport}]); assert.equal(r.found,false); assert.doesNotMatch(JSON.stringify(r),/segredo/);
  }
  assert.equal(conferirServidores(plano,[{...c,enabled:false}]).found,false);
  assert.throws(()=>conferirServidores(plano,{}),/INSPECTION_FAILED/);
});

test('protocolo stdio real: handshake, quatro tools e leitura; evidência persiste e SDK não é Codex', async t => {
  const f=await fixture(t); const p=await carregarProjeto(f.root);
  const r=await testarProtocolo(p,'codex');
  assert.equal(r.state,'VALIDADO'); assert.equal(r.handshake,true); assert.equal(r.read,true); assert.equal(r.tools.length,8);
  const h=consultarAtividades(p); assert.equal(h.activities.length,1); assert.equal(h.activities[0].client,'sdk');
  assert.equal(h.activities[0].tool,'consultar_evidencias'); assert.equal(h.activities[0].summary.executed,undefined);
  const l=registrosIntegracao(await carregarProjeto(f.root)); assert.deepEqual(l.records,[r]); assert.equal(l.problems,0);
  const outro=await fixture(t); assert.equal(registrosIntegracao(await carregarProjeto(outro.root)).records.length,0);
  const dir=path.resolve(h.directory,'..','..','integracoes',path.basename(h.directory));
  const arq=path.join(dir,r.id+'.json'); const raw=JSON.parse(fs.readFileSync(arq,'utf8')); raw.payload=raw.payload.replace('PROTOCOL_OK','PROTOCOL_FAILED');
  fs.writeFileSync(arq,JSON.stringify(raw)); assert.equal(registrosIntegracao(p).problems,1); assert.equal(registrosIntegracao(p).records.length,0);
});

test('referências de contexto preservam somente id, versão, hash e estado; nome de teste não conta como cliente real', async t => {
  const f=await fixture(t); const p=await carregarProjeto(f.root);
  const ref={id:'f169259b-3c94-4224-b686-9171db802304',versao:2,hash:'a'.repeat(64),estado:'APROVADO',texto:'conteudo-privado',origem:{referencia:'pessoa-privada'}};
  const a=iniciarAtividade(p,'contexto_projeto',{origin:'MCP',client:'codex-desktop-test'});
  a.finalizar({state:'NOT_VERIFIED',contextos:{referencias:[ref]}});
  const e=consultarAtividades(p).activities[0]; assert.equal(e.client,'sdk');
  assert.deepEqual(e.summary.contextReferences,[{id:ref.id,versao:2,hash:ref.hash,estado:ref.estado,uso:'incluido_na_resposta'}]);
  assert.doesNotMatch(JSON.stringify(e),/conteudo-privado|pessoa-privada/);
  const revisao=iniciarAtividade(p,'revisar_cobertura',{origin:'MCP',client:'codex'});
  revisao.finalizar({state:'NOT_VERIFIED',executed:false,facts:[{...ref,kind:'context_used'}],findings:[{type:'PW_ESPERA_FIXA',recommendation:'recomendação sintética'}]});
  const historico=consultarAtividades(p);assert.equal(historico.complete,true);
  const fim=historico.activities.find(a=>a.tool==='revisar_cobertura');assert.equal(fim.summary.executed,false);
  assert.equal(fim.summary.contextReferences[0].uso,'consultado_na_revisao');assert.equal(fim.summary.findings,1);
});
test('falha real na leitura de evidência preserva handshake e lista, registra erro e não executa capability',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);fs.mkdirSync(path.join(f.root,'.prumo/evidencias'),{recursive:true});
  fs.writeFileSync(path.join(f.root,'.prumo/evidencias/ebdd3a36-90b8-4a09-af7f-d4087f910126.json'),'{}');
  const r=await testarProtocolo(p,'claude');assert.equal(r.state,'ERRO');assert.equal(r.handshake,true);assert.equal(r.tools.length,8);assert.equal(r.read,false);
  const h=consultarAtividades(p);assert.equal(h.activities.length,1);assert.equal(h.activities[0].tool,'consultar_evidencias');assert.equal(h.activities[0].state,'ERROR');assert.equal(h.activities[0].client,'sdk');
});
