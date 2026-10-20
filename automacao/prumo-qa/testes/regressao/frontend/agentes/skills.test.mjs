// Skills do agente na janela real: a pessoa vê os trechos, acrescenta um trecho da equipe e decide sobre ele.
// O banco de Skills é trocado por memória (apoio/conhecimento-hook.cjs): nenhum skills.db é criado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';

test('Agentes › Skills: trecho da equipe nasce aprovado, aparece na lista e pode ser descartado', async (t) => {
  const dados = novoDados(t), a = await abrir(t, dados);
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  const projeto = await a.page.evaluate(async () => { const r = await window.prumo.espacoCriar({ nome: 'Skills locais' }); if (!r.ok) throw Error(r.error?.message); return r.data; });
  await ir(a.page, 'projetos');
  await a.page.locator(`[data-espaco="${projeto.id}"]`).getByRole('button', { name: 'Selecionar projeto' }).click();
  await a.page.waitForFunction((nome) => document.querySelector('#projeto-atual').textContent === nome, projeto.nome);

  await ir(a.page, 'agentes'); await a.page.click('[data-agent="api-rest"]');
  await a.page.waitForSelector('#v36-skills-resumo');
  assert.match(await a.page.textContent('#v36-skills-resumo'), /^\d+ aprovados · 0 rascunhos · 0 descartados$/, 'Skills do aplicativo já aprovadas, sem rascunho');

  await a.page.fill('#v36-skill-titulo', 'Contrato da equipe Skilla');
  await a.page.fill('#v36-skill-texto', 'Toda rota nova tem teste de contrato com status 4xx.');
  await a.page.click('#v36-skill-acrescentar');
  const cartao = a.page.locator('.v36a-skill').filter({ hasText: 'Contrato da equipe Skilla' });
  await cartao.waitFor();
  assert.match(await cartao.textContent(), /Da equipe · APROVADO/);
  // Evidência visual (tmp/ não é versionado): a seção Skills com o trecho da equipe.
  fs.mkdirSync(path.join('tmp', 'evidencias', 'telas'), { recursive: true });
  await a.page.locator('#v36-skills-lista').scrollIntoViewIfNeeded();
  await a.page.screenshot({ path: path.join('tmp', 'evidencias', 'telas', 'agentes-skills.png') });

  const lista = await a.page.evaluate(() => window.prumo.skillsListar({ especializacao: 'api-rest', busca: 'Skilla' }));
  assert.equal(lista.ok, true); assert.equal(lista.data.length, 1); assert.equal(lista.data[0].origem, 'PESSOA');

  await cartao.locator('[data-skill-acao="DESCARTADO"]').click();
  await a.page.waitForFunction(() => /1 descartados$/.test(document.querySelector('#v36-skills-resumo')?.textContent || ''));
  const depois = await a.page.evaluate(() => window.prumo.skillsListar({ especializacao: 'api-rest', busca: 'Skilla' }));
  assert.equal(depois.data[0].estado, 'DESCARTADO');

  const invalido = await a.page.evaluate(() => window.prumo.skillsCriar({ especializacao: '../qa', titulo: 'x', texto: 'y' }));
  assert.equal(invalido.ok, false, 'especialização fora do catálogo é recusada pelo contrato IPC');
  assert.equal(fs.existsSync(path.join(dados, 'skills.db')), false);
  assert.deepEqual(a.erros, []);
});
