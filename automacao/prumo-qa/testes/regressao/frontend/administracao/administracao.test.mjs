// Administração na janela real: a documentação viva mostra a árvore de arquivos, o fluxo da tela e o código com a explicação.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';

test('Administração › Documentação viva: arquivo escolhido mostra o código, a explicação e o caminho tela → canal → API', async (t) => {
  const dados = novoDados(t), a = await abrir(t, dados);
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await ir(a.page, 'administracao');
  // 2.11: a Administração abre em Usuários; a documentação viva fica na própria aba.
  await a.page.getByRole('tab', { name: 'Documentação viva' }).click();
  await a.page.waitForSelector('.adm-ide .adm-arvore');
  await a.page.fill('#adm-busca', 'skillsCriar');
  await a.page.click('[data-caminho="backend/agentes/api/skillsCriar.ts"]');
  await a.page.waitForFunction(() => /skillsCriar/.test(document.querySelector('.adm-codigo pre')?.textContent || ''));
  const explicacao = await a.page.textContent('.adm-explica');
  for (const trecho of ['skillsCriar.ts', 'backend/agentes/api/skillsCriar.ts', 'skills:criar']) assert.ok(explicacao.includes(trecho), trecho);
  assert.equal(await a.page.locator('.adm-bolinha.ativo[data-no="backend/agentes/api/skillsCriar.ts"]').count(), 1, 'o arquivo escolhido aparece destacado no fluxo');
  assert.equal(await a.page.locator('.adm-bolinha[data-no="canal:skills:criar"]').count(), 1, 'o canal que leva até ele aparece no caminho');
  const noCaminho = await a.page.locator('.adm-bolinha').count();
  await a.page.click('#adm-fluxo-modo');
  assert.ok(await a.page.locator('.adm-bolinha').count() > noCaminho, 'Tela inteira mostra mais do que o caminho do arquivo');
  await a.page.click('.adm-bolinha[data-no="frontend/agentes/tela-agentes.parte.js"]');
  await a.page.waitForFunction(() => document.querySelector('.adm-arquivo-no.ativo')?.dataset.caminho === 'frontend/agentes/tela-agentes.parte.js');
  fs.mkdirSync(path.join('tmp', 'evidencias', 'telas'), { recursive: true });
  await a.page.screenshot({ path: path.join('tmp', 'evidencias', 'telas', 'administracao-documentacao.png') });
  await a.page.getByRole('tab', { name: 'Sistema' }).click();
  assert.match(await a.page.textContent('#adm-resumo'), /\d+telas/);
  assert.match(await a.page.textContent('#adm-area'), /conta deste computador/);
  assert.deepEqual(a.erros, []);
});
