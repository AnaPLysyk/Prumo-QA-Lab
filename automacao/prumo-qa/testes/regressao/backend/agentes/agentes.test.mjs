import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { fixture } from '../../../apoio/fixtures.mjs';
import { criarServidor } from '../../../../dist/agentes/mcp/criarServidor.js';
import { capacidadeEfetiva } from '../../../../dist/agentes/politicas/capacidadeEfetiva.js';
import { configuracaoDoEspaco } from '../../../../dist/agentes/politicas/configuracaoDoEspaco.js';
import { matrizDePoliticas } from '../../../../dist/agentes/politicas/matrizDePoliticas.js';
import { salvarConfiguracao } from '../../../../dist/agentes/politicas/salvarConfiguracao.js';
import { capacidades, especializacoes } from '../../../../dist/agentes/tipos/politicas.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';
import { espacoDaRaiz } from '../../../../dist/projetos/regras/espacoDaRaiz.js';
import { vincularPastaAoEspaco as pastaEspaco } from '../../../../dist/projetos/regras/vincularPastaAoEspaco.js';
import { listarPropostas } from '../../../../dist/tickets/banco/listarPropostas.js';

async function cliente(t, raiz) {
  const servidor = await criarServidor(raiz); const [a, b] = InMemoryTransport.createLinkedPair(); const c = new Client({ name: 'claude-teste', version: '1.0.0' });
  await Promise.all([servidor.connect(b), c.connect(a)]); t.after(() => c.close()); return c;
}
const chamar = async (c, nome, args = {}) => { const r = await c.callTool({ name: nome, arguments: args }); const txt = r.content?.[0]?.text ?? ''; let dados = null; try { dados = JSON.parse(txt); } catch { /* erro textual */ } return { erro: r.isError === true, txt, dados }; };
const caso = (titulo) => ({ titulo, passos: [{ acao: 'Abrir', esperado: 'Visível' }] });

test('padrão: especializações todas habilitadas e capacidades como antes da 2.9; escrita externa é só da pessoa e não editável', async (t) => {
  const e = await criarEspaco({ nome: 'AG-PADRAO' }); const c = configuracaoDoEspaco(e.id); assert.equal(c.padrao, true); assert.equal(c.especializacoes.length, especializacoes.length);
  const m = Object.fromEntries(matrizDePoliticas(e.id).map((x) => [x.id, x.estado]));
  assert.deepEqual([m.consultar_contexto, m.revisar_cobertura, m.consultar_evidencias, m.propor_casos, m.propor_bugs, m.executar_testes], ['PERMITIDO', 'PERMITIDO', 'PERMITIDO', 'PERMITIDO', 'PERMITIDO', 'EXIGE_AUTORIZACAO']);
  for (const id of ['consultar_jira', 'consultar_qase', 'criar_casos_qase', 'abrir_bug_jira', 'enviar_resultados_qase', 'github_escrita']) { assert.equal(m[id], 'SOMENTE_PESSOA', id); assert.deepEqual(capacidades.find((x) => x.id === id).editavel, []); }
  assert.throws(() => salvarConfiguracao(e.id, { especializacoes: ['qa-geral'], politicas: { criar_casos_qase: 'PERMITIDO' } }, 'ana'), /AGENT_POLICY_NOT_ALLOWED/); assert.throws(() => salvarConfiguracao(e.id, { especializacoes: ['qa-geral'], politicas: { executar_testes: 'PERMITIDO' } }, 'ana'), /AGENT_POLICY_NOT_ALLOWED/, 'executar nunca é livre');
  assert.throws(() => salvarConfiguracao(e.id, { especializacoes: ['mago'], politicas: {} }, 'ana'), /AGENT_SPECIALIZATION_UNKNOWN/); assert.throws(() => salvarConfiguracao(e.id, { especializacoes: [], politicas: { inventada: 'BLOQUEADO' } }, 'ana'), /AGENT_CAPABILITY_UNKNOWN/);
  assert.equal(capacidadeEfetiva(null, 'propor_casos').estado, 'PERMITIDO', 'raiz sem projeto Prumo: padrão'); assert.equal(capacidadeEfetiva(e.id, 'desconhecida').estado, 'BLOQUEADO');
  void t;
});

