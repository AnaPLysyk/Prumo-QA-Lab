import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {abrir,novoDados,ir,mcp,exe,dadosDaConta} from '../../../apoio/janela.mjs';
import {servidorFixture} from '../../../apoio/servicos-fixtures.mjs';
const confirmar=app=>app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}); // decisões simuladas do runner; não aprova execução protegida
const instrumentar=(app,port)=>app.evaluate((_,p)=>{
  const https=process.getBuiltinModule('node:https'),http=process.getBuiltinModule('node:http'),dns=process.getBuiltinModule('node:dns');
  dns.promises.lookup=async()=>({address:'93.184.216.34',family:4});
  https.request=(url,opcoes,callback)=>http.request({hostname:'127.0.0.1',port:p,path:url.pathname+url.search,method:opcoes.method,headers:{...opcoes.headers,'x-fixture-host':url.hostname}},callback);
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
},port);
test('demonstração: vinte verificações na janela real, dois projetos e APIs controladas, sem IA',async t=>{
  const dados=novoDados(t),s=await servidorFixture(t),evidencias=[];
  let a=await abrir(t,dados);await instrumentar(a.app,s.port);await confirmar(a.app);
  const passo=(numero,descricao)=>evidencias.push({numero,descricao,estado:'PASS',tipo:'FIXTURE_CONTROLADA'});
  async function criar(nome){await ir(a.page,'projetos');await a.page.click('#espaco-novo');await a.page.fill('#espaco-nome',nome);await a.page.fill('#espaco-descricao','Projeto sintético de laboratório');await a.page.click('#espaco-salvar');await a.page.waitForFunction(n=>document.querySelector('#projeto-atual').textContent===n,nome);}
  await criar('SMART-LAB');await criar('CID-LAB');const espacos=(await a.page.evaluate(()=>window.prumo.espacos())).data;assert.equal(espacos.length,2);assert.ok(espacos.every(e=>!e.pastaLocal));passo(1,'Cadastro manual de SMART-LAB e CID-LAB sem pasta local');
  const smart=espacos.find(e=>e.nome==='SMART-LAB'),cid=espacos.find(e=>e.nome==='CID-LAB');
  const selecionar=async e=>{await ir(a.page,'projetos');await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button',{name:'Selecionar projeto',exact:true}).click();await a.page.waitForFunction(n=>document.querySelector('#projeto-atual').textContent===n,e.nome);};
  await selecionar(smart);
  for(const servico of ['jira','qase','github']){
    await ir(a.page,'conexoes');
    if(servico==='qase'){
      // A nova UX do Qase oferece importação de projetos, não o formulário genérico. Este cenário testa
      // a vinculação dos dois projetos manuais existentes, sem importar/criar um terceiro projeto.
      const criado=await a.page.evaluate(token=>window.prumo.servicoAdicionar({servico:'qase',nome:'Simulação qase',token}),'fixture-secret-27-qase');
      assert.ok(criado.ok,criado.error);await ir(a.page,'projetos');await ir(a.page,'conexoes');
    }else{
      await a.page.click('#conexao-nova');await a.page.selectOption('#conexao-servico',servico);
      await a.page.fill('#conexao-nome','Simulação '+servico);await a.page.fill('#conexao-token','fixture-secret-27-'+servico);
      if(servico==='jira'){await a.page.fill('#conexao-instancia','https://lab.atlassian.net');await a.page.fill('#conexao-usuario','fixture@example.test');}
      await a.page.click('#conexao-salvar');
    }
    await a.page.waitForFunction(s=>[...document.querySelectorAll('#conteudo [data-conta] .cx-conta-nome')].some(x=>x.textContent==='Simulação '+s),servico);
    const conta=(await a.page.evaluate(()=>window.prumo.servicos())).data.find(c=>c.servico===servico);assert.ok(conta);assert.doesNotMatch(await a.page.textContent('body'),/fixture-secret-27/);
    await a.page.locator('[data-integracao="'+servico+'"] [data-conta]').last().getByRole('button',{name:'Listar recursos disponíveis',exact:true}).click();
    await a.page.waitForSelector('#recursos-remotos .cx-recurso');assert.doesNotMatch(await a.page.textContent('#recursos-remotos'),/Selecione primeiro/,JSON.stringify(await a.page.evaluate(()=>({root:estado.root,espaco:estado.espaco}))));
    const recursos=(await a.page.evaluate(id=>window.prumo.servicoRecursos(id),conta.id)).data.recursos;assert.equal(recursos.length,2);
    await a.page.getByRole('button',{name:'Vincular '+recursos[0].chave,exact:true}).click();await a.page.waitForFunction(()=>document.querySelector('#aviso')?.textContent.includes('Vínculo confirmado'));
    const rb=await a.page.evaluate(async([e,c,r])=>window.prumo.servicoVincular(e,c,r),[cid.id,conta.id,recursos[1]]);assert.ok(rb.ok);
  }
  passo(2,'Credenciais fictícias nos três adaptadores, safeStorage real do Electron');passo(3,'Seleção por recursos reais do servidor controlado e confirmação nativa simulada');
  const vinculados=(await a.page.evaluate(()=>window.prumo.espacos())).data;assert.ok(vinculados.every(e=>e.vinculos.length===3));assert.notEqual(vinculados[0].vinculos[1].recurso.id,vinculados[0].vinculos[0].recurso.id);passo(4,'Vínculos persistidos com IDs distintos');
  const consultar=async(aba,op,falha=false)=>{await ir(a.page,aba);if(aba==='testes'){await a.page.click('[data-sub=repositorio]');await a.page.click('#testes-avancada');}if(aba==='tickets')await a.page.click('#tk-avancada');if(op)await a.page.selectOption('#operacao-remota',op);await a.page.click('#consultar-remoto');await a.page.waitForFunction(f=>document.querySelector('#fonte-remota')?.textContent.startsWith(f?'Consulta falhou':'Consulta atual'),falha);};
  await consultar('tickets');assert.match(await a.page.textContent('#lista-remota'),/SMART-1/);assert.doesNotMatch(await a.page.textContent('#lista-remota'),/CID-1/);passo(5,'Tickets SMART lidos com origem');
  await consultar('testes','casos');assert.match(await a.page.textContent('#lista-remota'),/SFQ[\s\S]*MANUAL/);passo(6,'Casos SFQ, passos e associação externa sem cobertura inventada');
  await consultar('automacoes');assert.match(await a.page.textContent('#lista-remota'),/automacao-smart/);passo(7,'Repositório empresa/automacao-smart visualizado sem clone');
  await selecionar(cid);assert.equal(await a.page.textContent('#projeto-atual'),'CID-LAB');passo(8,'Troca de projeto');await consultar('tickets');assert.match(await a.page.textContent('#lista-remota'),/CID-1/);assert.doesNotMatch(await a.page.textContent('#lista-remota'),/SMART-1/);await consultar('testes','casos');assert.match(await a.page.textContent('#lista-remota'),/Vínculo ainda não definido/);passo(9,'Tickets e casos isolados, lacuna de associação explícita');
  await ir(a.page,'projetos');assert.match(await a.page.locator(`[data-espaco="${cid.id}"]`).textContent(),/CQA[\s\S]*empresa\/automacao-cid/);passo(10,'Vínculos existentes identificados por projeto');
  await a.page.locator(`[data-espaco="${cid.id}"]`).getByRole('button',{name:'Remover vínculo github',exact:true}).click();await a.page.waitForFunction(id=>!document.querySelector(`[data-espaco="${id}"]`).textContent.includes('empresa/automacao-cid'),cid.id);passo(11,'Remoção controlada do vínculo GitHub de CID');
  assert.deepEqual(a.erros,[]);await a.fechar();a=await abrir(t,dados);await instrumentar(a.app,s.port);await confirmar(a.app);await a.page.waitForFunction(()=>document.querySelector('#projeto-atual').textContent==='CID-LAB');const persistidos=(await a.page.evaluate(()=>window.prumo.espacos())).data;assert.equal(persistidos.find(e=>e.id===cid.id).vinculos.length,2);assert.equal(persistidos.find(e=>e.id===smart.id).vinculos.length,3);passo(12,'Reinício preserva vínculos e remoção');
  await selecionar(smart);await ir(a.page,'contextos');await a.page.click('#ctx-novo');await a.page.fill('#ctx-titulo','Requisito manual sintético');await a.page.fill('#ctx-texto','Apenas Editor grava no laboratório.');await a.page.fill('#ctx-origem-ref','laboratorio/requisito-ficticio');await a.page.click('#ctx-salvar');await a.page.waitForSelector('#ctx-tabela');assert.match(await a.page.textContent('#ctx-tabela'),/RASCUNHO/);passo(13,'Contexto manual criado sem IA e sem aprovação automática');
  const mcps=await mcp(smart.raizContextos,dados,[['contexto_projeto',{}],['consultar_evidencias',{}],['revisar_cobertura',{requirement:'Regra fictícia',source:'laboratório',existingTests:[],candidates:[]}],['executar_validacao',{capability:'inexistente'}]]);assert.ok(mcps.every(r=>!r.isError));assert.equal(JSON.parse(mcps[3].content[0].text).executed,false);passo(14,'Quatro ferramentas MCP reais preservadas');
  const escrita=await a.page.evaluate(id=>window.prumo.servicoConsultar(id,'jira','apagar',{}),smart.id);assert.equal(escrita.ok,false);assert.match(escrita.error,/INVALID_ARGUMENTS/);assert.ok(s.pedidos.every(p=>p.metodo==='GET'));passo(15,'Operação de escrita recusada e somente GET observado');
  await ir(a.page,'conexoes');const contaQase=(await a.page.evaluate(()=>window.prumo.servicos())).data.find(c=>c.servico==='qase');const rem=await a.page.evaluate(id=>window.prumo.servicoRemover(id),contaQase.id);assert.ok(rem.ok);await consultar('testes','casos',true);
  await a.page.waitForFunction(()=>document.querySelector('#fonte-remota')?.textContent.startsWith('Consulta falhou'));assert.match(await a.page.textContent('#fonte-remota'),/CREDENTIAL_UNAVAILABLE/);passo(16,'Credencial retirada gera diagnóstico explícito');
  const hist=(await a.page.evaluate(id=>window.prumo.espacoObter(id),smart.id)).data.historico;assert.ok(hist.some(x=>x.acao==='CONSULTA'&&x.codigo==='OK'));assert.ok(hist.some(x=>x.codigo==='CREDENTIAL_UNAVAILABLE'));const logs=fs.readFileSync(path.join(await dadosDaConta(a.page,dados),'plataforma','espacos.json'),'utf8');assert.doesNotMatch(logs,/fixture-secret-27|Requisito fictício/);assert.doesNotMatch(fs.readFileSync(path.join(await dadosDaConta(a.page,dados),'plataforma','credenciais.json'),'utf8'),/fixture-secret-27/);passo(17,'Histórico só de metadados e vault sem token claro');
  const catalogo=await a.page.evaluate(()=>window.prumo.integracoes());assert.ok(catalogo.ok);assert.ok(JSON.stringify(catalogo).includes('servicos:consultar'));assert.ok(fs.readFileSync('docs/SERVICOS.md','utf8').includes('/rest/api/3/search/jql'));passo(18,'Catálogos IPC e REST separados e consultáveis');
  // A janela modal deve ser fechada antes de testar navegação de menu pelo teclado.
  // Focar um elemento atrás de <dialog> modal não equivale a uma navegação possível para a pessoa.
  if (await a.page.locator('#qualidade-dialog[open]').count()) {
    await a.page.keyboard.press('Escape');
    await a.page.waitForSelector('#qualidade-dialog[open]', { state: 'hidden' });
  }
  const itemProjetos = a.page.locator('#nav [data-aba="projetos"]');
  await itemProjetos.focus();
  await a.page.waitForFunction(() =>
    document.activeElement === document.querySelector('#nav [data-aba="projetos"]') &&
    !document.querySelector('#qualidade-dialog')?.open
  ).catch(async (erro) => {
    const d = await a.page.evaluate(() => ({
      aba: estado.aba,
      modalAberto: !!document.querySelector('#qualidade-dialog')?.open,
      foco: document.activeElement?.id || document.activeElement?.tagName || 'nenhum'
    }));
    throw new Error('FOCO_NAVEGACAO_BLOQUEADO: ' + JSON.stringify(d) + '; ' + erro.message);
  });
  await a.page.keyboard.press('Enter');
  await a.page.waitForSelector('#espaco-novo').catch(async (erro) => {
    // Diagnóstico sem segredos: somente aba, foco, modal e presença do botão.
    const diagnostico = await a.page.evaluate(() => ({
      aba: estado.aba,
      elementoFocado: document.activeElement?.id || document.activeElement?.tagName || 'nenhum',
      destinoAtual: document.querySelector('#nav [aria-current="page"]')?.dataset.aba || null,
      dialogAberto: !!document.querySelector('#qualidade-dialog[open]'),
      telas: [...document.querySelectorAll('#conteudo h1')].map((h) => h.textContent).slice(0, 3),
      botaoNovoProjetoPresente: !!document.querySelector('#espaco-novo')
    })).catch(() => ({ erro: 'janela indisponível' }));
    throw new Error('NAVEGACAO_PROJETOS_TECLADO: ' + JSON.stringify(diagnostico) + '; ' + erro.message);
  });await a.page.focus('#espaco-novo');await a.page.keyboard.press('Enter');await a.page.locator('#espaco-nome').waitFor();assert.equal(await a.page.evaluate(()=>document.activeElement.id),'espaco-nome');passo(19,'Navegação e foco por teclado');
  for(const zoom of [2,4]){await a.app.evaluate(({BrowserWindow},z)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1280,900);w.webContents.setZoomFactor(z);},zoom);await a.page.waitForFunction(()=>window.innerWidth<700);assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'reflow '+zoom);await a.page.fill('#espaco-nome','Zoom '+zoom);}
  await a.app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setZoomFactor(1);w.setSize(800,650);});assert.deepEqual(a.erros,[]);passo(20,'Zoom 200/400% e janela menor com ações acessíveis');
  fs.mkdirSync('.prumo/evidencias-2.7',{recursive:true});await a.page.screenshot({path:'.prumo/evidencias-2.7/'+(exe?'instalado':'desenvolvimento')+'.png',fullPage:true});fs.writeFileSync('.prumo/evidencias-2.7/demonstracao-'+(exe?'instalado':'desenvolvimento')+'.json',JSON.stringify({versao:JSON.parse(fs.readFileSync('package.json')).version,app:exe?'INSTALADO':'DESENVOLVIMENTO',autenticacaoServico:'SIMULADA; não comprova acesso de produção',protecaoCredencial:'Electron safeStorage Windows',evidencias},null,2));assert.equal(evidencias.length,20);
});
