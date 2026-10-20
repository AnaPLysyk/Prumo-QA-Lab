// Orquestrador observável na janela real: uma pergunta de duas especialidades aparece no Painel de atividades com as etapas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';

test('Agentes › Painel de atividades: orquestração do chat mostra agentes, ordem, estado e tempo de cada etapa', async (t) => {
  const dados = novoDados(t), a = await abrir(t, dados);
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  const projeto = await a.page.evaluate(async () => { const r = await window.prumo.espacoCriar({ nome: 'Orquestração local' }); if (!r.ok) throw Error(r.error?.message); return r.data; });
  await ir(a.page, 'projetos');
  await a.page.locator(`[data-espaco="${projeto.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click();
  await a.page.waitForFunction((nome) => document.querySelector('#projeto-atual').textContent === nome, projeto.nome);

  await ir(a.page, 'inicio'); await a.page.waitForSelector('#chat-input');
  await a.page.waitForFunction(() => !document.querySelector('#chat-form button[type=submit]').disabled);
  await a.page.fill('#chat-input', 'quais falhas aconteceram e como está a regressão?');
  await a.page.locator('#chat-form button[type=submit]').click();
  await a.page.waitForFunction(() => /orquestrou 2 especialistas/.test(document.querySelector('#chat-msgs')?.textContent || ''));
  assert.match(await a.page.textContent('#chat-msgs'), /Consultei 2 especialistas/);

  const lista = await a.page.evaluate((id) => window.prumo.agentesOrquestracoes(id), projeto.id);
  assert.equal(lista.ok, true); assert.equal(lista.data.orquestracoes.length, 1);
  assert.deepEqual(lista.data.orquestracoes[0].etapas.map((e) => e.agente), ['investigacao-bugs', 'regressao']);
  assert.doesNotMatch(JSON.stringify(lista.data), /como está a regressão/, 'o registro não guarda a pergunta');

  await ir(a.page, 'agentes'); await a.page.click('[data-agent-tab="activity"]');
  const item = a.page.locator('.v36a-orq-item').first(); await item.waitFor();
  const texto = await item.textContent();
  assert.match(texto, /1\. Investigação de Bugs[\s\S]*2\. Regressão/); assert.match(texto, /\d+ ms/); assert.match(texto, /Concluída|Parcial|Falhou/);
  fs.mkdirSync(path.join('tmp', 'evidencias', 'telas'), { recursive: true });
  await a.page.screenshot({ path: path.join('tmp', 'evidencias', 'telas', 'agentes-orquestracao.png') });
  assert.deepEqual(a.erros, []);
});
