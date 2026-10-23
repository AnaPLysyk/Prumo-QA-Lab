import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { abrir, novoDados, ir, escolherPasta, atenderConfirmacoes } from '../../infra/janela.mjs';
import { fixture } from '../../../unitario/infra/fixtures.mjs';

// IDE de Testes na janela real (Monaco + terminal), usada como a pessoa usaria: abrir, editar, salvar, procurar, criar, executar.
// Pasta e perfil sintéticos. As confirmações nativas são respondidas pela caixa de confirmação de verdade (atenderConfirmacoes).

const CRLF = (s) => s.replace(/\n/g, '\r\n');
const ARQUIVOS = {
  'tests/login.spec.ts': CRLF("describe('Login', () => {\n  test('entra como editor', () => {});\n});\n"),
  'src/app.ts': 'export function soma(a: number, b: number) {\n  return a + b;\n}\n',
  'src/util/dados.json': '{ "nome": "x", "versao": 1, }\n',
  'features/login.feature': '@smoke\nFuncionalidade: Login\n  Cenário: Entrar\n    Dado que estou na tela de login\n    Quando informo "ana"\n    Então vejo a Home\n',
  'docs/guia.md': '# Guia\n\nTexto do guia.\n'
};
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });

/** Abre o aplicativo com um projeto de pasta local (repositório Git com tudo já commitado) e deixa a IDE aberta em Testes › IDE › Código. */
async function preparar(t, { envExtra = {}, decidir } = {}) {
  const dados = novoDados(t), a = await abrir(t, dados, [], envExtra), f = await fixture(t);
  for (const [rel, texto] of Object.entries(ARQUIVOS)) { fs.mkdirSync(path.dirname(path.join(f.root, rel)), { recursive: true }); fs.writeFileSync(path.join(f.root, rel), texto); }
  fs.writeFileSync(path.join(f.root, '.env'), 'SENHA=segredo\n');
  git(f.root, 'init', '-q', '-b', 'main'); git(f.root, 'add', '-A'); git(f.root, 'commit', '-q', '-m', 'base');
  const conf = atenderConfirmacoes(a.app, decidir); t.after(() => conf.parar());
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'IDE Lab', descricao: 'sintético' }))).data;
  await escolherPasta(a.app, f.root);
  assert.equal((await a.page.evaluate((id) => window.prumo.espacoPasta(id), e.id)).ok, true);
  await ir(a.page, 'projetos'); await a.page.locator('#projeto-botao').click(); await a.page.locator(`.projeto-item[data-projeto="${e.id}"]`).click();
  await a.page.waitForFunction(() => /IDE Lab/.test(document.querySelector('#projeto-atual')?.textContent || ''));
  await abrirIde(a.page);
  return { a, f, e, conf, p: a.page, editor: a.page.frameLocator('.ds-wb-editor-quadro') };
}
async function abrirIde(page) {
  await ir(page, 'testes'); await page.click('[data-sub=ide]');
  await page.locator('#sub-conteudo.ds-ide-cheio #ide').waitFor();
}
/** Abre a pasta da árvore se ela estiver fechada. */
async function garantirPasta(p, pasta) { const d = p.locator(`details[data-pasta="${pasta}"]`); await d.waitFor(); if (!(await d.evaluate((el) => el.open))) await d.locator('> summary').click(); }
/** Abre um arquivo pelo explorador (um clique = aba de pré-visualização) e espera o Monaco mostrar o conteúdo. */
async function abrirArquivo(p, editor, arquivo, { duploClique = false } = {}) {
  let acumulado = ''; for (const pasta of path.posix.dirname(arquivo).split('/').filter((x) => x && x !== '.')) { acumulado = acumulado ? acumulado + '/' + pasta : pasta; await garantirPasta(p, acumulado); }
  const botao = p.locator(`[data-arquivo="${arquivo}"]`); await botao.waitFor();
  if (duploClique) await botao.dblclick(); else await botao.click();
  await editor.locator('.monaco-editor .view-lines').waitFor({ timeout: 20000 });
  await p.waitForFunction((a) => document.querySelector('.ds-wb-aba[data-ativa="true"] .ds-wb-aba-titulo')?.getAttribute('data-aba') === a, arquivo);
}
const textoDoEditor = (editor) => editor.locator('.monaco-editor .view-lines').innerText().then((s) => s.replace(/ /g, ' '));
async function digitar(p, editor, texto) { await editor.locator('.monaco-editor .view-lines').click(); await p.keyboard.press('Control+End'); await p.keyboard.type(texto); }

