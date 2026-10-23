// Máquina sem aceleração gráfica (Linux no Xvfb, máquina virtual, GPU bloqueada): sem WebGL, a lista de agentes
// mostra o retrato estático de cada robô e o Three.js não escreve erro no console (2.20.0, reprovava o E2E no Linux).
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir } from '../../infra/janela.mjs';

test('Agentes sem WebGL: retrato estático em cada agente e nenhum erro de console', async (t) => {
  const a = await abrir(t, novoDados(t));
  await a.page.click('#espaco-novo'); await a.page.fill('#espaco-nome', 'SEM-WEBGL'); await a.page.click('#espaco-salvar');
  await a.page.waitForFunction(() => document.querySelector('#projeto-atual')?.textContent === 'SEM-WEBGL');
  // O navegador sem GPU devolve null ao pedir um contexto WebGL; o mesmo vale aqui para todas as telas recarregadas.
  await a.page.context().addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) { return /webgl/.test(tipo) ? null : original.call(this, tipo, ...resto); };
  });
  await a.page.reload();
  await a.page.waitForSelector('[data-aba=inicio][aria-current=page]');
  a.erros.length = 0;
  await ir(a.page, 'agentes');
  await a.page.waitForFunction(() => document.querySelectorAll('.v36a-astro[data-agent]').length > 5);
  await a.page.waitForTimeout(1000);
  assert.equal(await a.page.evaluate(() => document.createElement('canvas').getContext('webgl2')), null, 'o WebGL precisa estar desligado neste teste');
  assert.ok(await a.page.locator('.v36a-astro[data-agent] .v36a-astro-figura > :not(canvas)').count() > 5, 'cada agente mostra o retrato estático');
  assert.deepEqual(a.erros, []);
});
