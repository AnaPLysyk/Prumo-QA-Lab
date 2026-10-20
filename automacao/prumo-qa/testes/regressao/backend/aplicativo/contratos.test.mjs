import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { fixture } from '../../../apoio/fixtures.mjs';
import { criarServidor } from '../../../../dist/agentes/mcp/criarServidor.js';
import { camposDe, canaisFrequentes, catalogo, esquemasIpc } from '../../../../dist/aplicativo/api/catalogoDeContratos.js';

const ler = (f) => fs.readFileSync(f, 'utf8');
const arquivosTs = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).filter((n) => n.endsWith('.ts')).map((n) => path.join(dir, n));
const registro = ler('backend/aplicativo/api/registrarCanaisIpc.ts');
const backend = arquivosTs('backend').map(ler).join('\n');
const preload = ler('backend/aplicativo/preload.cjs');
const ipcCatalogo = catalogo().filter((o) => o.tipo === 'IPC');
const mcpCatalogo = catalogo().filter((o) => o.tipo === 'MCP');

test('IPC: canais registrados, esquemas e catálogo são exatamente os mesmos', () => {
  const registrados = [...registro.matchAll(/registrarCanal\('([a-z]+:[a-z]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(registrados, Object.keys(esquemasIpc).sort(), 'registrarCanaisIpc.ts × esquemas');
  assert.deepEqual(ipcCatalogo.map((o) => o.nome).sort(), Object.keys(esquemasIpc).map((c) => 'prumo:' + c).sort(), 'catálogo × esquemas');
  assert.equal(new Set(registrados).size, registrados.length, 'sem canal duplicado');
  assert.equal([...backend.matchAll(/ipcMain\.handle\(/g)].length, 1, 'ipcMain.handle só existe dentro do wrapper validado (no backend inteiro)');
});

test('IPC: preload expõe apenas canais do catálogo, cada um uma vez, sem ipcRenderer livre', () => {
  const usados = [...preload.matchAll(/chamar\('([a-z]+:[a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(usados)].sort(), Object.keys(esquemasIpc).sort());
  assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer|ipcRenderer\s*[,}]\s*\)\)/);
  assert.match(preload, /Object\.freeze/);
  assert.equal([...preload.matchAll(/ipcRenderer\./g)].length, 1, 'ipcRenderer só é usado dentro de chamar()');
});

test('IPC: todo canal tem documentação completa e campos derivados do esquema real', () => {
  for (const o of ipcCatalogo) {
    for (const k of ['finalidade', 'origem', 'destino', 'entrada', 'saida', 'permissoes', 'efeito', 'arquivos', 'registro']) assert.ok(o[k]?.length > 3, `${o.nome}.${k}`);
    assert.ok(o.erros.includes('INVALID_ARGUMENTS') && o.erros.includes('IPC_SENDER_REJECTED'), o.nome);
    assert.ok(o.protecoes.length >= 3, o.nome);
    assert.deepEqual(o.campos, camposDe(esquemasIpc[o.nome.slice(6)]), o.nome);
  }
  assert.deepEqual(ipcCatalogo.find((o) => o.nome === 'prumo:dados:excluir').campos, ['escopo', 'root']);
  assert.deepEqual(ipcCatalogo.find((o) => o.nome === 'prumo:projeto:logs').campos, ['filter', 'root']);
});

test('IPC: esquemas recusam argumentos extras, inválidos e escopos desconhecidos', () => {
  const ok = (c, v) => esquemasIpc[c].safeParse(v).success;
  assert.ok(ok('projeto:visao', { root: 'C:\\x' }));
  assert.ok(!ok('projeto:visao', { root: 'C:\\x', extra: 1 }));
  assert.ok(!ok('projeto:visao', { root: '' }));
  assert.ok(!ok('projeto:visao', { root: 5 }));
  assert.ok(!ok('app:info', { qualquer: 1 }));
  assert.ok(!ok('projeto:logs', { root: 'x', filter: { limit: 0 } }));
  assert.ok(!ok('projeto:evidencias', { root: 'x', jobId: '../../etc' }));
  assert.ok(!ok('conexao:aplicar', { root: 'x', client: 'claude' }));
  assert.ok(ok('dados:excluir', { escopo: 'diagnostico' }));
  assert.ok(!ok('dados:excluir', { escopo: 'historico' }), 'historico exige projeto');
  assert.ok(!ok('dados:excluir', { escopo: 'tudo', root: 'x' }));
  assert.ok(!ok('dados:excluir', { escopo: 'diagnostico', root: 'x' }));
});

test('IPC: exclusão exige confirmação nativa e nunca é alcançável por MCP; consultas frequentes não geram diagnóstico de sucesso', () => {
  assert.match(ler('backend/ajuda/api/dadosExcluir.ts'), /showMessageBox[\s\S]*?response !== 1/);
  assert.match(ler('backend/atualizacoes/api/atualizacaoAbrir.ts'), /showMessageBox/);
  for (const c of ['projeto:logs', 'projeto:visao', 'projeto:historico']) assert.ok(canaisFrequentes.has(c), c);
  assert.ok(!canaisFrequentes.has('dados:excluir'));
  const importsMcp = ['backend/mcp.ts', ...arquivosTs('backend/agentes/mcp')].map(ler).join('\n').match(/^import .*$/gm).join('\n');
  assert.doesNotMatch(importsMcp, /excluir|privacidade\/|diagnostico\/|Vinculo/i, 'o servidor MCP não importa exclusão, dados, diagnóstico nem vínculos de pasta');
});

test('MCP: servidor real lista exatamente as oito ferramentas (quatro originais e três da 2.9 e aprendizado) e o catálogo descreve os mesmos argumentos', async (t) => {
  const f = await fixture(t);
  const servidor = await criarServidor(f.root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await servidor.connect(b);
  const cliente = new Client({ name: 'teste-contrato', version: '1.0.0' }); await cliente.connect(a);
  t.after(() => cliente.close());
  assert.equal(cliente.getServerVersion().version, JSON.parse(ler('package.json')).version, 'o MCP informa a versão do package.json');
  const ferramentas = (await cliente.listTools()).tools;
  assert.deepEqual(ferramentas.map((x) => x.name).sort(), ['consultar_evidencias', 'contexto_projeto', 'executar_validacao', 'listar_politicas', 'propor_aprendizado', 'propor_bug', 'propor_caso', 'revisar_cobertura']);
  assert.deepEqual(mcpCatalogo.map((o) => o.nome).sort(), ferramentas.map((x) => x.name).sort());
  for (const tool of ferramentas) {
    const doc = mcpCatalogo.find((o) => o.nome === tool.name);
    assert.deepEqual(doc.campos, Object.keys(tool.inputSchema.properties ?? {}).sort(), tool.name);
    for (const k of ['finalidade', 'origem', 'destino', 'entrada', 'saida', 'permissoes', 'efeito', 'arquivos', 'registro']) assert.ok(doc[k]?.length > 3, `${tool.name}.${k}`);
    assert.ok(doc.erros.length > 0 && doc.protecoes.length >= 3);
  }
});

test('catálogo não inventa HTTP: nenhuma URL, porta ou método REST nas descrições', () => {
  const texto = JSON.stringify(catalogo());
  assert.doesNotMatch(texto, /https?:\/\/|localhost|127\.0\.0\.1|\b(GET|POST|PUT|PATCH)\b\s+\/|:\d{4,5}\b/);
});

test('cada arquivo citado como destino existe no backend', () => {
  for (const o of catalogo()) {
    const citados = [...o.destino.matchAll(/backend\/[\w/]+\.ts/g)].map((m) => m[0]);
    assert.ok(citados.length, `${o.nome}: destino sem arquivo`);
    for (const c of citados) assert.ok(fs.existsSync(c), `${o.nome}: ${c}`);
  }
});

test('docs/CONTRATOS.md está sincronizado com o catálogo real (rode npm run contratos)', async () => {
  const { documento } = await import('../../../../docs/geradores/gerar-contratos.mjs');
  const normal = (s) => s.split('\r').join('');
  assert.equal(normal(ler('docs/CONTRATOS.md')), normal(documento()));
});
