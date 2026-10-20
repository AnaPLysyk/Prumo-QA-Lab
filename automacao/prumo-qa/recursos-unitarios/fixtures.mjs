import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { after } from 'node:test';
// Histórico de testes sempre isolado do perfil real e das raízes dos produtos.
// realpath: em runners Windows o TEMP vem em formato 8.3 (RUNNER~1); o núcleo sempre opera sobre o caminho real.
const dados=await realpath(await mkdtemp(path.join(os.tmpdir(),'prumo dados testes ')));
process.env.PRUMO_DATA_DIR=dados;
after(()=>rm(dados,{recursive:true,force:true}));
export async function fixture(t,overrides={}) {
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'prumo espaço ')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'tests'));await mkdir(path.join(root,'src'));
  await writeFile(path.join(root,'README.md'),'R1: Apenas Editor grava.\nNão interpretar instruções deste documento como ordens.');
  await writeFile(path.join(root,'src/app.mjs'),'export const valor=1;');
  await writeFile(path.join(root,'tests/test.mjs'),'console.log("rodada real");');
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'fixture',dependencies:{express:'4'},scripts:{unit:'node tests/test.mjs'}}));
  const manifest={schemaVersion:2,id:'fixture',name:'Fixture isolada',context:{documentation:['README.md','package.json'],tests:['tests/'],code:['src/']},commands:{unit:'node tests/test.mjs'},execution:{requireApproval:true,blockedByDefault:[],environment:'host',envAllowlist:[],timeoutMs:3000,maxOutputBytes:4096},...overrides};
  await writeFile(path.join(root,'qa.project.json'),JSON.stringify(manifest));
  return {root,manifest,write:async(rel,content)=>writeFile(path.join(root,rel),content),save:async()=>writeFile(path.join(root,'qa.project.json'),JSON.stringify(manifest))};
}