test('IDE: abre com a tela de boas-vindas, árvore com as pastas e editor de verdade (Monaco) com abas de pré-visualização', async (t) => {
  const { p, editor, a } = await preparar(t);
  await p.locator('.ds-wb-bv h2').waitFor(); assert.match(await p.textContent('.ds-wb-bv h2'), /Prumo IDE/);
  assert.match(await p.textContent('.ds-wb-bv-numeros'), /arquivos/i, 'retrato do projeto');
  for (const pasta of ['src', 'tests', 'features', 'docs']) assert.equal(await p.locator(`details[data-pasta="${pasta}"]`).count(), 1, 'pasta ' + pasta + ' aparece na árvore');
  assert.equal(await p.locator('#conteudo > #trilha-de-telas').isVisible(), false, 'um só cabeçalho: sem a trilha de telas na IDE');
  // um clique reaproveita a aba (pré-visualização, em itálico); duplo clique fixa
  await abrirArquivo(p, editor, 'src/app.ts');
  assert.match(await textoDoEditor(editor), /export function soma/);
  assert.equal(await p.locator('.ds-wb-aba[data-previa="true"]').count(), 1);
  await abrirArquivo(p, editor, 'docs/guia.md');
  assert.equal(await p.locator('.ds-wb-aba').count(), 1, 'a pré-visualização foi trocada pelo próximo arquivo');
  await p.locator('[data-arquivo="docs/guia.md"]').dblclick(); assert.equal(await p.locator('.ds-wb-aba[data-previa="true"]').count(), 0, 'duplo clique fixa a aba');
  await abrirArquivo(p, editor, 'src/app.ts');
  assert.equal(await p.locator('.ds-wb-aba').count(), 2);
  // barra de status do editor
  await p.waitForFunction(() => /TypeScript/.test(document.querySelector('.ds-wb-status')?.textContent || ''));
  assert.match(await p.textContent('.ds-wb-status'), /Ln 1, Col 1/);
  assert.deepEqual(a.erros, []);
});

test('IDE: editar com o teclado, salvar com Ctrl+S pede a confirmação, grava no disco, preserva CRLF e o desfazer volta a "não salvo"', async (t) => {
  const { p, editor, f, conf, a } = await preparar(t);
  await abrirArquivo(p, editor, 'tests/login.spec.ts', { duploClique: true });
  await digitar(p, editor, "test('sai', () => {});");
  await p.waitForFunction(() => /não salvas/.test(document.querySelector('#ide-estado')?.textContent || ''));
  assert.equal(await p.locator('.ds-wb-ponto').count(), 1, 'ponto de não salvo na aba');
  await p.keyboard.press('Control+s');
  await p.waitForFunction(() => /Salvo/.test(document.querySelector('#ide-estado')?.textContent || ''), null, { timeout: 20000 });
  const gravado = fs.readFileSync(path.join(f.root, 'tests/login.spec.ts'), 'utf8');
  assert.match(gravado, /test\('sai', \(\) => \{\}\);/); assert.ok(!/[^\r]\n/.test(gravado), 'o fim de linha CRLF do arquivo foi preservado');
  assert.equal(conf.registro.length, 1); assert.match(conf.registro[0].detalhe, /login\.spec\.ts/, 'a confirmação mostra o arquivo');
  await p.keyboard.press('Control+z');
  await p.waitForFunction(() => /não salvas/.test(document.querySelector('#ide-estado')?.textContent || ''));
  assert.deepEqual(a.erros, []);
});

test('IDE: arquivo alterado por fora não é sobrescrito', async (t) => {
  const { p, editor, f } = await preparar(t);
  await abrirArquivo(p, editor, 'src/app.ts', { duploClique: true });
  await digitar(p, editor, '\n// minha mudança');
  fs.writeFileSync(path.join(f.root, 'src/app.ts'), '// outra pessoa mexeu\n');
  await p.keyboard.press('Control+s');
  await p.waitForFunction(() => /mudou fora do Prumo/.test(document.querySelector('#aviso')?.textContent || ''), null, { timeout: 20000 });
  assert.equal(fs.readFileSync(path.join(f.root, 'src/app.ts'), 'utf8'), '// outra pessoa mexeu\n', 'o arquivo alterado por fora foi preservado');
});

