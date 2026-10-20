import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { abrir,novoDados } from '../../../apoio/janela.mjs';
import { gerarSite } from '../../../../site/gerar.mjs';

test('site no Chromium real: navegação, teclado e resoluções 1280/640/320 sem overflow da página',async t=>{
  const dados=novoDados(t);const out=path.join(dados,'site');gerarSite(out);const a=await abrir(t,dados);
  const novaJanela=a.app.waitForEvent('window');
  await a.app.evaluate(async({BrowserWindow},arquivo)=>{const w=new BrowserWindow({show:true,width:1280,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});await w.loadFile(arquivo);},path.join(out,'index.html'));
  const page=await novaJanela;await page.waitForURL('**/index.html');
  const indexUrl=page.url();
  await page.getByRole('link',{name:'Download',exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'Versões e download',exact:true}).waitFor();
  assert.ok((await page.getByRole('link',{name:/Ver release oficial/}).getAttribute('href')).startsWith('https://github.com/AnaPLysyk/Prumo-Qa/releases/tag/'));
  await page.getByRole('link',{name:'Prumo QA',exact:true}).click();await page.getByRole('heading',{name:/Do ticket à evidência/}).waitFor();
  for(const largura of [1280,640,320]){
    await a.app.evaluate(({BrowserWindow},[l,u])=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===u).setSize(l,900);},[largura,indexUrl]);
    await page.waitForFunction(l=>window.innerWidth<=l,largura);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,`reflow ${largura}`);
  }
  await page.keyboard.press('Control+Home');await page.getByRole('link',{name:'Pular para o conteúdo'}).focus();assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');
  const fotos=path.resolve('.prumo/validacao-2.6');fs.mkdirSync(fotos,{recursive:true});await page.screenshot({path:path.join(fotos,'site-320.png'),fullPage:true});
  assert.deepEqual(a.erros,[]);
});
