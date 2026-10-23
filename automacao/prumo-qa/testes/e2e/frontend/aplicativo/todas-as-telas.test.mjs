import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados, ir, abas } from '../../infra/janela.mjs';

// Nível: E2E offline; finalidade: smoke. O aplicativo abre e cada tela do menu desenha conteúdo sem erro de página nem de console.
test('janela abre e todas as telas do menu desenham sem erro', async (t) => {
  const a = await abrir(t, novoDados(t));
  for (const aba of abas) {
    await ir(a.page, aba);
    assert.ok((await a.page.textContent('#conteudo')).trim().length > 0, `${aba} sem conteúdo`);
  }
  // Projetos são o ponto de partida das conexões: não há mais aba Conexões.
  assert.equal(await a.page.locator('#nav button[data-aba="conexoes"]').count(), 0);
  await ir(a.page, 'projetos');
  await a.page.locator('#projetos-vazio').waitFor();
  assert.equal(await a.page.locator('[data-espaco]').count(), 0, 'sem projetos, a bancada inicia vazia');
  for (const nome of ['LAB-ALFA', 'LAB-BETA']) {
    await a.page.click('#espaco-novo');
    await a.page.fill('#espaco-nome', nome);
    await a.page.fill('#espaco-descricao', 'Projeto temporário de automação');
    await a.page.click('#espaco-salvar');
    await a.page.waitForFunction(n => document.querySelector('#projeto-atual')?.textContent === n, nome);
    // O painel de repositório é opcional: algumas versões retornam diretamente à bancada.
    const vincular = a.page.getByRole('heading', { name: 'Escolha o repositório do projeto' });
    if (await vincular.isVisible()) {
      await a.page.getByRole('button', { name: 'Fechar painel e voltar à bancada' }).click();
    }
  }
  const espacos = (await a.page.evaluate(() => window.prumo.espacos())).data;
  const alfa = espacos.find(e => e.nome === 'LAB-ALFA');
  const beta = espacos.find(e => e.nome === 'LAB-BETA');
  assert.ok(alfa && beta && alfa.id !== beta.id, 'cada projeto tem identidade própria');
  assert.ok(!alfa.vinculos.length && !beta.vinculos.length, 'novo projeto não herda conexões');
  assert.equal(await a.page.locator('[data-espaco]').count(), 1, 'somente a bancada do projeto atual');
  await a.page.click('#projetos-trocar');
  assert.equal(await a.page.locator('#projeto-painel:not([hidden]) .ds-proj-opcao').count(), 2);
  await a.page.locator('#projeto-painel .ds-proj-opcao[data-projeto="'+alfa.id+'"]').click();
  await a.page.waitForFunction(() => document.querySelector('#projeto-atual')?.textContent === 'LAB-ALFA');
  assert.equal(await a.page.locator('[data-espaco]').count(), 1);
  // 2.19.0: a troca de projeto fica só no nome do projeto (#projetos-trocar); o botão do núcleo saiu.
  assert.equal(await a.page.locator('#projeto-nucleo-trocar').count(), 0);
  await a.page.locator('.ds-proj-modulo[data-servico="github"] .ds-proj-modulo-emblema').click();
  await a.page.locator('#projeto-painel:not([hidden])').getByText('Nenhuma conta do GitHub conectada').waitFor();
  await a.page.getByRole('button', { name: 'Conectar conta do GitHub' }).click();
  await a.page.getByRole('button', { name: 'Conectar com GitHub' }).waitFor();
  assert.equal(await a.page.locator('#github-token-avancado').evaluate(el => el.open), false,
    'token manual deve ficar recolhido, nunca ser o fluxo principal');
  assert.equal(await a.page.locator('#conexao-token').isVisible(), false,
    'não pedir PAT na ligação normal');
  await a.page.click('#projeto-painel .ds-proj-fechar');
  await a.page.locator('.ds-proj-modulo[data-servico="jira"] .ds-proj-modulo-emblema').click();
  await a.page.locator('#projeto-painel:not([hidden])').getByRole('button', { name: 'Conectar conta do Jira' }).click();
  // "Conectar conta do Jira" abre direto o formulário do Jira, sem misturar outros serviços.
  // 2.19.0: passos do token Jira (gerar e colar); o endereço do site só aparece se o Prumo não o descobrir sozinho.
  await a.page.locator('#projeto-painel #integracao-abrir-jira').waitFor({ state: 'attached' });
  assert.equal(await a.page.locator('#projeto-painel #jira-dados').count(), 1);
  assert.equal(await a.page.locator('#projeto-painel .cx-servico').count(), 0, 'a bolha Jira não mistura formulários de outros serviços');
  assert.equal(await a.page.locator('#conexao-servico').count(), 0);
  await a.page.click('#projeto-painel .ds-proj-fechar');
  assert.equal(await a.page.evaluate(() => { const c=document.querySelector('#conteudo');return c.scrollHeight<=c.clientHeight+2; }), true, 'a bancada não aumenta a página');
  await a.page.click('#projeto-botao');
  assert.match(await a.page.textContent('#projeto-lista'), /LAB-ALFA/);
  assert.match(await a.page.textContent('#projeto-lista'), /LAB-BETA/);
  await a.page.keyboard.press('Escape');
  await a.page.locator('#projeto-lista').waitFor({ state: 'hidden' });
  await ir(a.page, 'tickets');
  assert.equal(await a.page.textContent('#projeto-atual'), 'LAB-ALFA', 'módulos mantêm o projeto selecionado');
  // Com projeto selecionado as telas montam mais coisas. Uma exceção ao montar vira o aviso abaixo e não chega ao console
  // (2.19.0: Agentes caía nele por uma função ainda não commitada), então o aviso é conferido tela a tela.
  for (const aba of abas) {
    await ir(a.page, aba);
    await a.page.waitForTimeout(250);
    assert.equal(await a.page.locator('#tela-falha-carregamento').count(), 0, `${aba} falhou ao carregar com projeto selecionado`);
  }
  assert.deepEqual(a.erros, []);
});
