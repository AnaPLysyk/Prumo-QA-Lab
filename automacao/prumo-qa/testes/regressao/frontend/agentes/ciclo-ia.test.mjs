import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';

async function preparar(t) {
  const dados = novoDados(t), a = await abrir(t, dados);
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  const projetos = await a.page.evaluate(async () => {
    const itens = [];
    for (const nome of ['Ciclo local A', 'Ciclo local B']) {
      const r = await window.prumo.espacoCriar({ nome });
      if (!r.ok) throw Error(r.error?.message || 'Projeto sintético recusado');
      itens.push(r.data);
    }
    return itens;
  });
  async function selecionar(e) {
    await ir(a.page, 'projetos');
    await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click();
    await a.page.waitForFunction(nome => document.querySelector('#projeto-atual').textContent === nome, e.nome);
    await ir(a.page, 'inicio');
    await a.page.waitForSelector('#chat-input');
  }
  async function perguntar(texto) {
    await a.page.waitForFunction(() => !document.querySelector('#chat-form button[type=submit]').disabled);
    await a.page.fill('#chat-input', texto);
    await a.page.locator('#chat-form button[type=submit]').click();
    await a.page.waitForFunction(() => !document.querySelector('#chat-form button[type=submit]').disabled);
  }
  await selecionar(projetos[0]);
  return { ...a, dados, projetos, selecionar, perguntar };
}

test('ciclo IA desktop: perfil, memória entre Início/flutuante e isolamento ao trocar projeto', async t => {
  const a = await preparar(t);
  await a.perguntar('Pode me chamar de Lia');
  await a.perguntar('QA');
  const perfil = await a.page.evaluate(() => window.prumo.perfilObter());
  assert.equal(perfil.ok, true);
  assert.equal(perfil.data.comoChamar, 'Lia');
  assert.equal(perfil.data.papel, 'qa', 'resposta curta usa pendência do turno anterior');
  await a.page.selectOption('#chat-agente', 'api-rest');
  await a.perguntar('API REST');
  await a.page.selectOption('#chat-agente', '');
  await ir(a.page, 'logs'); await a.page.click('#v36-chat-open');
  assert.match(await a.page.textContent('#v36-float-panel #chat-msgs'), /Pode me chamar de Lia/);
  await a.perguntar('e mais?');
  const atendimentos = await a.page.evaluate(id => window.prumo.conversasListar(id, 'api-rest'), a.projetos[0].id);
  assert.equal(atendimentos.ok, true);
  assert.equal(atendimentos.data.filter(x => x.semTexto).length, 2, 'seguimento conserva agente na mesma sessão');
  for (const item of atendimentos.data) { assert.equal(item.pergunta, ''); assert.deepEqual(item.linhas, []); }
  await a.page.getByRole('button', { name: 'Fechar chat', exact: true }).click();
  await a.selecionar(a.projetos[1]);
  assert.doesNotMatch(await a.page.textContent('#chat-msgs'), /Pode me chamar de Lia|API REST/);
  await a.perguntar('e mais?');
  const outro = await a.page.evaluate(id => window.prumo.conversasListar(id, 'api-rest'), a.projetos[1].id);
  assert.deepEqual(outro.data, [], 'memória do agente não atravessa projetos');
  assert.equal(fs.existsSync(path.join(a.dados, 'conhecimento.db')), false, 'fixture Electron usa memória e não cria banco');
  assert.deepEqual(a.erros, []);
});

test('ciclo IA desktop: conhecimento exige decisão explícita, feedback e Cérebro refletem a decisão', async t => {
  const a = await preparar(t);
  await a.perguntar('Pode me chamar de Lia'); await a.perguntar('Sou QA');
  await a.page.selectOption('#chat-agente', 'qa-geral');
  await a.perguntar('Lembra que o ambiente sintético se chama CicloAlfa');
  const listar = () => a.page.evaluate(id => window.prumo.conhecimentoListar(id, { busca: 'CicloAlfa' }), a.projetos[0].id);
  let itens = await listar(); assert.equal(itens.ok, true); assert.equal(itens.data.length, 1);
  assert.equal(itens.data[0].estado, 'RASCUNHO');
  await a.page.getByRole('button', { name: 'Confirmar aprendizado', exact: true }).click();
  await a.page.waitForFunction(() => !document.querySelector('[data-conhecimento]'));
  itens = await listar(); assert.equal(itens.data[0].estado, 'APROVADO');
  await a.page.getByRole('button', { name: 'Não ajudou', exact: true }).last().click();
  const corrigir = a.page.getByRole('combobox', { name: 'Agente mais adequado' });
  await corrigir.selectOption('monitoramento');
  await a.page.waitForFunction(() => /Agente corrigido/.test(document.querySelector('#chat-msgs').textContent));
  const vocabulario = await a.page.evaluate(() => window.prumo.conhecimentoVocabulario('monitoramento'));
  assert.equal(vocabulario.ok, true); assert.ok(vocabulario.data.length > 0, 'correção explícita ensina termos');
  await ir(a.page, 'agentes'); await a.page.click('[data-agent="qa-geral"]'); await a.page.click('#v36-brain-open');
  await a.page.locator('[data-neuron]').filter({ hasText: 'CicloAlfa' }).click();
  assert.match(await a.page.textContent('.v36-brain-inspect'), /APROVADO/);
  await a.page.getByRole('button', { name: 'Descartar', exact: true }).click();
  await a.page.waitForFunction(() => /DESCARTADO/.test(document.querySelector('[data-neuron*="CicloAlfa"]')?.textContent || ''));
  itens = await listar(); assert.equal(itens.data[0].estado, 'DESCARTADO');
  const outro = await a.page.evaluate(id => window.prumo.conhecimentoListar(id, { busca: 'CicloAlfa' }), a.projetos[1].id);
  assert.deepEqual(outro.data, [], 'conhecimento pertence ao projeto de origem');
  assert.equal(fs.existsSync(path.join(a.dados, 'conhecimento.db')), false);
  assert.deepEqual(a.erros, []);
});
