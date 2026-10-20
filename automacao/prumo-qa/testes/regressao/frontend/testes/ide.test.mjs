import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, escolherPasta } from '../../../apoio/janela.mjs';
import { fixture } from '../../../apoio/fixtures.mjs';

// IDE de Testes na janela real: editar, criar e salvar arquivos de teste da pasta vinculada. Pasta e perfil sintéticos;
// a confirmação nativa do Windows é um double do runner (que também registra se ela foi pedida).
async function preparar(t) {
  const dados = novoDados(t), a = await abrir(t, dados), f = await fixture(t);
  await a.app.evaluate(({ dialog }) => { globalThis.__confirmacoes = []; dialog.showMessageBox = async (_j, o) => { globalThis.__confirmacoes.push(o.title || o.message); return { response: 1, checkboxChecked: false }; }; });
  const e = (await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'IDE Lab', descricao: 'sintético' }))).data;
  await f.write('tests/login.spec.ts', "describe('Login', () => {\r\n  test('entra como editor', () => {});\r\n});\r\n");
  await escolherPasta(a.app, f.root); assert.equal((await a.page.evaluate((id) => window.prumo.espacoPasta(id), e.id)).ok, true);
  await ir(a.page, 'projetos'); await a.page.locator(`[data-espaco="${e.id}"]`).getByRole('button', { name: /Selecionar projeto|Projeto selecionado/ }).click();
  await a.page.waitForFunction(() => /IDE Lab/.test(document.querySelector('#projeto-atual')?.textContent || ''));
  return { a, f, e };
}
const confirmacoes = (a) => a.app.evaluate(() => globalThis.__confirmacoes);
const cm = (page) => page.locator('.ds-ide-cm .CodeMirror');

test('IDE: editar um arquivo existente pede confirmação nativa, grava no disco e mantém CRLF', async (t) => {
  const { a, f } = await preparar(t);
  await ir(a.page, 'testes'); await a.page.click('[data-sub=ide]');
  await a.page.locator('#sub-conteudo.ds-ide-cheio').waitFor(); assert.equal(await a.page.locator('#sub-conteudo.ds-ide-cheio').count(), 1, 'a IDE usa a tela inteira');
  assert.equal(await a.page.locator('#conteudo .ds-cab h1').count(), 0, 'sem título na IDE');
  await a.page.click('#ide-editar'); await cm(a.page).waitFor();
  assert.match(await a.page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()), /entra como editor/);
  await a.page.evaluate(() => { const c = document.querySelector('.CodeMirror').CodeMirror; c.replaceRange("  test('sai', () => {});\n", { line: 2, ch: 0 }); });
  assert.match(await a.page.textContent('#ide-estado'), /não salvas/);
  await a.page.click('#ide-salvar'); await a.page.waitForFunction(() => /Salvo/.test(document.querySelector('#ide-estado')?.textContent || ''));
  assert.equal(fs.readFileSync(path.join(f.root, 'tests/login.spec.ts'), 'utf8'), "describe('Login', () => {\r\n  test('entra como editor', () => {});\r\n  test('sai', () => {});\r\n});\r\n");
  assert.deepEqual(await confirmacoes(a), ['Salvar arquivo de teste'], 'a confirmação nativa foi pedida uma vez');
  assert.deepEqual(a.erros, []);
});

test('IDE: arquivo alterado por fora não é sobrescrito', async (t) => {
  const { a, f } = await preparar(t);
  await ir(a.page, 'testes'); await a.page.click('[data-sub=ide]'); await a.page.click('#ide-editar'); await cm(a.page).waitFor();
  fs.writeFileSync(path.join(f.root, 'tests/login.spec.ts'), "describe('Outra pessoa', () => { test('x', () => {}); });\n");
  await a.page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('conteudo meu'));
  await a.page.click('#ide-salvar'); await a.page.waitForFunction(() => /mudou fora do Prumo/.test(document.querySelector('#aviso')?.textContent || ''));
  assert.match(fs.readFileSync(path.join(f.root, 'tests/login.spec.ts'), 'utf8'), /Outra pessoa/, 'o arquivo alterado por fora foi preservado');
});

