/** Bug de 21/10/2026: com "Seguir sistema" e o Windows claro, trocar a cor de destaque não mudava nada (só Claro/Escuro funcionavam). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados } from '../../infra/janela.mjs';

// Cores esperadas de --acento: versão clara (sistema claro) e escura (sistema escuro), tokens de frontend/design-system/qc.css.
const CORES = { light: { Violeta: '#6d3fd8', Rosa: '#b8286f', Azul: '#1f56b8' }, dark: { Violeta: '#a78bfa', Rosa: '#f472b6', Azul: '#6ea8ff' } };
const acento = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--acento').trim().toLowerCase());

test('Aparência: em "Seguir sistema" a cor de destaque muda com o sistema claro e com o escuro', async (t) => {
  const a = await abrir(t, novoDados(t));
  // Locators pelo que a pessoa vê e pelo leitor de tela: papel + nome acessível, sem classes de estilo.
  await a.page.getByRole('button', { name: 'Ajustes' }).click();
  const tema = a.page.getByRole('combobox', { name: 'Tema' });
  const cores = a.page.getByRole('radiogroup', { name: 'Cor de destaque' });
  await tema.selectOption('sistema');
  for (const esquema of ['light', 'dark']) {
    await a.page.emulateMedia({ colorScheme: esquema });
    for (const [nome, esperado] of Object.entries(CORES[esquema])) {
      const opcao = cores.getByRole('radio', { name: nome });
      await opcao.click();
      assert.equal(await opcao.getAttribute('aria-checked'), 'true', `${nome} marcado (${esquema})`);
      assert.equal(await acento(a.page), esperado, `--acento com ${nome} em "Seguir sistema" (${esquema})`);
    }
  }
  // Claro escolhido continua igual ao claro do sistema: a mesma cor nos dois caminhos.
  await tema.selectOption('claro');
  await cores.getByRole('radio', { name: 'Violeta' }).click();
  assert.equal(await acento(a.page), CORES.light.Violeta);
  assert.deepEqual(a.erros, []);
});
