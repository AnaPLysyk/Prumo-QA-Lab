import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir, abas, ajustes } from '../../../apoio/janela.mjs';
import { fixture } from '../../../apoio/fixtures.mjs';
import { concluirTrabalho as concluir } from '../../../../dist/agendamentos/banco/concluirTrabalho.js';
import { enfileirar } from '../../../../dist/agendamentos/banco/enfileirar.js';
import { pegarProximoTrabalho as reivindicar } from '../../../../dist/agendamentos/banco/pegarProximoTrabalho.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/criarRotina.js';

// Heurística de texto em português: acentos próprios do idioma ou palavras funcionais/de domínio muito comuns.
const PORTUGUES = /[ãõçáéíóúâêôà]|\b(não|para|com|sem|você|projetos?|execuç\w+|nenhum[a]?|selecion\w+|clique|vincul\w+|rotinas?|agendament\w+|pasta|erro|aprova\w+|ainda|todos|todas|desta|deste|nesta|neste|seu|sua|uma?|dos|das|nos|nas|pelo|pela)\b/i;
const visiveis = (page) => page.evaluate(() => {
  const saida = []; const raizes = [document.querySelector('header'), document.querySelector('#conteudo'), document.querySelector('#aviso')].filter(Boolean);
  for (const raiz of raizes) {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (!p || p.closest('pre, code, script, style, [data-i18n-ignore], .ajuda article, .ajuda .indice, option[data-usuario]')) continue; const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length > 1) saida.push(t); }
    for (const el of raiz.querySelectorAll('[aria-label], [title], [placeholder]')) for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v && v.length > 1 && !el.closest('pre, code')) saida.push(a + ':' + v); }
  }
  return [...new Set(saida)];
});

test('inglês: nenhuma tela traz texto de interface em português (dados do usuário e documentos longos ficam como estão)', async (t) => {
  const dados = novoDados(t); const fx = await fixture(t, { commands: { unit: 'node tests/test.mjs' } }); await fx.write('tests/test.mjs', 'console.log("ok");');
  const a = await abrir(t, dados, [], {}, { inicio: true });
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'ENG-LAB', descricao: 'synthetic' }))).data;
  const r = criarRotina({ nome: 'Nightly smoke', espacoId: e.id, tipo: 'smoke', capability: 'unit', ambiente: 'local', ticket: 'ENG-1', frequencia: { tipo: 'semanal', dias: [1, 3], hora: '09:30' }, fuso: 'America/Sao_Paulo' }, dados);
  for (const [i, res] of [{ status: 'PASS', motivo: 'ok', contagem: { pass: 2, fail: 0, blocked: 0, notRun: 0 }, evidenciaId: '33333333-3333-4333-8333-333333333333' }, { status: 'FAIL', motivo: 'process failure', contagem: { pass: 1, fail: 1, blocked: 0, notRun: 0 }, detalhes: 'C2: expected value' }, { status: 'BLOCKED', motivo: 'HUMAN_APPROVAL_REQUIRED: none' }].entries()) {
    const { trabalho } = enfileirar({ chave: 'i' + i, rotinaId: r.id, espacoId: e.id, tipo: 'smoke', capability: 'unit', ambiente: 'local', ticket: 'ENG-1', origem: i % 2 ? 'MANUAL' : 'AGENDA', slot: null }, dados); reivindicar(dados); concluir(trabalho.id, res, dados);
  }
  await ajustes(a.page); await a.page.selectOption('#idioma', 'en'); await a.page.waitForFunction(() => document.querySelector('[data-aba=agenda]').textContent.trim() === 'Schedules');
  const achados = [];
  for (const selecionado of [false, true]) {
    if (selecionado) { await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: /Select project/ }).click(); await a.page.waitForFunction(() => document.querySelector('#projeto-atual').textContent === 'ENG-LAB'); }
    for (const aba of abas) {
      await ir(a.page, aba); await a.page.waitForTimeout(250);
      if (aba === 'agenda') { await a.page.click('#rotina-nova'); await a.page.selectOption('#rotina-tipo', 'k6'); await a.page.selectOption('#rotina-freq', 'semanal'); }
      if (aba === 'execucoes') { const d = a.page.locator('#runs-tabela td.ds-acao button').first(); if (await d.count()) await d.click(); }
      for (const texto of await visiveis(a.page)) if (PORTUGUES.test(texto)) achados.push(`[${aba}${selecionado ? ' +projeto' : ''}] ${texto.slice(0, 700)}`);
    }
  }
  assert.deepEqual([...new Set(achados)], [], 'textos ainda em português com o idioma inglês');
  assert.deepEqual(a.erros, []);
});
