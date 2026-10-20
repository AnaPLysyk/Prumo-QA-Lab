import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import { cofreCredenciais } from '../../../../dist/conexoes/banco/cofreCredenciais.js';
import { AdaptadorServico } from '../../../../dist/conexoes/integracoes/AdaptadorServico.js';
import { enderecoPublico } from '../../../../dist/conexoes/integracoes/enderecoPublico.js';
import { ErroServico } from '../../../../dist/conexoes/integracoes/ErroServico.js';
import { instanciaServico } from '../../../../dist/conexoes/integracoes/instanciaServico.js';
import { lerDoServico as transporteHttps } from '../../../../dist/conexoes/integracoes/lerDoServico.js';
import { nucleoServicos } from '../../../../dist/conexoes/regras/nucleoServicos.js';
import { listarEspacos } from '../../../../dist/projetos/banco/listarEspacos.js';
import { obterEspaco } from '../../../../dist/projetos/banco/obterEspaco.js';
import { associarEspaco } from '../../../../dist/projetos/regras/associarEspaco.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import { removerVinculoServico } from '../../../../dist/projetos/regras/removerVinculoServico.js';
import {respostaFixture,servidorFixture,instalarTransporteControlado} from '../../../apoio/servicos-fixtures.mjs';
const base=t=>{const b=fs.mkdtempSync(path.join(os.tmpdir(),'prumo-servicos-fixture-'));t.after(()=>fs.rmSync(b,{recursive:true,force:true}));return b;};
// Double opaco para teste de contrato. Não é criptografia nem substitui safeStorage em produção.
const protetor=()=>{const mapa=new Map();return {disponivel:()=>true,proteger:s=>{const id=randomUUID();mapa.set(id,s);return Buffer.from(id);},abrir:b=>{if(!mapa.has(b.toString()))throw new Error('fixture');return mapa.get(b.toString());}};};
const transporte=async p=>{const r=respostaFixture(new URL(p.instancia).hostname,p.caminho);if(r===undefined)throw new ErroServico('SERVICE_NOT_FOUND');return r;};
async function montar(t){const b=base(t),n=nucleoServicos(protetor(),transporte,b);const [a,c]=await Promise.all([criarEspaco({nome:'SMART-LAB'},b),criarEspaco({nome:'CID-LAB'},b)]);return {b,n,a,c};}
test('projetos manuais concorrentes persistem com IDs e contextos separados, sem pasta',async t=>{const {a,c,b}=await montar(t);assert.notEqual(a.id,c.id);assert.equal(listarEspacos(b).length,2);assert.notEqual(a.raizContextos,c.raizContextos);assert.equal(a.pastaLocal,undefined);const m=JSON.parse(fs.readFileSync(path.join(a.raizContextos,'qa.project.json')));assert.equal(m.schemaVersion,2);assert.equal(m.execution.readOnly,true);assert.deepEqual(m.commands,{});});
test('cofre recusa proteção ausente e não escreve token claro; exclusão retira credencial',t=>{const b=base(t),id=randomUUID();const indisponivel=cofreCredenciais({...protetor(),disponivel:()=>false},b);assert.throws(()=>indisponivel.salvar(id,'fixture-segredo'),/PROTECTION_UNAVAILABLE/);assert.equal(fs.existsSync(path.join(b,'plataforma','credenciais.json')),false);const cofre=cofreCredenciais(protetor(),b);cofre.salvar(id,'fixture-segredo');assert.equal(cofre.ler(id),'fixture-segredo');assert.doesNotMatch(fs.readFileSync(path.join(b,'plataforma','credenciais.json'),'utf8'),/fixture-segredo/);cofre.remover(id);assert.throws(()=>cofre.ler(id),/CREDENTIAL_UNAVAILABLE/);});
test('IDs independentes, seleção paginada, leitura e relações nunca atravessam SMART/CID',async t=>{
  const {b,n,a,c}=await montar(t);
  for(const servico of ['jira','qase','github']){
    const conta=await n.adicionar({servico,nome:'Fixture '+servico,token:'fixture-segredo-'+servico,...(servico==='jira'?{instancia:'https://lab.atlassian.net',usuario:'fixture@example.test'}:{})});
    const p1=await n.listar(conta.id,{limite:1}),p2=await n.listar(conta.id,{limite:1,offset:1});assert.equal(p1.recursos.length,1);assert.equal(p2.recursos.length,1);
    await n.vincular(a.id,conta.id,p1.recursos[0]);await n.vincular(c.id,conta.id,p2.recursos[0]);
    await assert.rejects(n.vincular(a.id,conta.id,p1.recursos[0]),/WORKSPACE_LINK_EXISTS/);
    const op=servico==='jira'?'tickets':servico==='qase'?'casos':'prs';const ra=await n.consultar(a.id,servico,op),rc=await n.consultar(c.id,servico,op);assert.notEqual(ra.recursoId,rc.recursoId);assert.equal(ra.cache,false);assert.equal(ra.metodo,'GET');assert.doesNotMatch(JSON.stringify(n.contas()),/fixture-segredo/);
  }
  await assert.rejects(n.consultar(a.id,'jira','ticket',{},'CID-1'),/SERVICE_SCOPE_CHANGED/);
  await assert.rejects(n.consultar(a.id,'qase','caso',{},'41'),/SERVICE_NOT_FOUND/);
  const ea=obterEspaco(a.id,b),ec=obterEspaco(c.id,b);assert.throws(()=>associarEspaco(a.id,{de:{tipo:'jira',id:'SMART-1',vinculoId:ec.vinculos[0].id,origem:'fixture'},para:{tipo:'qase',id:'31',vinculoId:ea.vinculos[1].id,origem:'fixture'},justificativa:'Fixture'},b),/TRACE_LINK_SCOPE/);
  const dados={de:{tipo:'jira',id:'SMART-1',vinculoId:ea.vinculos[0].id,origem:'fixture'},para:{tipo:'qase',id:'31',vinculoId:ea.vinculos[1].id,origem:'fixture'},justificativa:'Associação declarada, não cobertura'};associarEspaco(a.id,dados,b);assert.equal(obterEspaco(c.id,b).relacoes.length,0);removerVinculoServico(a.id,'jira',b);assert.equal(obterEspaco(a.id,b).relacoes.length,1);
});
test('Qase não inventa ID de conta; retirada da conexão invalida apenas os vínculos dela',async t=>{const {n,b,a,c}=await montar(t);const conta=await n.adicionar({servico:'qase',nome:'Fixture',token:'fixture-token'});assert.match(conta.contaId,/^conexao-local:/);const recursos=(await n.listar(conta.id)).recursos;await n.vincular(a.id,conta.id,recursos[0]);await n.vincular(c.id,conta.id,recursos[1]);n.removerConta(conta.id);assert.equal(obterEspaco(a.id,b).vinculos[0].estado,'SEM_CREDENCIAL');await assert.rejects(n.consultar(c.id,'qase','casos'),/CREDENTIAL_UNAVAILABLE/);assert.equal(n.contas()[0].ativa,false);});
test('todos os endpoints de leitura do fixture são consultáveis; escrita e IDs injetados recusados',async()=>{
  for(const servico of ['jira','qase','github']){
    const c={id:randomUUID(),servico,instancia:instanciaServico(servico,'https://lab.atlassian.net'),contaId:'fixture',usuario:'fixture@example.test',token:'fixture-token'},a=new AdaptadorServico(c,transporte),r=(await a.listar()).recursos[0];
    const ops=servico==='jira'?['tickets','campos','ticket','comentarios']:servico==='qase'?['suites','casos','caso','planos','runs','run','resultados']:['repositorio','branches','commits','prs','pr','verificacoes'];
    for(const op of ops){const id=op==='ticket'||op==='comentarios'?'SMART-1':op==='caso'?'31':op==='run'||op==='resultados'?'71':op==='pr'?'1':op==='verificacoes'?'a'.repeat(40):undefined;const dados=await a.consultar(r,op,{},id);assert.equal(dados.metodo,'GET');assert.equal(dados.origem,c.instancia);}
    await assert.rejects(a.consultar(r,'apagar'),/SERVICE_WRITE_BLOCKED/);
    await assert.rejects(a.consultar({...r,contaId:'outra'},ops[0]),/SERVICE_SCOPE_CHANGED/);
    if(servico==='jira')await assert.rejects(a.consultar({...r,id:'11 OR project = 22'},'tickets'),/SERVICE_RESPONSE_INVALID/);
  }
});
test('defeitos Qase: lista/detalhe GET, filtro validado, isolamento e projeção sem campos desconhecidos',async()=>{
  const c={id:randomUUID(),servico:'qase',instancia:'https://api.qase.io',contaId:'fixture',token:'fixture-token'};
  const pedidos=[];const a=new AdaptadorServico(c,async p=>{pedidos.push(p);return transporte(p);});const r=(await a.listar()).recursos[0];
  const lista=await a.consultar(r,'defeitos',{limite:1},undefined,undefined,{status:'open'});assert.equal(lista.dados[0].id,91);assert.equal(lista.endpoint,'/v1/defect/SFQ');assert.equal(lista.cache,false);assert.match(pedidos.at(-1).caminho,/status=open/);
  const detalhe=await a.consultar(r,'defeito',{},'91');assert.equal(detalhe.dados.actual_result,'Falha observada apenas na fixture');assert.deepEqual(detalhe.dados.runs,[71]);
  await assert.rejects(a.consultar(r,'defeito',{},'92'),/SERVICE_NOT_FOUND/);await assert.rejects(a.consultar(r,'defeito',{},'../91'),/SERVICE_RESPONSE_INVALID/);await assert.rejects(a.consultar({...r,instancia:'https://outra.test'},'defeitos'),/SERVICE_SCOPE_CHANGED/);await assert.rejects(a.consultar(r,'defeitos',{},undefined,undefined,{status:'qualquer'}),/SERVICE_RESPONSE_INVALID/);
  const ruim=new AdaptadorServico(c,async()=>({status:true,result:{id:92,title:'Escopo errado'}}));await assert.rejects(ruim.consultar(r,'defeito',{},'91'),/SERVICE_SCOPE_CHANGED/);
  const seguro=new AdaptadorServico(c,async()=>({status:true,result:{id:91,title:c.token,actual_result:'Texto '+c.token,unknown:'não exportar',secret:c.token}}));const x=await seguro.consultar(r,'defeito',{},'91');assert.doesNotMatch(JSON.stringify(x),/fixture-token|unknown|secret/);
});
test('transporte real contra servidor controlado: códigos HTTP, JSON inválido, limite, redirect e timeout',async t=>{
  const s=await servidorFixture(t),restaurar=await instalarTransporteControlado(s.port);t.after(restaurar);const p={servico:'github',instancia:'https://api.github.com',caminho:'/user',headers:{Authorization:'Bearer fixture-token'}};
  assert.equal((await transporteHttps(p)).id,900);
  for(const [status,codigo] of [[401,'CREDENTIAL_INVALID_OR_EXPIRED'],[403,'SERVICE_PERMISSION'],[404,'SERVICE_NOT_FOUND'],[429,'SERVICE_RATE_LIMIT'],[503,'SERVICE_UNAVAILABLE'],[302,'SERVICE_REDIRECT_BLOCKED']]){s.controle.status=status;await assert.rejects(transporteHttps(p),new RegExp(codigo));}
  s.controle.status=200;s.controle.corpo='{quebrado';await assert.rejects(transporteHttps(p),/SERVICE_RESPONSE_INVALID/);s.controle.corpo='x'.repeat(2*1024*1024+1);await assert.rejects(transporteHttps(p),/SERVICE_RESPONSE_LIMIT/);s.controle.corpo=null;s.controle.espera=100;await assert.rejects(transporteHttps({...p,timeoutMs:15}),/SERVICE_TIMEOUT/);assert.ok(s.pedidos.every(p=>p.metodo==='GET'));assert.equal(s.pedidos.some(p=>p.caminho==='/nao-seguir'),false);
});
test('destinos SSRF e IPs especiais recusados; domínio não pode receber token por redirect',async()=>{for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.1','172.16.0.1','100.64.0.1','198.18.0.1','203.0.113.1','224.0.0.1','::1'])assert.equal(enderecoPublico(ip),false,ip);assert.equal(enderecoPublico('93.184.216.34'),true);for(const u of ['http://lab.atlassian.net','https://user:secret@lab.atlassian.net','https://lab.atlassian.net.evil.test','https://lab.atlassian.net/path','https://127.0.0.1'])assert.throws(()=>instanciaServico('jira',u),/DESTINATION_BLOCKED/);await assert.rejects(transporteHttps({servico:'github',instancia:'https://evil.test',caminho:'/user',headers:{}}),/DESTINATION_BLOCKED/);});
test('resposta maliciosa não injeta projeto no JQL nem revela credencial nos dados',async()=>{
  const c={id:randomUUID(),servico:'jira',instancia:'https://lab.atlassian.net',contaId:'fixture',usuario:'fixture@example.test',token:'credencial-ficticia-unica'};
  const bad=new AdaptadorServico(c,async()=>({values:[{id:'11 OR project = 22',key:'SMART',name:'Fixture'}],total:1}));await assert.rejects(bad.listar(),/SERVICE_RESPONSE_INVALID/);
  const a=new AdaptadorServico(c,async p=>p.caminho.includes('/search/jql')?{issues:[{id:'1101',key:'SMART-1',fields:{project:{id:'11'},summary:c.token,description:'Texto '+c.token,password:c.token}}],isLast:true}:respostaFixture(new URL(p.instancia).hostname,p.caminho));const r=(await a.listar()).recursos[0];const dados=await a.consultar(r,'tickets');assert.doesNotMatch(JSON.stringify(dados),/credencial-ficticia-unica|password/);
  const misturado=new AdaptadorServico(c,async()=>({issues:[{fields:{project:{id:'22'}}}],isLast:true}));await assert.rejects(misturado.consultar(r,'tickets'),/SERVICE_SCOPE_CHANGED/);
});
test('campo de aceite: mais de cem customfields são disponíveis e IDs desconhecidos não são configurados',async t=>{
  const b=base(t);const campos=Array.from({length:150},(_,i)=>({id:'customfield_'+(10000+i),name:'Campo fictício '+i,custom:true}));const trans=async p=>p.caminho==='/rest/api/3/field'?campos:transporte(p);const n=nucleoServicos(protetor(),trans,b),e=await criarEspaco({nome:'Campos-LAB'},b),c=await n.adicionar({servico:'jira',nome:'Fixture',instancia:'https://lab.atlassian.net',usuario:'fixture@example.test',token:'token-fixture'});await n.vincular(e.id,c.id,(await n.listar(c.id)).recursos[0]);await n.campoAceite(e.id,'customfield_10149');assert.equal(obterEspaco(e.id,b).vinculos[0].campoAceite,'customfield_10149');await assert.rejects(n.campoAceite(e.id,'customfield_99999'),/JIRA_FIELD_NOT_AVAILABLE/);
});
