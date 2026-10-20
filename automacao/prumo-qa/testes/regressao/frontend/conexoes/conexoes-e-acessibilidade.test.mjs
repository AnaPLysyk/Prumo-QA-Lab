import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../../apoio/fixtures.mjs';
import { abrir,novoDados,ir,escolherPasta } from '../../../apoio/janela.mjs';

test('janela verifica protocolo real, distingue SDK e preserva evidência após reabrir',async t=>{
  const f=await fixture(t);const dados=novoDados(t);const a=await abrir(t,dados);
  await escolherPasta(a.app,f.root);await a.page.getByRole('button',{name:'Vincular pasta…',exact:true}).click();
  await a.page.waitForSelector('table');await ir(a.page,'agentes');
  await a.page.getByRole('button',{name:'Testar integração codex',exact:true}).click();
  await a.page.waitForFunction(()=>document.querySelector('#conteudo')?.textContent.includes('PROTOCOL_OK'),null,{timeout:20000});
  const texto=await a.page.textContent('#conteudo');assert.match(texto,/handshake: true/);assert.match(texto,/Última chamada observada do cliente.*nenhuma/);assert.match(texto,/consultar_evidencias/);
  assert.doesNotMatch(texto,/\bnull\b|undefined/,'campos ausentes não viram texto na interface');assert.match(texto,/Configuração: [A-Z_]+/);
  const h=await a.page.evaluate(root=>window.prumo.historico(root),f.root);
  assert.equal(h.data.activities.length,1);assert.equal(h.data.activities[0].client,'sdk');assert.equal(h.data.activities[0].tool,'consultar_evidencias');
  await a.fechar();const b=await abrir(t,dados);await ir(b.page,'agentes');assert.match(await b.page.textContent('#conteudo'),/PROTOCOL_OK/);assert.deepEqual([...a.erros,...b.erros],[]);
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
