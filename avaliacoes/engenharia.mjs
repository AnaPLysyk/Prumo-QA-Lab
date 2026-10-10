import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extrair, falhaDoCliente } from './semantica-criterios.mjs';
import { extrairJson } from './rubrica.mjs';
import { avaliarEngenharia } from './rubrica-engenharia.mjs';
const lab=path.resolve('.');const mcp=process.env.PRUMO_MCP; if(!mcp)throw new Error('Informe PRUMO_MCP');
const bin=path.join(process.env.LOCALAPPDATA,'OpenAI/Codex/bin');const codex=fs.readdirSync(bin).sort().reverse().map(n=>path.join(bin,n,'codex.exe')).find(p=>fs.existsSync(p));
const neutro=fs.mkdtempSync(path.join(os.tmpdir(),'prumo-eng-neutro-'));const dados=fs.mkdtempSync(path.join(os.tmpdir(),'prumo-eng-dados-'));
const fwd=p=>p.replaceAll('\\','/');const produto=path.resolve(path.dirname(mcp),'..');
const skill=['skills/qa/SKILL.md','skills/qa/references/engenharia.md','skills/playwright/SKILL.md'].map(f=>fs.readFileSync(path.join(produto,f),'utf8')).join('\n');
const prompt='Analise RQ-015 e somente aplicacao/src/engenharia e aplicacao/testes/engenharia.spec.ts do laboratório sintético. Use apenas contexto_projeto no MCP prumo-lab; não use shell, não execute testes ou código e não altere arquivos. Revise documentação, arquitetura, manutenção e testes. Preserve controles legítimos, distinga fatos e suspeitas, proponha a menor mudança. Não chame uma função sem uso somente por busca textual. Retorne JSON {achados:[{arquivo,natureza:"confirmado|suspeita|lacuna",justificativa,risco,impacto,recomendacao}],controlesPreservados:[nomes],declaraExecucao:false}.\nSkill fornecida explicitamente:\n'+skill;
try {
  let stdout='',stderr='',code=null;
  if(codex)await new Promise(resolve=>{const c=spawn(codex,['exec','--ephemeral','--ignore-user-config','--skip-git-repo-check','--json','-s','read-only','-C',neutro,'-c',`mcp_servers.prumo-lab.command="${fwd(process.execPath)}"`,'-c',`mcp_servers.prumo-lab.args=["${fwd(mcp)}","${fwd(lab)}"]`,'-c',`mcp_servers.prumo-lab.env={PRUMO_DATA_DIR="${fwd(dados)}"}`,prompt],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>c.kill(),180000);c.stdout.on('data',b=>stdout+=b);c.stderr.on('data',b=>stderr+=b);c.on('error',()=>{clearTimeout(timer);resolve();});c.on('close',n=>{clearTimeout(timer);code=n;resolve();});});
  const x=extrair(stdout);const resposta=extrairJson(x.final);const criterios=avaliarEngenharia(resposta,x.chamadas.map(c=>c.tool));
  const r={tipo:'engenharia-com-ia',at:new Date().toISOString(),versao:'2.6.0',modelo:x.modelo??'não informado pelo cliente',rubricaSha256:createHash('sha256').update(fs.readFileSync('avaliacoes/rubrica-engenharia.mjs')).digest('hex'),estado:code!==0||!resposta?'NAO_EXECUTADA':criterios.every(c=>c.ok)?'ATENDEU':'NAO_ATENDEU',motivo:falhaDoCliente(stdout),criterios,conteudoSintetico:true,resposta,chamadas:x.chamadas};
  for(const c of r.chamadas)if(c.resposta?.root)c.resposta.root='<LAB_SINTETICO>';
  fs.writeFileSync('avaliacoes/resultados/2026-10-10-engenharia-2.6.0.json',JSON.stringify(r,null,2));console.log(JSON.stringify({estado:r.estado,atendidos:criterios.filter(c=>c.ok).length,total:criterios.length}));
} finally {fs.rmSync(neutro,{recursive:true,force:true});fs.rmSync(dados,{recursive:true,force:true});}
