import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../../apoio/fixtures.mjs';
import { carregarProjeto } from '../../../../dist/compartilhado/projeto/carregarProjeto.js';
const chamadas=[];let respostaLista={status:0,stdout:'[]'};let respostaEscrita={status:0};
mock.module('node:child_process',{exports:{spawnSync:(exe,args,opts)=>{chamadas.push({exe,args,opts});return args[1]==='list'?respostaLista:respostaEscrita;}}});
const { prepararConexao } = await import('../../../../dist/conexoes/ia/prepararConexao.js'); const { aplicarConexao } = await import('../../../../dist/conexoes/ia/aplicarConexao.js');
test('conector exige confirmação exata e preserva configuração existente',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const plano={...prepararConexao(p,'codex'),executable:process.execPath,manualOnly:false};
  chamadas.length=0;assert.equal(aplicarConexao(plano,'sim').configured,false);assert.equal(chamadas.length,0);
  respostaLista={status:0,stdout:JSON.stringify([{name:plano.name,env:{TOKEN:'nao-expor'}}])};
  assert.equal(aplicarConexao(plano,plano.confirmation).configured,false);assert.equal(chamadas.length,1);assert.equal(chamadas[0].args[1],'list');
});
test('falha de inspeção impede escrita; cliente recebe argv sem shell somente após confirmação',async t=>{
  const f=await fixture(t);const p=await carregarProjeto(f.root);const plano={...prepararConexao(p,'codex'),executable:process.execPath,manualOnly:false};
  for(const resposta of [{status:1,stdout:''},{status:0,stdout:'invalido'},{status:0,stdout:'{}'}]){
    chamadas.length=0;respostaLista=resposta;assert.throws(()=>aplicarConexao(plano,plano.confirmation),/CONNECTION_INSPECTION_FAILED/);assert.equal(chamadas.length,1);
  }
  chamadas.length=0;respostaLista={status:0,stdout:'[]'};
  const r=aplicarConexao(plano,plano.confirmation);assert.equal(r.configured,true);assert.equal(chamadas.length,2);assert.equal(chamadas[1].opts.shell,false);assert.deepEqual(chamadas[1].args,plano.args);assert.ok(chamadas[1].args.includes(f.root));
  assert.deepEqual(plano.configuration.env,{PRUMO_DATA_DIR:process.env.PRUMO_DATA_DIR});assert.ok(plano.args.includes('PRUMO_DATA_DIR='+process.env.PRUMO_DATA_DIR));
  respostaEscrita={status:1};assert.throws(()=>aplicarConexao(plano,plano.confirmation),/CONNECTION_WRITE_FAILED/);
});
