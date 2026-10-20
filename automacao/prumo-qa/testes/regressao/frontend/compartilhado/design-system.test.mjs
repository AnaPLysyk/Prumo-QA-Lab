/** Verifica teclado e carregamento concorrente das abas em Electron com painéis sintéticos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados } from '../../../apoio/janela.mjs';

test('fechamento tardio do diálogo preserva o foco escolhido no menu e restaura o acionador no fluxo normal', async t => {
  const { page } = await abrir(t, novoDados(t));
  const resultado = await page.evaluate(async () => {
    const origem = h('button', { id: 'ds-modal-origem', type: 'button' }, 'Abrir diálogo sintético');
    origem.addEventListener('click', () => DS.modal('Diálogo sintético', h('p', {}, 'Conteúdo sintético')));
    document.querySelector('#conteudo').append(origem);
    const menu = document.querySelector('#nav [data-aba="projetos"]');
    const dialog = document.querySelector('#qualidade-dialog');
    origem.focus(); origem.click();
    const preservado = await new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(document.activeElement === menu), { once: true });
      PrumoQualidadeV39.fecharModal(); menu.focus();
    });
    origem.focus(); origem.click();
    const restaurado = await new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(document.activeElement === origem), { once: true });
      PrumoQualidadeV39.fecharModal();
    });
    return { preservado, restaurado };
  });
  assert.deepEqual(resultado, { preservado: true, restaurado: true });
});

test('Design System: foco único, Home/End, associação ARIA e resposta tardia preservam a aba ativa', async t => {
  const { page, erros } = await abrir(t, novoDados(t));
  await page.evaluate(() => {
    const chamadas = { a: 0, b: 0, c: 0 };
    window.dsTeste = { chamadas };
    const paineis = ['a', 'b', 'c'].map(k => [k, 'Painel ' + k, null, () => {
      chamadas[k]++;
      return k === 'a' ? new Promise(resolve => { window.dsTeste.concluir = () => resolve(h('p', {}, 'Resposta tardia')); }) : h('p', {}, 'Conteúdo ' + k);
    }]);
    const [nav, area] = DS.abasModal(paineis, 'a');
    nav.id = 'ds-teste-abas'; area.id = 'ds-teste-paineis';
    document.querySelector('#conteudo').replaceChildren(nav, area);
  });
  const tabs = page.locator('#ds-teste-abas [role=tab]');
  await tabs.nth(0).focus();
  await page.keyboard.press('End');
  assert.equal(await tabs.nth(2).evaluate(n => n === document.activeElement && n.tabIndex === 0 && n.getAttribute('aria-selected') === 'true'), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.nth(0).evaluate(n => n === document.activeElement), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await tabs.nth(2).evaluate(n => n === document.activeElement), true);
  await page.keyboard.press('Home');
  assert.equal(await tabs.nth(0).evaluate(n => n === document.activeElement), true);
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => window.dsTeste.concluir());
  await page.waitForFunction(() => document.querySelector('[data-painel=a]').textContent === 'Resposta tardia');
  const resultado = await page.evaluate(() => {
    const abas = [...document.querySelectorAll('#ds-teste-abas [role=tab]')];
    return {
      focaveis: abas.filter(n => n.tabIndex === 0).length,
      ativo: abas.find(n => n.getAttribute('aria-selected') === 'true').getAttribute('data-aba-ds'),
      visiveis: [...document.querySelectorAll('#ds-teste-paineis [role=tabpanel]')].filter(n => !n.hidden).map(n => n.dataset.painel),
      ligados: abas.every(n => document.getElementById(n.getAttribute('aria-controls'))?.getAttribute('aria-labelledby') === n.id),
      chamadas: window.dsTeste.chamadas
    };
  });
  assert.deepEqual(resultado, { focaveis: 1, ativo: 'b', visiveis: ['b'], ligados: true, chamadas: { a: 1, b: 1, c: 1 } });
  assert.deepEqual(erros, []);
});
