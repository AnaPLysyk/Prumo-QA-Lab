import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';

/**
 * Cenários de experiência (2.10.2), registrados no Prumo como casos "ux" do projeto Prumo QA: botões que perdem a cor no
 * hover, caixas de seleção desalinhadas, balão do assistente cobrindo controles, barras de rolagem fora do tema e
 * indicador de estado com cor enganosa. Percorre todas as telas visíveis do menu nos temas claro e escuro.
 */
const abasVisiveis = (page) => page.$$eval('#nav [data-aba]', (b) => b.filter((x) => !x.hidden && x.offsetParent).map((x) => x.dataset.aba));
const tema = (page, t) => page.evaluate((x) => { document.documentElement.dataset.tema = x; }, t);

// Contraste WCAG entre o texto e o fundo efetivo (primeiro ancestral com fundo opaco o bastante).
const medir = (el) => {
  // color-mix() devolve color(srgb …), oklab(…) etc.; o canvas converte qualquer formato para RGBA de 0 a 255.
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgb = (s) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = s; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255]; };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let n = el; let fundo = null;
  while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) >= 0.5) { fundo = c; break; } n = n.parentElement; }
  fundo ??= rgb(getComputedStyle(document.body).backgroundColor);
  const texto = rgb(getComputedStyle(el).color); const a = lum(texto), b = lum(fundo);
  return { contraste: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), texto: getComputedStyle(el).color, fundo: `rgb(${fundo.slice(0, 3).join(',')})` };
};

test('UX: botões mantêm cor e contraste ao passar o mouse, em todas as telas e nos dois temas', { timeout: 300000 }, async (t) => {
  const a = await abrir(t, novoDados(t)); const falhas = [];
  for (const t0 of ['escuro', 'claro']) {
    await tema(a.page, t0);
    for (const aba of await abasVisiveis(a.page)) {
      await ir(a.page, aba); await a.page.waitForTimeout(300);
      // Um botão por "tipo visual" (classe) em cada tela, só os visíveis e habilitados dentro da área útil.
      const alvos = await a.page.$$eval('#conteudo button, #conteudo .botao, #conteudo [role=tab]', (bs) => {
        const vistos = new Set(); const r = [];
        bs.forEach((b, i) => { const q = b.getBoundingClientRect(); const chave = b.tagName + '.' + b.className; if (b.disabled || q.width < 8 || q.height < 8 || q.bottom > innerHeight || q.top < 0 || !b.textContent.trim() || vistos.has(chave)) return; vistos.add(chave); b.dataset.uxAlvo = String(i); r.push(String(i)); });
        return r;
      });
      for (const id of alvos) {
        const alvo = a.page.locator(`[data-ux-alvo="${id}"]`);
        try { await alvo.hover({ timeout: 1500 }); } catch { continue; }
        await a.page.waitForTimeout(260); // transições de hover
        // Telas com atualização periódica podem redesenhar o botão entre o hover e a medição: aí ele é pulado.
        const m = await alvo.evaluate(medir, null, { timeout: 1500 }).catch(() => null); if (!m) continue;
        if (m.contraste < 3) falhas.push(`${t0}/${aba}: "${((await alvo.textContent({ timeout: 1500 }).catch(() => '')) || '').trim().slice(0, 30)}" contraste ${m.contraste.toFixed(2)} (texto ${m.texto} sobre ${m.fundo})`);
      }
      await a.page.mouse.move(2, 2);
    }
  }
  assert.deepEqual(falhas, [], 'botões que perdem a cor ou o contraste no hover');
});

test('UX: caixas de seleção alinhadas ao texto, indicador sem pasta neutro e barras de rolagem no tema', async (t) => {
  const a = await abrir(t, novoDados(t));
  await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Sem pasta', descricao: 'UX' }));
  // Indicador "Sem pasta local" não usa a cor de sucesso/identidade de pasta vinculada.
  await ir(a.page, 'projetos');
  const cores = await a.page.$$eval('.proj-vinculo[data-servico] .ds-origem', (os) => os.map((o) => ({ texto: o.textContent.trim(), cor: getComputedStyle(o.querySelector('i')).backgroundColor })));
  const sem = cores.find((c) => /Sem pasta local/.test(c.texto)); assert.ok(sem, 'indicador sem pasta presente');
  const [r, g, b] = sem.cor.match(/\d+/g).map(Number); assert.ok(!(g > r + 40 && g > b + 20), `"Sem pasta local" não pode ser verde (${sem.cor})`);
  // Caixas de seleção da Ajuda › Atualizações: ao lado do texto, na mesma linha.
  await ir(a.page, 'ajuda'); await a.page.click('.indice button:has-text("Atualizações")'); await a.page.waitForSelector('#pref-som');
  const desalinhadas = await a.page.$$eval('#conteudo label:has(input[type=checkbox])', (ls) => ls.flatMap((l) => {
    const cb = l.querySelector('input[type=checkbox]').getBoundingClientRect();
    const textos = [...l.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()); if (!textos.length) return [];
    const rg = document.createRange(); rg.selectNodeContents(textos[0]); const tx = rg.getClientRects()[0]; if (!tx) return [];
    const mesmaLinha = Math.abs((cb.top + cb.bottom) / 2 - (tx.top + tx.bottom) / 2) < 12; const aoLado = cb.right <= tx.left + 2;
    return mesmaLinha && aoLado ? [] : [l.textContent.trim().slice(0, 50)];
  }));
  assert.deepEqual(desalinhadas, [], 'caixas de seleção fora da linha do texto');
  // Barras de rolagem acompanham o tema (sem barra clara padrão no tema escuro).
  for (const t0 of ['escuro', 'claro']) {
    await tema(a.page, t0);
    const cor = await a.page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor);
    assert.notEqual(cor, 'auto', `barra de rolagem sem cor de tema no tema ${t0}`);
  }
});

test('UX: o balão do assistente nunca cobre botões, campos ou links', { timeout: 180000 }, async (t) => {
  const a = await abrir(t, novoDados(t)); const falhas = [];
  for (const aba of await abasVisiveis(a.page)) {
    await ir(a.page, aba);
    const visivel = await a.page.waitForFunction(() => document.querySelector('.v36f-dica')?.dataset.visible === 'true', null, { timeout: 4500 }).then(() => true, () => false);
    if (!visivel) continue;
    const cobertos = await a.page.evaluate(() => {
      const d = document.querySelector('.v36f-dica').getBoundingClientRect();
      return [...document.querySelectorAll('#conteudo button, #conteudo a, #conteudo input, #conteudo select, #conteudo textarea')].filter((el) => {
        const q = el.getBoundingClientRect(); if (!q.width || !q.height) return false;
        return q.left < d.right && q.right > d.left && q.top < d.bottom && q.bottom > d.top;
      }).map((el) => (el.textContent || el.placeholder || el.id).trim().slice(0, 30));
    });
    if (cobertos.length) falhas.push(`${aba}: ${cobertos.join(', ')}`);
  }
  assert.deepEqual(falhas, [], 'controles cobertos pelo balão do assistente');
});
