import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root=path.resolve('backend/projetos/exemplos/projeto-demo');
const destination=path.resolve('.prumo/demonstracao');await fs.mkdir(destination,{recursive:true});
const cli=path.resolve('dist/cli.js');
const results=[];
for(const [label,args] of [['doctor',['doctor']],['context',['context']],['review',['review',path.resolve('backend/projetos/exemplos/plano-demo.json')]],['run-blocked',['run','unit']],['evidence',['evidence']]]){
  const r=spawnSync(process.execPath,[cli,...args,'--root',root],{encoding:'utf8'});
  if(r.status!==(label==='run-blocked'?2:0))throw new Error(r.stderr||r.stdout);
  const data=JSON.parse(r.stdout);results.push({label,exitCode:r.status,data});await fs.writeFile(path.join(destination,`${label}.json`),JSON.stringify(data,null,2));
}
// Verifica o produto sintético com assertions reais, fora do Prumo. Não afirma aprovação humana.
const tests=spawnSync(process.execPath,['--test','testes/publicacao.test.mjs'],{cwd:root,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot}});
await fs.writeFile(path.join(destination,'node-test.txt'),tests.stdout+'\n'+tests.stderr);
if(tests.status!==0)throw new Error('Demo falhou: '+tests.stderr);
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/mcp.js'),root],env:process.env.PRUMO_DATA_DIR?{PRUMO_DATA_DIR:process.env.PRUMO_DATA_DIR}:undefined,stderr:'pipe'});
const client=new Client({name:'prumo-demo-real-client',version:'1.0.0'});await client.connect(transport);
try{
  const tools=await client.listTools();results.push({label:'tools/list',data:tools});
  const plano=JSON.parse(await fs.readFile('backend/projetos/exemplos/plano-demo.json','utf8'));
  for(const [name,args] of [['contexto_projeto',{}],['revisar_cobertura',plano],['executar_validacao',{capability:'unit'}],['consultar_evidencias',{}]]){
    const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r));results.push({label:name,data:JSON.parse(r.content[0].text)});
  }
}finally{await client.close();}
await fs.writeFile(path.join(destination,'protocolo-mcp.json'),JSON.stringify(results.filter(r=>r.label.includes('/')||r.label.includes('_')),null,2));
await fs.writeFile(path.join(destination,'demonstracao.json'),JSON.stringify({at:new Date().toISOString(),root,results,productTests:{status:'PASS',exitCode:tests.status,source:'node --test, execução direta autorizada no exemplo sintético'},humanExecution:{status:'BLOCKED',reason:'Autenticação Windows humana não efetuada. Não simulada.'}},null,2));
console.log(JSON.stringify({log:destination,tools:4,directProductTests:'PASS',prumoExecution:'BLOCKED',reason:'Consentimento humano nativo ainda necessário.'},null,2));
