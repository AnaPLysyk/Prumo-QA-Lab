import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarChamado } from '../../../../dist/suporte/integracoes/consultarChamado.js';
import { prepararRelato as prepararSolicitacao } from '../../../../dist/suporte/regras/prepararRelato.js';

const issue={number:12,title:'Histórico não atualiza',state:'open',created_at:'2026-10-10T10:00:00Z',updated_at:'2026-10-10T12:00:00Z',user:{login:'autor-sintetico'},assignees:[{login:'responsavel-sintetico'}],labels:[{name:'status: em análise'}]};
const eventos=[{event:'labeled',created_at:'2026-10-10T11:00:00Z',actor:{login:'responsavel-sintetico'},label:{name:'status: em análise'}}];
test('chamado usa dados reais da resposta, histórico e destino fixo, sem enviar contexto ou credencial',async()=>{
  const chamadas=[];const r=await consultarChamado(12,async(url,opts)=>{chamadas.push({url,opts});return new Response(JSON.stringify(url.includes('/events')?eventos:issue));});
  assert.equal(r.ok,true);assert.equal(r.status.nome,'Em análise');assert.equal(r.history[0].at,eventos[0].created_at);assert.equal(r.historyComplete,true);assert.deepEqual(r.responsible,['responsavel-sintetico']);
  assert.equal(chamadas.length,2);for(const c of chamadas){assert.match(c.url,/^https:\/\/api.github.com\/repos\/AnaPLysyk\/Prumo-Qa\/issues\/12/);assert.equal(c.opts.redirect,'error');assert.equal(c.opts.credentials,'omit');assert.equal(c.opts.body,undefined);assert.equal(c.opts.headers.Authorization,undefined);}
});
test('não fabrica status sem rótulo, com rótulos conflitantes, issue fechada ou falha de rede',async()=>{
  for(const labels of [[],[{name:'status: recebido'},{name:'status: concluído'}]]){
    const r=await consultarChamado(12,async u=>new Response(JSON.stringify(u.includes('/events')?[]:{...issue,state:'closed',labels})));
    assert.equal(r.ok,true);assert.equal(r.status,null);assert.equal(r.githubState,'closed');
  }
  const r=await consultarChamado(12,async()=>new Response('',{status:404}));assert.equal(r.ok,false);assert.equal(r.code,'CHAMADO_NAO_ENCONTRADO');
  assert.equal((await consultarChamado(12,async()=>{throw new Error('secret-sintetico');})).code,'SUPPORT_UNAVAILABLE');
  assert.equal((await consultarChamado(12,async()=>new Response(JSON.stringify({...issue,number:13})))).ok,false);
});
test('relato tem frontmatter e identificador explicitamente local, sem inventar chamado nem incluir versão desmarcada',()=>{
  const bug={categoria:'bug',titulo:'Histórico falhou',descricao:'Histórico não mostra a operação nova.',passos:'1. Consultar histórico',consentimento:true,incluirVersao:false};
  const r=prepararSolicitacao(bug,{versao:'2.6.0'});assert.match(r.idLocal,/^LOCAL-[a-f0-9]{16}$/);assert.match(r.markdown,/^---\nid: LOCAL-/);assert.match(r.markdown,/status: rascunho_local/);assert.doesNotMatch(r.markdown,/2\.6\.0|PRUMO-012/);assert.equal(prepararSolicitacao(bug,{versao:'2.6.0'}).idLocal,r.idLocal);
});