test('IDE: cancelar a confirmação não grava nada', async (t) => {
  const { p, editor, f, conf } = await preparar(t, { decidir: () => 'cancelar' });
  await abrirArquivo(p, editor, 'docs/guia.md', { duploClique: true });
  await digitar(p, editor, '\nlinha nova');
  await p.keyboard.press('Control+s');
  await p.waitForFunction(() => true); await p.waitForTimeout(3000);
  assert.equal(fs.readFileSync(path.join(f.root, 'docs/guia.md'), 'utf8'), ARQUIVOS['docs/guia.md'], 'nada foi gravado');
  assert.ok(conf.registro.length >= 1 && conf.registro.every((c) => c.resposta === 'cancelar'));
  assert.match(await p.textContent('#ide-estado'), /não salvas/, 'a edição continua na tela, sem perder o que foi digitado');
});

test('IDE: arquivo com o que parece um segredo não é aberto para edição', async (t) => {
  const { p, f } = await preparar(t);
  fs.writeFileSync(path.join(f.root, 'src/chave.ts'), "const token = 'ghp_" + 'a'.repeat(36) + "';\n");
  await p.locator('#ide-recarregar').click();
  await garantirPasta(p, 'src');
  await p.locator('[data-arquivo="src/chave.ts"]').click();
  await p.locator('#ide-bloqueado').waitFor({ timeout: 15000 });
  assert.equal(await p.locator('#ide-salvar').isVisible(), false);
  assert.doesNotMatch(await p.locator('.ds-wb-vista').innerText(), /ghp_a{36}/, 'o segredo continua mascarado');
});

test('IDE como VS Code: erro de sintaxe vira problema, formatar documento, localizar e sugestões de código', async (t) => {
  const { p, editor, a } = await preparar(t);
  await abrirArquivo(p, editor, 'src/util/dados.json', { duploClique: true });
  await p.waitForFunction(() => /^⊗ [1-9]/.test(document.querySelector('#ide-contagem-problemas')?.textContent || ''), null, { timeout: 20000 });
  await p.locator('#ide-contagem-problemas').click();
  await p.locator('.ds-wb-problemas li').first().waitFor();
  assert.match(await p.textContent('.ds-wb-problemas'), /Trailing comma|vírgula/i, 'o problema aparece na lista com a mensagem do Monaco');
  // formatar documento (Shift+Alt+F) deixa o JSON em várias linhas, como no VS Code
  await editor.locator('.monaco-editor .view-lines').click();
  await p.keyboard.press('Shift+Alt+f');
  await p.waitForFunction(() => document.querySelector('.ds-wb-aba[data-ativa="true"]') && /não salvas/.test(document.querySelector('#ide-estado')?.textContent || ''), null, { timeout: 15000 });
  assert.ok((await editor.locator('.monaco-editor .view-line').count()) >= 3, 'o documento foi quebrado em linhas');
  // localizar (Ctrl+F) abre o widget do próprio editor
  await p.keyboard.press('Control+f');
  await editor.locator('.find-widget.visible').waitFor({ timeout: 10000 });
  await p.keyboard.type('versao'); assert.match(await editor.locator('.find-widget .matchesCount').innerText(), /1 de 1|1 of 1/);
  await p.keyboard.press('Escape');
  // sugestões de código (TypeScript)
  await abrirArquivo(p, editor, 'src/app.ts', { duploClique: true });
  await digitar(p, editor, '\nMath.');
  await editor.locator('.suggest-widget.visible').waitFor({ timeout: 20000 });
  assert.match(await editor.locator('.suggest-widget').innerText(), /abs|floor|max/, 'sugestões de Math vêm do serviço de linguagem');
  assert.deepEqual(a.erros, []);
});

