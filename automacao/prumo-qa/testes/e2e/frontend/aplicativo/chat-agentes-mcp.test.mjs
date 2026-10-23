/** Homologação real e isolada: Electron autenticado, chat por todos os agentes e servidor MCP por stdio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, mcp, repo, atenderConfirmacoes } from '../../infra/janela.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const agentes = ['orquestrador', 'qa-geral', 'requisitos', 'playwright', 'api-rest',
  'acessibilidade', 'investigacao-bugs', 'regressao', 'monitoramento'];

test('conta temporária: nove agentes respondem, chat renderiza e MCP real consulta o projeto', { timeout: 120000 }, async t => {
  const dados = novoDados(t);
  const a = await abrir(t, dados);
  const conf = atenderConfirmacoes(a.app); t.after(() => conf.parar()); // excluir o agente pessoal pede a confirmação do aplicativo
  const detalhesDosErros = [];
  a.page.on('pageerror', e => detalhesDosErros.push(e.stack));
  const criado = await a.page.evaluate(() => window.prumo.espacoCriar({
    nome: 'Homologação MCP e Orchestrator', descricao: 'dados fictícios do Prumo QA Lab'
  }));
  assert.equal(criado.ok, true, JSON.stringify(criado.error));
  const espaco = criado.data;
  assert.ok(espaco?.id && espaco?.raizContextos);
  assert.ok(fs.existsSync(path.join(dados, 'plataforma', 'mcp-sessao.json')), 'Electron autenticado criou ponte MCP');
  const roster = await a.page.evaluate(id => window.prumo.assistenteAgentes(id), espaco.id);
  assert.equal(roster.ok, true, JSON.stringify(roster.error));
  assert.deepEqual(roster.data.provedores.map(p => p.id).sort(), ['claude', 'codex', 'copilot', 'gemini']);
  assert.ok(roster.data.provedores.every(p => p.autorizado === false), 'IAs externas não autorizadas por padrão');
  // Sem autorização individual, não existe chamada a cliente externo: os quatro retornam ao modo local.
  for (const provedor of ['claude', 'codex', 'copilot', 'gemini', 'mesa']) {
    const r = await a.page.evaluate(({id, provedor}) =>
      window.prumo.assistenteConversar(id, 'qual a situação do projeto?', { provedor }),
      {id: espaco.id, provedor});
    assert.equal(r.ok, true, provedor + ': ' + JSON.stringify(r.error));
    assert.equal(r.data.modo, 'LOCAL', provedor + ' não autorizado deve responder localmente');
    assert.match(r.data.aviso ?? '', /não autorizada|pelo menos 2 IAs|IAs autorizadas/i);
  }

  for (const agente of agentes) {
    const resposta = await a.page.evaluate(({id, agente}) =>
      window.prumo.assistenteConversar(id, 'qual a situação do projeto?', { agente, provedor:'local' }),
      {id: espaco.id, agente});
    assert.equal(resposta.ok, true, agente + ': ' + JSON.stringify(resposta.error));
    assert.equal(resposta.data.agente.id, agente);
    assert.equal(resposta.data.modo, 'LOCAL');
    assert.ok(resposta.data.linhas.length > 0, agente + ' sem resposta');
  }

  // Agentes pessoais pertencem à conta: criação, listagem e descarte sem alterar agentes oficiais.
  const pessoal = await a.page.evaluate(id => window.prumo.agentePessoalSalvar(id, {
    nome: 'Especialista sintético', descricao: 'somente teste', objetivo: 'Revisar cenários fictícios',
    instrucoes: 'Analisar somente dados do Lab', publico: false
  }), espaco.id);
  assert.equal(pessoal.ok, true, JSON.stringify(pessoal.error));
  const pessoais = await a.page.evaluate(id => window.prumo.agentesPessoais(id), espaco.id);
  assert.equal(pessoais.ok, true, JSON.stringify(pessoais.error));
  assert.ok(pessoais.data.some(x => x.nome === 'Especialista sintético' && x.meu && !x.publico));
  const excluido = await a.page.evaluate(id => window.prumo.agentePessoalExcluir(id), pessoal.data.id);
  assert.equal(excluido.ok, true, JSON.stringify(excluido.error));
  const depois = await a.page.evaluate(id => window.prumo.agentesPessoais(id), espaco.id);
  assert.ok(!depois.data.some(x => x.nome === 'Especialista sintético'));

  // O projeto criado por IPC não altera sozinho o seletor visual; o chat deve responder mesmo sem seleção.
  await ir(a.page, 'inicio');
  await a.page.waitForSelector('#chat-input');
  await a.page.selectOption('#chat-agente', 'api-rest');
  await a.page.fill('#chat-input', 'qual a situação do projeto?');
  await a.page.locator('#chat-form button[type=submit]').click();
  await a.page.waitForFunction(() => !document.querySelector('#chat-form button[type=submit]')?.disabled);
  assert.match(await a.page.textContent('#chat-msgs'), /situação do projeto|projeto|API/i);

  const resultados = await mcp(espaco.raizContextos, dados, [
    ['listar_politicas', {}],
    ['perguntar_ao_orquestrador', { pergunta: 'qual a situação deste projeto?' }]
  ]);
  assert.equal(resultados.length, 2);
  for (const [i, resultado] of resultados.entries()) {
    assert.notEqual(resultado.isError, true, 'ferramenta MCP ' + i + ': ' + JSON.stringify(resultado.content));
    assert.ok(resultado.content.some(c => c.type === 'text' && c.text?.length), 'MCP sem resposta ' + i);
  }
  assert.deepEqual(a.erros, [], 'console Electron sem erros: ' + JSON.stringify(detalhesDosErros));
  // Mesmo um cliente MCP já conectado deve perder acesso imediatamente ao sair da conta.
  const cliente = new Client({ name: 'lab-sessao-revogacao', version: '1.0.0' });
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repo, 'dist', 'mcp.js'), espaco.raizContextos],
    env: { PRUMO_DATA_DIR: dados }
  });
  try {
    await cliente.connect(transporte);
    const permitido = await cliente.callTool({ name:'listar_politicas', arguments:{} });
    assert.notEqual(permitido.isError, true);
    const sair = await a.page.evaluate(() => window.prumo.contaSair());
    assert.equal(sair.ok, true, JSON.stringify(sair.error));
    assert.equal(fs.existsSync(path.join(dados, 'plataforma', 'mcp-sessao.json')), false,
      'logout remove a autorização MCP da conta');
    const negado = await cliente.callTool({ name:'listar_politicas', arguments:{} });
    assert.equal(negado.isError, true, 'sessão revogada não pode consultar ferramentas');
    assert.match(JSON.stringify(negado.content), /MCP_SESSION_REQUIRED|MCP_SESSION_CHANGED/);
  } finally {
    await cliente.close().catch(() => {});
    await transporte.close().catch(() => {});
  }
});
