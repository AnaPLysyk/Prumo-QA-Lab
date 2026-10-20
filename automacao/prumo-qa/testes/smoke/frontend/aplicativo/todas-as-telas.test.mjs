import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir, abas } from '../../../apoio/janela.mjs';

// Fumaça da interface: o aplicativo abre e cada tela do menu desenha conteúdo sem erro de página nem de console.
test('janela abre e todas as telas do menu desenham sem erro', async (t) => {
  const a = await abrir(t, novoDados(t));
  for (const aba of abas) {
    await ir(a.page, aba);
    assert.ok((await a.page.textContent('#conteudo')).trim().length > 0, `${aba} sem conteúdo`);
  }
  assert.deepEqual(a.erros, []);
});