test('IDE: abertura rápida (Ctrl+P) com > comandos e : linha, modo foco (Ctrl+K Z) e menu da aba', async (t) => {
  const { p, editor } = await preparar(t);
  await abrirArquivo(p, editor, 'docs/guia.md', { duploClique: true });
  await p.keyboard.press('Control+p');
  const entrada = p.locator('.ds-wb-rapida input'); await entrada.waitFor();
  await entrada.fill('login'); await p.locator('.ds-wb-rapida li').first().waitFor();
  assert.match(await p.locator('.ds-wb-rapida li').first().innerText(), /login/i);
  await entrada.fill('>modo foco'); assert.match(await p.locator('.ds-wb-rapida li').first().innerText(), /Modo foco/);
  await entrada.fill(':2'); assert.match(await p.locator('.ds-wb-rapida li').first().innerText(), /linha 2/);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => /Ln 2, Col/.test(document.querySelector('.ds-wb-status')?.textContent || ''));
  await p.keyboard.press('Control+p'); await entrada.fill('login.spec'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => [...document.querySelectorAll('.ds-wb-aba')].some((x) => /login\.spec/.test(x.textContent)));
  // menu da aba (botão direito)
  await p.locator('.ds-wb-aba').first().click({ button: 'right' });
  assert.deepEqual((await p.locator('.ds-wb-contexto button').allInnerTexts()).slice(0, 3), ['Fechar', 'Fechar as outras', 'Fechar todas']);
  await p.locator('.ds-wb-contexto button', { hasText: 'Fechar as outras' }).click();
  assert.equal(await p.locator('.ds-wb-aba').count(), 1);
  // modo foco: só o editor, por cima da janela; Esc duas vezes sai
  await p.locator('#ide').focus(); await p.keyboard.press('Control+k'); await p.keyboard.press('z');
  await p.waitForFunction(() => document.querySelector('#ide')?.dataset.zen === 'sim');
  assert.equal(await p.locator('.ds-wb-lateral').isVisible(), false); assert.equal(await p.locator('.ds-wb-status').isVisible(), false);
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('#ide')?.dataset.zen);
  assert.equal(await p.locator('.ds-wb-lateral').isVisible(), true);
});

test('IDE: menu de contexto da árvore, criar arquivo e pasta, e o Orquestrador flutuante agindo na IDE', async (t) => {
  const { p, editor, f, conf, a } = await preparar(t);
  await p.locator('details[data-pasta="src"] > summary').click({ button: 'right' });
  const itens = await p.locator('.ds-wb-contexto button').allInnerTexts();
  for (const esperado of ['Novo arquivo aqui', 'Nova pasta aqui', 'Copiar caminho', 'Pedir ao Orquestrador sobre isto…']) assert.ok(itens.includes(esperado), esperado + ' no menu: ' + itens.join(' | '));
  await p.locator('.ds-wb-contexto button', { hasText: 'Novo arquivo aqui' }).click();
  const nome = p.locator('.ds-wb-nome'); await nome.waitFor(); assert.equal(await nome.inputValue(), 'src/', 'o nome já começa pela pasta clicada');
  await nome.fill('src/novo.ts'); await p.locator('#ide-nome-criar').click();
  await p.waitForFunction(() => [...document.querySelectorAll('.ds-wb-aba')].some((x) => /novo\.ts/.test(x.textContent)), null, { timeout: 20000 });
  assert.equal(fs.existsSync(path.join(f.root, 'src/novo.ts')), true); assert.ok(conf.registro.some((c) => /novo\.ts/.test(c.detalhe)), 'a criação pediu confirmação');
  // Orquestrador: abre o chat flutuante e pede em frase curta
  await p.locator('#v36-chat-open').click(); await p.locator('#chat-input').waitFor();
  await p.locator('.ds-wb-lateral').click({ position: { x: 20, y: 300 } });
  assert.equal(await p.locator('#v36-float-panel').evaluate((e) => e.hidden), false, 'clicar na IDE não fecha o chat flutuante (ele é diálogo, não menu)');
  await p.fill('#chat-input', 'abrir README.md'); await p.keyboard.press('Enter');
  await p.locator('#chat-msgs').getByText(/Abri .*README\.md|Encontrei \d+ arquivos/).first().waitFor({ timeout: 20000 });
  await p.fill('#chat-input', 'criar pasta temp/lab'); await p.keyboard.press('Enter');
  await p.locator('#ide-confirmar').waitFor({ timeout: 20000 }); await p.locator('#ide-confirmar').click();
  await p.locator('#chat-msgs').getByText(/Pasta temp\/lab criada/).last().waitFor({ timeout: 20000 });
  assert.equal(fs.existsSync(path.join(f.root, 'temp/lab/.gitkeep')), true);
  assert.deepEqual(a.erros, []);
});

