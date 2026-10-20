import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import '../../../apoio/conhecimento-memoria.mjs';
import { falhasConhecimento } from '../../../apoio/conhecimento-falso.mjs';
import { listarConhecimentos } from '../../../../dist/agentes/banco/listarConhecimentos.js';
import { criarServidor } from '../../../../dist/agentes/mcp/criarServidor.js';
import { textoDoPrompt } from '../../../../dist/agentes/mcp/textoDoPrompt.js';
import { salvarConfiguracao } from '../../../../dist/agentes/politicas/salvarConfiguracao.js';
import { promptsPrumo } from '../../../../dist/agentes/tipos/roteiros.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import '../../../apoio/fixtures.mjs';

test('MCP: prompts list/get, validação e aprendizado em rascunho obedecem política sem banco', async t => {
  const e = await criarEspaco({ nome: 'MCP sintético IA' });
  const server = await criarServidor(e.raizContextos);
  const [a,b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'codex-sintetico', version: '1' });
  await Promise.all([server.connect(b), client.connect(a)]); t.after(() => client.close());
  assert.deepEqual((await client.listPrompts()).prompts.map(x => x.name), promptsPrumo.map(x => x.nome));
  const args = { requisito: 'RQ sintético', origem: 'fixture' };
  assert.equal((await client.getPrompt({ name: 'analisar-requisito', arguments: args })).messages[0].content.text, textoDoPrompt('analisar-requisito', args));
  await assert.rejects(client.getPrompt({ name: 'analisar-requisito', arguments: {} }));
  const dados = { tipo: 'fato', titulo: 'Ambiente sintético', texto: 'Este projeto usa dados de fixture.', agente: 'qa-geral' };
  const chamar = () => client.callTool({ name: 'propor_aprendizado', arguments: dados });
  const r = await chamar(); assert.equal(r.isError, undefined);
  assert.equal(JSON.parse(r.content[0].text).estado, 'RASCUNHO');
  assert.equal(listarConhecimentos({ espacoId: e.id, estados: ['APROVADO'] }).length, 0);
  assert.equal(listarConhecimentos({ espacoId: e.id, estados: ['RASCUNHO'] }).length, 1);
  salvarConfiguracao(e.id, { especializacoes: ['qa-geral'], politicas: { propor_aprendizado: 'BLOQUEADO' } }, 'pessoa-fixture');
  assert.match((await chamar()).content[0].text, /POLICY_BLOCKED/);
  salvarConfiguracao(e.id, { especializacoes: ['qa-geral'], politicas: {} }, 'pessoa-fixture');
  falhasConhecimento.registrar = 'KNOWLEDGE_RATE_LIMIT';
  try { const limitado = await chamar(); assert.equal(limitado.isError, true); assert.match(limitado.content[0].text, /KNOWLEDGE_RATE_LIMIT/); }
  finally { falhasConhecimento.registrar = null; }
  assert.equal(fs.existsSync(path.join(process.env.PRUMO_DATA_DIR, 'conhecimento.db')), false);
});
