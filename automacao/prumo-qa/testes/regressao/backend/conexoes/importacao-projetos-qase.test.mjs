/** Importação Qase com transporte sintético e pasta TEMP (sem API, banco ou projeto externo). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nucleoServicos } from '../../../../dist/conexoes/regras/nucleoServicos.js';
import { lerEspacos } from '../../../../dist/projetos/banco/lerEspacos.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import { listarContas } from '../../../../dist/conexoes/banco/listarContas.js';

const projeto=(i)=>({code:'Q'+String(i).padStart(3,'0'),title:'Projeto Qase '+i});
function montar(t,qtd=3){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'prumo-qase-import-fake-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const fontes=Array.from({length:qtd},(_,i)=>projeto(i+1));
  const consultas=[];
  let indisponivel=false;
  const transporte=async pedido=>{
    consultas.push(pedido.caminho);
    if(indisponivel)throw Error('Falha simulada');
    if(pedido.caminho.startsWith('/v1/project/')){
      const codigo=pedido.caminho.split('/').pop();
      const item=fontes.find(x=>x.code===codigo);
      if(!item)throw Error('Não existe');
      return {status:true,result:item};
    }
    const url=new URL(pedido.caminho,'https://api.qase.io');
    assert.equal(url.pathname,'/v1/project');
    const offset=Number(url.searchParams.get('offset')||0);
    const limit=Number(url.searchParams.get('limit')||10);
    return {status:true,result:{total:fontes.length,filtered:fontes.length,
      entities:fontes.slice(offset,offset+limit)}};
  };
  const protetor={disponivel:()=>true,proteger:x=>Buffer.from(x,'utf8'),abrir:b=>b.toString('utf8')};
  const nucleo=nucleoServicos(protetor,transporte,base,async()=>{throw Error('Escrita remota não deve ocorrer');});
  return {base,consultas, fontes,nucleo,indisponivel:()=>{indisponivel=true;}};
}
test('Qase importa dois projetos e preserva um projeto manual sem vinculá-lo automaticamente',async t=>{
  const a=montar(t);
  const manual=await criarEspaco({nome:'Meu projeto local'},a.base);
  const previa=await a.nucleo.qasePrever('token-ficticio');
  assert.deepEqual(previa.projetos.map(p=>p.codigo),['Q001','Q002','Q003']);
  assert.equal(listarContas(a.base).length,0,'prévia não salva credencial');
  const r=await a.nucleo.qaseImportar(previa.previaId,['Q001','Q003']);
  assert.deepEqual(r.adicionados,['Q001','Q003']);
  assert.deepEqual(r.falhas,[]);
  const espacos=lerEspacos(a.base).espacos;
  assert.equal(espacos.length,3);
  assert.deepEqual(espacos.find(e=>e.id===manual.id).vinculos,[]);
  assert.deepEqual(espacos.filter(e=>e.vinculos.some(v=>v.servico==='qase'))
    .map(e=>e.vinculos[0].recurso.chave),['Q001','Q003']);
  assert.ok(espacos.every(e=>e.id!==undefined));
  assert.equal(listarContas(a.base).length,1);
});
test('Qase paginado >100: importa projeto da segunda página e não cria duplicatas na reconexão',async t=>{
  const a=montar(t,145);
  const previa=await a.nucleo.qasePrever('token-ficticio');
  assert.equal(previa.projetos.length,145);
  assert.ok(a.consultas.some(x=>x.includes('offset=100')));
  const r=await a.nucleo.qaseImportar(previa.previaId,['Q125']);
  assert.deepEqual(r.adicionados,['Q125']);
  const p2=await a.nucleo.qasePreverConta(r.contaId);
  assert.equal(p2.projetos.find(p=>p.codigo==='Q125').jaImportado,true);
  const r2=await a.nucleo.qaseImportar(p2.previaId,['Q125']);
  assert.deepEqual(r2.existentes,['Q125']);
  assert.equal(lerEspacos(a.base).espacos.length,1);
  assert.equal(listarContas(a.base).length,1);
});
test('Qase cancelar descarta prévia e impede importar qualquer projeto',async t=>{
  const a=montar(t);
  const previa=await a.nucleo.qasePrever('token-ficticio');
  a.nucleo.qaseCancelar(previa.previaId);
  await assert.rejects(a.nucleo.qaseImportar(previa.previaId,['Q001']),/QASE_PREVIEW_EXPIRED/);
  assert.equal(lerEspacos(a.base).espacos.length,0);
  assert.equal(listarContas(a.base).length,0);
});
test('Qase rejeita código fora da prévia, duplicado ou mudado antes do envio',async t=>{
  const a=montar(t);
  const previa=await a.nucleo.qasePrever('token-ficticio');
  await assert.rejects(a.nucleo.qaseImportar(previa.previaId,['Q999']),/INVALID_ARGUMENTS/);
  await assert.rejects(a.nucleo.qaseImportar(previa.previaId,['Q001','Q001']),/INVALID_ARGUMENTS/);
  a.fontes[0].code='Q901';
  await assert.rejects(a.nucleo.qaseImportar(previa.previaId,['Q001']),/SERVICE_SCOPE_CHANGED/);
  assert.equal(listarContas(a.base).length,0);
});
test('Qase indisponível não é interpretado como conta sem projetos e não grava credenciais',async t=>{
  const a=montar(t);a.indisponivel();
  await assert.rejects(a.nucleo.qasePrever('token-ficticio'),/SERVICE_UNAVAILABLE/);
  assert.equal(listarContas(a.base).length,0);
  assert.equal(lerEspacos(a.base).espacos.length,0);
});
test('Qase sem projetos devolve uma lista vazia verificada, sem persistir a conta',async t=>{
  const a=montar(t,0);const previa=await a.nucleo.qasePrever('token-ficticio');
  assert.deepEqual(previa.projetos,[]);assert.equal(listarContas(a.base).length,0);
});

test('Qase não duplica automaticamente código existente em outra conexão após troca de token',async t=>{
  const a=montar(t);
  const p1=await a.nucleo.qasePrever('token-primeira-conta');
  const r1=await a.nucleo.qaseImportar(p1.previaId,['Q001']);
  assert.deepEqual(r1.adicionados,['Q001']);
  const p2=await a.nucleo.qasePrever('token-outro-acesso');
  assert.equal(p2.projetos.find(x=>x.codigo==='Q001').conflitoOutraConta,true);
  const r2=await a.nucleo.qaseImportar(p2.previaId,['Q001']);
  assert.deepEqual(r2.adicionados,[]);
  assert.equal(r2.falhas[0]?.erro,'QASE_PROJECT_AMBIGUOUS');
  assert.equal(lerEspacos(a.base).espacos.length,1);
});
