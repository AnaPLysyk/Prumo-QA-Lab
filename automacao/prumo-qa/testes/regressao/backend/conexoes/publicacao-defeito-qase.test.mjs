/** Publicação Qase defect: serviço sintético sem rede, permissões de escrita reais verificadas em testes do catálogo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarDefeitoNoQase } from '../../../../dist/testes/integracoes/criarDefeitoNoQase.js';
import { rotaEscritaPermitida } from '../../../../dist/conexoes/escrita/rotaEscritaPermitida.js';
import { idsDeOperacao } from '../../../../dist/conexoes/tipos/operacoesExternas.js';
import { marcadorDaOperacao } from '../../../../dist/conexoes/escrita/marcadorDaOperacao.js';

const chave='12'.repeat(32), rec={chave:'PQ'};
const dados={titulo:'Acesso falha ao salvar',resultadoAtual:'O painel deixa de carregar após o login',severidade:3};
function mundo(){
  const defeitos=[], chamadas=[];
  const ctx={
    ler: async url=>{
      chamadas.push(['GET',url]);
      if(url.startsWith('/v1/defect/PQ?'))return{status:true,result:{entities:defeitos,total:defeitos.length,filtered:defeitos.length}};
      const id=Number(url.split('/').at(-1));
      const d=defeitos.find(x=>x.id===id);
      if(!d)throw Error('NOT_FOUND');
      return{status:true,result:d};
    },
    enviar:async(metodo,url,body)=>{
      assert.equal(metodo,'POST');
      assert.equal(url,'/v1/defect/PQ');
      assert.ok(rotaEscritaPermitida('qase',metodo,url));
      const dados=JSON.parse(body);const id=defeitos.length+1;
      defeitos.push({id,...dados});chamadas.push(['POST',url]);
      return{status:true,result:{id}};
    }
  };return{ctx,defeitos,chamadas};
}
test('Qase: a rota de escrita de defeitos está na lista fechada e exige operação conhecida',()=>{
  assert.equal(idsDeOperacao.includes('qase.criar_defeito'),true);
  assert.equal(rotaEscritaPermitida('qase','POST','/v1/defect/PQ'),true);
  assert.equal(rotaEscritaPermitida('qase','DELETE','/v1/defect/PQ/1'),false);
  assert.equal(rotaEscritaPermitida('jira','POST','/v1/defect/PQ'),false);
  assert.equal(criarDefeitoNoQase.schema.safeParse({...dados,severidade:21}).success,false);
});
test('Qase: cria defeito apenas no projeto vinculado e confirma todos os campos por releitura',async()=>{
  const m=mundo();const v=await criarDefeitoNoQase.executar(m.ctx,rec,dados,chave,{arquivosAutorizados:[],raizesDeEvidencia:[]});
  assert.equal(v.id,'1');
  assert.equal(m.defeitos[0].actual_result.includes('['+marcadorDaOperacao(chave)+']'),true);
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,dados,v,chave),true);
  assert.equal(m.chamadas.filter(x=>x[0]==='POST').length,1);
  await assert.rejects(criarDefeitoNoQase.executar(m.ctx,rec,dados,chave,{}),/SERVICE_DUPLICATE/);
  assert.equal(m.chamadas.filter(x=>x[0]==='POST').length,1);
});
test('Qase: após resposta perdida, encontra o mesmo defeito por marcador sem criar outro',async()=>{
  const m=mundo();const v=await criarDefeitoNoQase.executar(m.ctx,rec,dados,chave,{});
  const recuperado=await criarDefeitoNoQase.reconciliar(m.ctx,rec,dados,chave);
  assert.deepEqual(recuperado,v);
  assert.equal(m.chamadas.filter(x=>x[0]==='POST').length,1);
});
test('Qase: retorno remoto divergente não é confirmado nem reconciliado',async()=>{
  const m=mundo();const v=await criarDefeitoNoQase.executar(m.ctx,rec,dados,chave,{});
  m.defeitos[0].title='Outro defeito';
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,dados,v,chave),false);
  await assert.rejects(criarDefeitoNoQase.reconciliar(m.ctx,rec,dados,chave,v),/SERVICE_RESPONSE_INVALID/);
  assert.equal(m.chamadas.filter(x=>x[0]==='POST').length,1);
});

test('Qase: lista remota incompleta impede POST duplicado por segurança',async()=>{
  let posts=0;
  const ctx={
    ler:async()=>({status:true,result:{entities:[{id:50,title:dados.titulo}],total:1,filtered:1}}),
    enviar:async()=>{posts++;throw Error('NUNCA_DEVE_ESCREVER');}
  };
  await assert.rejects(criarDefeitoNoQase.executar(ctx,rec,dados,chave,{}),/SERVICE_RESPONSE_INVALID/);
  await assert.rejects(criarDefeitoNoQase.reconciliar(ctx,rec,dados,chave),/SERVICE_RESPONSE_INVALID/);
  assert.equal(posts,0);
});

// O GET de defeito devolve a severidade como texto (ex.: "major"), embora o POST receba o ID numérico.
function mundoComTexto(campos){
  const m=mundo(); const lerOriginal=m.ctx.ler;
  m.ctx.limpar=x=>x;
  m.ctx.ler=async url=>{
    if(url==='/v1/system_field'){m.chamadas.push(['GET',url]);if(!campos)throw Error('NOT_FOUND');return{status:true,result:campos};}
    const r=await lerOriginal(url);
    const texto=d=>({...d,severity:{3:'major',2:'critical'}[d.severity]??String(d.severity)});
    return r.result.entities?{...r,result:{...r.result,entities:r.result.entities.map(texto)}}:{...r,result:texto(r.result)};
  };
  return m;
}
const severidades=[{slug:'severity',title:'Severity',options:[{id:0,slug:'undefined',title:'Not set'},{id:2,slug:'critical',title:'Critical'},{id:3,slug:'major',title:'Major'}]}];
test('Qase: severidade em texto é conferida pelo campo de sistema "severity" do próprio Qase',async()=>{
  const m=mundoComTexto(severidades);const v=await criarDefeitoNoQase.executar(m.ctx,rec,dados,chave,{});
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,dados,v,chave),true);
  assert.ok(m.chamadas.some(x=>x[1]==='/v1/system_field'));
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,{...dados,severidade:2},v,chave),false,'severidade diferente não confirma');
});
test('Qase: sem campo de severidade legível, a identidade fica com título, resultado e marcador',async()=>{
  const m=mundoComTexto([]);const v=await criarDefeitoNoQase.executar(m.ctx,rec,dados,chave,{});
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,dados,v,chave),true);
  m.defeitos[0].title='Outro';
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,dados,v,chave),false);
});

test('Qase: milestone e campos personalizados vão no POST e são conferidos na releitura',async()=>{
  const m=mundo();const p={...dados,marcoId:7,campos:{'12':'Checkout'}};
  m.ctx.enviar=async(metodo,url,body)=>{const b=JSON.parse(body);assert.equal(b.milestone_id,7);assert.deepEqual(b.custom_field,{'12':'Checkout'});
    const id=m.defeitos.length+1;m.defeitos.push({id,title:b.title,actual_result:b.actual_result,severity:b.severity,milestone_id:b.milestone_id,custom_fields:[{id:12,value:'Checkout'}]});m.chamadas.push(['POST',url]);return{status:true,result:{id}};};
  const v=await criarDefeitoNoQase.executar(m.ctx,rec,p,chave,{});
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,p,v,chave),true);
  m.defeitos[0].custom_fields=[];
  assert.equal(await criarDefeitoNoQase.confirmar(m.ctx,rec,p,v,chave),false,'campo que não voltou não confirma');
  assert.equal(criarDefeitoNoQase.schema.safeParse({...dados,campos:{abc:'x'}}).success,false,'chave de campo é o ID numérico');
});