test('IDE: novo arquivo ligado a um caso do Qase cria a anotação e abre para edição', async (t) => {
  const { a, f } = await preparar(t);
  await ir(a.page, 'testes'); await a.page.click('[data-sub=ide]'); await a.page.click('#ide-novo');
  await a.page.fill('#ide-novo-caminho', 'tests/e2e/checkout.spec.ts'); await a.page.fill('#ide-novo-titulo', 'Paga com cartão');
  await a.page.click('#ide-novo-criar');
  await a.page.waitForFunction(() => !!document.querySelector('.ds-ide-cm .CodeMirror'));
  const texto = fs.readFileSync(path.join(f.root, 'tests/e2e/checkout.spec.ts'), 'utf8');
  assert.match(texto, /test\("Paga com cartão"/); assert.deepEqual(await confirmacoes(a), ['Criar arquivo de teste']);
  await a.page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('x'));
  assert.equal((await a.page.evaluate(() => window.prumo.testesGravar(document.querySelector('[data-espaco]')?.dataset.espaco || '00000000-0000-4000-8000-000000000000', '../fora.spec.ts', 'x', null))).ok, false, 'caminho fora da pasta é recusado');
  assert.equal(fs.existsSync(path.join(path.dirname(f.root), 'fora.spec.ts')), false);
});

test('IDE: arquivo com o que parece um segredo não é aberto para edição', async (t) => {
  const { a, f } = await preparar(t);
  await f.write('tests/seg.spec.ts', "const token = 'ghp_" + 'a'.repeat(36) + "';\ntest('usa token', () => {});\n");
  await ir(a.page, 'testes'); await a.page.click('[data-sub=ide]'); await a.page.locator('[data-arquivo="tests/seg.spec.ts"]').click();
  await a.page.locator('#ide-bloqueado').waitFor(); assert.equal(await a.page.locator('#ide-editar').count(), 0);
  assert.doesNotMatch(await a.page.textContent('.ds-ide-linhas'), /ghp_a{36}/, 'o segredo continua mascarado');
});

test('Pipelines CI/CD: lista os workflows do repositório do projeto, edita e cria com confirmação nativa', async (t) => {
  const { a, f } = await preparar(t);
  await f.write('.github/workflows/ci.yml', 'name: CI do projeto\non:\n  push:\n    branches: [main]\njobs:\n  testes:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n').catch(async () => { fs.mkdirSync(path.join(f.root, '.github/workflows'), { recursive: true }); await f.write('.github/workflows/ci.yml', 'name: CI do projeto\non:\n  push:\n    branches: [main]\njobs:\n  testes:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n'); });
  await ir(a.page, 'automacoes');
  await a.page.locator('button[data-arquivo=".github/workflows/ci.yml"]').waitFor();
  assert.match(await a.page.textContent('.ds-ide-painel'), /CI do projeto[\s\S]*push[\s\S]*testes/, 'nome, eventos e jobs lidos do arquivo');
  await a.page.click('#ide-editar'); await cm(a.page).waitFor();
  await a.page.evaluate(() => { const c = document.querySelector('.CodeMirror').CodeMirror; c.setValue(c.getValue().replace('npm test', 'npm run e2e')); });
  await a.page.click('#ide-salvar'); await a.page.waitForFunction(() => /Salvo/.test(document.querySelector('#ide-estado')?.textContent || ''));
  assert.match(fs.readFileSync(path.join(f.root, '.github/workflows/ci.yml'), 'utf8'), /npm run e2e/);
  assert.deepEqual(await confirmacoes(a), ['Salvar pipeline']);
  await a.page.click('#pipe-novo'); await a.page.fill('#pipe-novo-nome', 'nightly.yml'); await a.page.fill('#pipe-novo-titulo', 'Noturno'); await a.page.click('#pipe-novo-criar');
  await a.page.waitForFunction(() => !!document.querySelector('.ds-ide-cm .CodeMirror'));
  assert.match(fs.readFileSync(path.join(f.root, '.github/workflows/nightly.yml'), 'utf8'), /^name: Noturno/);
  assert.deepEqual(await confirmacoes(a), ['Salvar pipeline', 'Criar pipeline']);
  assert.equal((await a.page.evaluate((id) => window.prumo.testesGravar(id, '.github/workflows/sub/x.yml', 'x', null), (await a.page.evaluate(() => window.prumo.espacos())).data[0].id)).ok, false, 'subpasta de workflows é recusada');
  assert.deepEqual(a.erros, []);
});

test('Trazer do GitHub: projeto sem GitHub vinculado recusa com explicação e nada é criado', async (t) => {
  const { a, e } = await preparar(t);
  const r = await a.page.evaluate((id) => window.prumo.espacoTrazer(id), e.id);
  assert.equal(r.ok, false); assert.match(r.error, /GITHUB_NOT_LINKED/);
  assert.deepEqual(await confirmacoes(a), [], 'nenhuma confirmação foi pedida: nada ia acontecer');
});
