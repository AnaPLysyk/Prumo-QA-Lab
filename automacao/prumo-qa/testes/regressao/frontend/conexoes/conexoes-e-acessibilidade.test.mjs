import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../../unitario/infra/fixtures.mjs';
import { abrir,novoDados,ir,vincularPasta,esperarPastaVinculada,raizDoProjetoAtual } from '../../infra/janela.mjs';
// 2.19.0: o diagnóstico dos clientes MCP fica em Agentes › Políticas do projeto › Clientes MCP.
const abrirClientesMcp=async page=>{await page.click('[data-agent-tab="policies"]');await page.locator('[data-ia="codex"]').click();await page.locator('#ia-mcp-testar').waitFor();};

test('janela verifica protocolo real, distingue SDK e preserva evidência após reabrir',async t=>{
  const f=await fixture(t);const dados=novoDados(t);const a=await abrir(t,dados);
  await vincularPasta(a.app,a.page,f.root);await esperarPastaVinculada(a.page,f.root);const raiz=await raizDoProjetoAtual(a.page);
  await ir(a.page,'agentes');await abrirClientesMcp(a.page);
  await a.page.click('#ia-mcp-testar');
  await a.page.waitForSelector('.ia-mcp-resultado.ok',{timeout:20000});
  const texto=await a.page.textContent('#conteudo');assert.match(texto,/Funcionando/);assert.match(texto,/Último teste \(SDK\).*VALIDADO/);assert.match(texto,/Ainda sem chamadas do Codex/);
  assert.doesNotMatch(texto,/\bnull\b|undefined/,'campos ausentes não viram texto na interface');assert.match(texto,/Arquivo de configuração/);
  const h=await a.page.evaluate(root=>window.prumo.historico(root),raiz);
  assert.equal(h.data.activities.length,1);assert.equal(h.data.activities[0].client,'sdk');assert.equal(h.data.activities[0].tool,'consultar_evidencias');
  await a.fechar();const b=await abrir(t,dados);await ir(b.page,'agentes');await abrirClientesMcp(b.page);assert.match(await b.page.textContent('#conteudo'),/Funcionando/);assert.deepEqual([...a.erros,...b.erros],[]);
});

test('teclado, foco, zoom 200/400% e reflow: ações e campos permanecem acessíveis',async t=>{
  const dados=novoDados(t);const a=await abrir(t,dados);
  await a.page.getByRole('button',{name:'Suporte',exact:true}).focus();await a.page.keyboard.press('Enter');
  await a.page.getByLabel('Número do chamado',{exact:true}).waitFor();await a.page.getByLabel('Número do chamado',{exact:true}).focus();
  assert.equal(await a.page.evaluate(()=>document.activeElement?.id),'sup-numero');
  assert.notEqual(await a.page.getByLabel('Número do chamado',{exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await a.page.keyboard.press('Tab');assert.equal(await a.page.evaluate(()=>document.activeElement?.textContent),'Consultar chamado');
  for(const zoom of [2,4]){
    await a.app.evaluate(({BrowserWindow},z)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1280,900);w.webContents.setZoomFactor(z);},zoom);
    await a.page.waitForFunction(()=>window.innerWidth<700);
    assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,`reflow ${zoom}`);
    await a.page.getByLabel('Número do chamado',{exact:true}).fill('12');assert.equal(await a.page.getByLabel('Número do chamado',{exact:true}).inputValue(),'12');
  }
  await a.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));assert.deepEqual(a.erros,[]);
});