test('especializações por projeto: capacidade só existe se houver especialização habilitada que a inclua e a política não a bloquear', async () => {
  const e = await criarEspaco({ nome: 'AG-ESPEC' });
  salvarConfiguracao(e.id, { especializacoes: ['monitoramento'], politicas: {} }, 'ana'); const efetivo = (cap) => capacidadeEfetiva(e.id, cap).estado;
  assert.deepEqual(['consultar_contexto', 'consultar_evidencias', 'propor_casos', 'propor_bugs', 'executar_testes', 'revisar_cobertura'].map(efetivo), ['PERMITIDO', 'PERMITIDO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
  salvarConfiguracao(e.id, { especializacoes: ['regressao', 'qa-geral'], politicas: { propor_casos: 'BLOQUEADO' } }, 'ana'); assert.deepEqual(['executar_testes', 'propor_bugs', 'propor_casos', 'revisar_cobertura'].map(efetivo), ['EXIGE_AUTORIZACAO', 'PERMITIDO', 'BLOQUEADO', 'PERMITIDO']);
  assert.match(capacidadeEfetiva(e.id, 'propor_casos').motivo, /Bloqueada pela política/); salvarConfiguracao(e.id, { especializacoes: [], politicas: {} }, 'ana'); assert.ok(matrizDePoliticas(e.id).filter((x) => x.editavel.length).every((x) => x.estado === 'BLOQUEADO'), 'nenhuma especialização: tudo bloqueado');
  assert.equal(configuracaoDoEspaco(e.id).padrao, false);
});

test('MCP real: oito ferramentas; propostas só em rascunho; política bloqueia no backend, inclusive executar; sem projeto Prumo não há proposta', async (t) => {
  const e = await criarEspaco({ nome: 'AG-MCP' }); const c = await cliente(t, e.raizContextos);
  const nomes = (await c.listTools()).tools.map((x) => x.name).sort(); assert.deepEqual(nomes, ['consultar_evidencias', 'contexto_projeto', 'executar_validacao', 'listar_politicas', 'propor_aprendizado', 'propor_bug', 'propor_caso', 'revisar_cobertura']);
  const pol = await chamar(c, 'listar_politicas'); assert.equal(pol.erro, false); assert.equal(pol.dados.projetoPrumo, 'AG-MCP'); assert.equal(pol.dados.capacidades.find((x) => x.id === 'criar_casos_qase').estado, 'SOMENTE_PESSOA'); assert.match(pol.dados.aviso, /só a pessoa/);
  const p1 = await chamar(c, 'propor_caso', { ...caso('Editor persiste valor após recarregar'), requisito: 'RQ-01', risco: 'alto' }); assert.equal(p1.erro, false); assert.equal(p1.dados.estado, 'RASCUNHO'); assert.match(p1.dados.aviso, /Nada foi enviado ao Jira, Qase ou GitHub/);
  const lista = listarPropostas(e.id); assert.equal(lista.length, 1); assert.equal(lista[0].origem, 'IA'); assert.equal(lista[0].cliente, 'claude-teste'); assert.equal(lista[0].estado, 'RASCUNHO');
  const dup = await chamar(c, 'propor_caso', caso('editor persiste valor após recarregar')); assert.equal(dup.erro, true); assert.match(dup.txt, /DUPLICATE_PROPOSAL/); assert.equal(listarPropostas(e.id).length, 1);
  assert.equal((await chamar(c, 'propor_caso', { titulo: 'x', passos: [], publicar: true })).erro, true, 'campos fora do contrato (ex.: publicar) são recusados');
  assert.equal((await chamar(c, 'propor_bug', { resumo: 'Falha ao gravar após recarregar', descricao: 'Passos...', origem: 'SMART-1' })).erro, false); assert.equal(listarPropostas(e.id).filter((p) => p.tipo === 'bug').length, 1);
  salvarConfiguracao(e.id, { especializacoes: ['qa-geral', 'playwright'], politicas: { propor_casos: 'BLOQUEADO', executar_testes: 'BLOQUEADO' } }, 'ana');
  const bloq = await chamar(c, 'propor_caso', caso('Outro caso qualquer')); assert.equal(bloq.erro, true); assert.match(bloq.txt, /POLICY_BLOCKED/); assert.equal(listarPropostas(e.id).length, 2);
  const exec = await chamar(c, 'executar_validacao', { capability: 'unit', solicitarAprovacao: true }); assert.equal(exec.erro, true); assert.match(exec.txt, /POLICY_BLOCKED/, 'bloqueio antes de qualquer pedido de aprovação');
  assert.equal((await chamar(c, 'contexto_projeto')).erro, false, 'o que continua permitido continua funcionando');
  salvarConfiguracao(e.id, { especializacoes: ['qa-geral'], politicas: {} }, 'ana'); assert.match((await chamar(c, 'propor_bug', { resumo: 'Sem especialização que inclua bugs', descricao: '' })).txt, /POLICY_BLOCKED/);
  assert.match((await chamar(c, 'listar_politicas')).dados.configuracao, /personalizada/);
});

test('MCP de pasta sem projeto Prumo: leitura funciona como antes; propor exige projeto Prumo', async (t) => {
  const fx = await fixture(t); const c = await cliente(t, fx.root); assert.equal(espacoDaRaiz(fx.root), null);
  assert.equal((await chamar(c, 'contexto_projeto')).erro, false); const r = await chamar(c, 'propor_caso', caso('Sem projeto Prumo')); assert.equal(r.erro, true); assert.match(r.txt, /NO_WORKSPACE/);
  assert.equal((await chamar(c, 'listar_politicas')).dados.projetoPrumo, null);
});

test('raiz da pasta de automação vinculada resolve o mesmo projeto Prumo', async (t) => {
  const fx = await fixture(t); const e = await criarEspaco({ nome: 'AG-PASTA' }); await pastaEspaco(e.id, fx.root); assert.equal(espacoDaRaiz(fx.root)?.id, e.id);
  const c = await cliente(t, fx.root); assert.equal((await chamar(c, 'propor_caso', caso('Caso pela pasta de automação'))).erro, false); assert.equal(listarPropostas(e.id).length, 1);
});
