import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { fixture } from '../../../apoio/fixtures.mjs';
import { criarServidor } from '../../../../dist/agentes/mcp/criarServidor.js';
import { esquemasIpc } from '../../../../dist/aplicativo/api/catalogoDeContratos.js';

// Fumaça do backend: o build carrega, os canais da janela existem e o servidor MCP responde com as ferramentas. Detalhes ficam na regressão.
test('backend sobe: canais da janela carregados e servidor MCP lista as ferramentas', async (t) => {
  assert.ok(Object.keys(esquemasIpc).length > 100, 'catálogo de canais carregado');
  const f = await fixture(t); const servidor = await criarServidor(f.root);
  const [a, b] = InMemoryTransport.createLinkedPair(); await servidor.connect(b);
  const cliente = new Client({ name: 'smoke', version: '1.0.0' }); await cliente.connect(a); t.after(() => cliente.close());
  assert.ok((await cliente.listTools()).tools.length >= 4);
});