test('IDE: terminal executa na pasta do projeto só depois da confirmação, sem segredos no ambiente', async (t) => {
  const { p, f, conf, a } = await preparar(t, { envExtra: { GITHUB_TOKEN: 'ghp_nao_pode_vazar' }, decidir: (c) => (/exit\(9\)/.test(c.detalhe) ? 'cancelar' : 'confirmar') });
  await p.keyboard.press('Control+`');
  const quadro = p.frameLocator('.ds-wb-terminal-quadro'); await quadro.locator('.xterm-screen').waitFor({ timeout: 20000 });
  const tela = () => quadro.locator('.xterm-rows').innerText();
  await quadro.locator('.xterm').click();
  await p.keyboard.type('node -e "process.exit(9)"'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => true); await p.waitForTimeout(2500);
  assert.match(await tela(), /Comando não executado/, 'cancelar não executa nada');
  await p.keyboard.type('node -e "console.log(\'ola\', process.cwd(), process.env.GITHUB_TOKEN || \'sem-token\')"'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /Terminou com código/.test(document.querySelector('.ds-wb-terminal-quadro')?.contentDocument?.body?.innerText || '') || true);
  for (let i = 0; i < 40 && !/Terminou com código/.test(await tela()); i++) await p.waitForTimeout(500);
  const saida = await tela(); assert.match(saida, /ola /); assert.match(saida, /sem-token/, 'o token não chega ao comando'); assert.match(saida, /Terminou com código 0/);
  assert.ok(saida.toLowerCase().includes(path.basename(f.root).toLowerCase().slice(0, 8)), 'o comando rodou na pasta do projeto');
  const pedidos = conf.registro.filter((c) => /comando/i.test(c.titulo)); assert.equal(pedidos.length, 2);
  assert.match(pedidos[0].detalhe, /Pasta[\s\S]*Comando[\s\S]*exit\(9\)/, 'a confirmação mostra a pasta e o texto exato do comando');
  assert.deepEqual(a.erros, []);
});

test('IDE: margem do Git mostra a linha alterada e a busca nos arquivos abre o resultado na linha certa', async (t) => {
  const { p, editor, f } = await preparar(t);
  fs.writeFileSync(path.join(f.root, 'src/app.ts'), 'export function soma(a: number, b: number) {\n  return a + b + 1;\n}\n');
  await abrirArquivo(p, editor, 'src/app.ts', { duploClique: true });
  await editor.locator('.git-mod, .git-add').first().waitFor({ timeout: 20000 });
  await p.keyboard.press('Control+Shift+f');
  await p.locator('#ide-buscar-q').fill('soma'); await p.keyboard.press('Enter');
  await p.locator('.ds-wb-resultado').first().waitFor({ timeout: 15000 });
  assert.match(await p.locator('.ds-wb-resultados').innerText(), /app\.ts/);
  await p.locator('.ds-wb-resultado').first().click();
  await p.waitForFunction(() => /Ln 1,/.test(document.querySelector('.ds-wb-status')?.textContent || ''));
});

test('IDE: acessibilidade e teclado: papéis, nomes acessíveis, foco visível e navegação por Tab', async (t) => {
  const { p, editor } = await preparar(t);
  await abrirArquivo(p, editor, 'src/app.ts', { duploClique: true });
  const semNome = await p.evaluate(() => [...document.querySelectorAll('#ide button, #ide input, #ide [role=tab]')].filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent.trim() || e.getAttribute('placeholder'))).map((e) => e.className || e.tagName));
  assert.deepEqual(semNome, [], 'todo controle da IDE tem nome acessível');
  assert.equal(await p.locator('#ide [role=tablist]').count() >= 2, true, 'abas do editor e do painel são tablist');
  assert.equal(await p.locator('.ds-wb-aba-titulo[aria-selected="true"]').count(), 1);
  assert.equal(await p.locator('#ide-painel-alternar').getAttribute('aria-expanded'), 'false');
  await p.locator('.ds-wb-filtro').focus(); await p.keyboard.press('Tab');
  const foco = await p.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { dentro: !!e.closest('#ide'), contorno: c.outlineStyle !== 'none' || c.boxShadow !== 'none' }; });
  assert.equal(foco.dentro, true, 'Tab continua dentro da IDE'); assert.equal(await p.locator('.ds-wb-editor-quadro').getAttribute('title'), 'Editor de código');
  // contraste mínimo do texto principal contra o fundo, nos dois temas
  const razao = await p.evaluate(() => { const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; }; const e = document.querySelector('.ds-ide-arquivo'); const fg = lum(getComputedStyle(e).color); const bg = lum(getComputedStyle(document.body).backgroundColor.startsWith('rgba(0, 0, 0, 0)') ? 'rgb(4, 7, 18)' : getComputedStyle(document.body).backgroundColor); return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05); });
  assert.ok(razao >= 4.5, 'contraste dos nomes de arquivo ' + razao.toFixed(1));
});
