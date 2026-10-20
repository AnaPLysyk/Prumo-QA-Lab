import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';

// Janela real, perfil temporário: Claude Code e Codex aparecem como opção, nascem não autorizados e o chat responde só com dados locais.
test('chat: Claude Code e Codex listados, não autorizados por padrão; o chat responde localmente e pelo agente escolhido', { timeout: 120000 }, async (t) => {
  const a = await abrir(t, novoDados(t));
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Chat IA Lab', descricao: 'sintético' }))).data;
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click();
  await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'Chat IA Lab');
  const r = await a.page.evaluate((id) => window.prumo.assistenteAgentes(id), e.id);
  assert.equal(r.ok, true); assert.deepEqual(r.data.provedores.map((p) => p.id).sort(), ['claude', 'codex']);
  assert.ok(r.data.provedores.every((p) => p.autorizado === false), 'nenhuma IA externa autorizada de início');
  await ir(a.page, 'inicio'); await a.page.waitForSelector('#chat-input');
  for (const agente of ['', 'api-rest']) {
    await a.page.selectOption('#chat-agente', agente);
    const antes = await a.page.locator('#chat-msgs > *').count();
    await a.page.waitForFunction(() => !document.querySelector('#chat-form button[type=submit]').disabled);
    await a.page.fill('#chat-input', 'O que você sabe deste projeto?'); await a.page.locator('#chat-form button[type=submit]').click();
    await a.page.waitForFunction(() => !document.querySelector('#chat-form button[type=submit]').disabled);
    assert.ok(await a.page.locator('#chat-msgs > *').count() > antes, 'o chat respondeu');
  }
  assert.doesNotMatch(await a.page.textContent('#chat-msgs'), /Claude Code respondeu|Codex respondeu/);
  assert.deepEqual(a.erros, []);
});
