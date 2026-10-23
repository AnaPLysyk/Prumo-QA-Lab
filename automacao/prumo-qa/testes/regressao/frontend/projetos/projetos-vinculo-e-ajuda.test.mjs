import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { abrir, novoDados, ir, escolherPasta, usarProjeto, atenderConfirmacoes } from '../../infra/janela.mjs';

/**
 * Fluxos corrigidos na 2.10.2 a partir do teste do Prumo em produção (issues #3, #4 e #9): vincular qualquer pasta de
 * código, mensagem clara para contrato inválido, busca da Ajuda por variações e o mesmo projeto em todas as telas.
 * Pastas de projeto são temporárias e montadas aqui; nenhum repositório real é tocado.
 */
const pastaTemp = (t, arquivos) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo pasta codigo '));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  for (const [rel, c] of Object.entries(arquivos)) { fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true }); fs.writeFileSync(path.join(raiz, rel), c); }
  return raiz;
};
// Diálogo nativo simulado: guarda o que foi mostrado e responde como a pessoa (1 = confirmar, 0 = cancelar).
// 2.20: a confirmação é a caixa do app (atenderConfirmacoes); `dlg.r` escolhe a resposta das próximas perguntas e `dlg.conf.registro` guarda o que foi mostrado.
const confirmacoes = (t, app) => { const dlg = { r: 'cancelar' }; dlg.conf = atenderConfirmacoes(app, () => dlg.r); t.after(() => dlg.conf.parar()); return dlg; };
// 2.19: a pasta entra pela bolha "Pasta local" da bancada do projeto › Escolher pasta (o diálogo de pasta é o de escolherPasta).
const vincularPelaTela = async (page, nome) => {
  const id = await page.evaluate((n) => window.prumo.espacos().then((r) => r.data.find((e) => e.nome === n).id), nome);
  await usarProjeto(page, id);
  if (await page.locator('#projeto-painel:not([hidden])').count()) await page.getByRole('button', { name: 'Fechar painel e voltar à bancada' }).click();
  await page.locator('.ds-proj-modulo[data-servico="local"] .ds-proj-modulo-emblema').click();
  await page.locator('#projeto-painel:not([hidden])').getByRole('button', { name: 'Escolher pasta', exact: true }).click();
};

test('vincular pasta npm sem qa.project.json: mostra a proposta, cancelar não grava, aprovar cria o contrato e vincula', { timeout: 120000 }, async (t) => {
  const a = await abrir(t, novoDados(t)); const dlg = confirmacoes(t, a.app);
  await a.page.evaluate(() => window.prumo.espacoCriar({ nome: 'Loja web', descricao: 'pasta sem contrato' }));
  const raiz = pastaTemp(t, { 'package.json': JSON.stringify({ name: 'loja-web', scripts: { test: 'node --test', 'test:e2e': 'playwright test', start: 'node .' } }), 'src/a.js': '', 'tests/a.test.js': '' });
  await escolherPasta(a.app, raiz);
  dlg.r = 'cancelar'; await vincularPelaTela(a.page, 'Loja web'); await dlg.conf.aguardar(1);
  const proposta = dlg.conf.registro[0]; assert.equal(proposta.resposta, 'cancelar');
  assert.match(proposta.mensagem, /ainda não tem qa\.project\.json/); assert.deepEqual(proposta.botoes, ['Cancelar', 'Criar contrato e vincular']);
  assert.match(proposta.detalhe, /Node\.js \(npm\)/); assert.match(proposta.detalhe, /test = npm run test/); assert.match(proposta.detalhe, /Bloqueados até revisão.*test-e2e/);
  assert.ok(!fs.existsSync(path.join(raiz, 'qa.project.json')), 'cancelar não grava nada');
  dlg.r = 'confirmar'; await vincularPelaTela(a.page, 'Loja web'); await dlg.conf.aguardar(2);
  await a.page.locator('.ds-proj-modulo[data-servico="local"][data-vinculado="sim"]').waitFor();
  const contrato = JSON.parse(fs.readFileSync(path.join(raiz, 'qa.project.json'), 'utf8'));
  assert.deepEqual(Object.keys(contrato.commands).sort(), ['test', 'test-e2e']); assert.deepEqual(contrato.execution.blockedByDefault, ['test-e2e']);
  assert.deepEqual(a.erros, []);
});

test('pasta Python sem contrato vira somente leitura; contrato inválido mostra explicação antes do código', { timeout: 120000 }, async (t) => {
  const a = await abrir(t, novoDados(t)); const dlg = confirmacoes(t, a.app);
  await a.page.evaluate(async () => { await window.prumo.espacoCriar({ nome: 'API Python', descricao: 'x' }); await window.prumo.espacoCriar({ nome: 'Quebrado', descricao: 'x' }); });
  const py = pastaTemp(t, { 'pyproject.toml': '[project]\nname = "api"', 'tests/test_a.py': '', 'app/main.py': '' });
  await escolherPasta(a.app, py); dlg.r = 'confirmar'; await vincularPelaTela(a.page, 'API Python'); await dlg.conf.aguardar(1);
  await a.page.locator('.ds-proj-modulo[data-servico="local"][data-vinculado="sim"]').waitFor();
  const proposta = dlg.conf.registro[0]; assert.match(proposta.detalhe, /Python/); assert.match(proposta.detalhe, /somente leitura/); assert.match(proposta.detalhe, /pytest.*2\.11/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(py, 'qa.project.json'), 'utf8')).execution.readOnly, true);
  const ruim = pastaTemp(t, { 'qa.project.json': '{"schemaVersion":1}' });
  await escolherPasta(a.app, ruim); await vincularPelaTela(a.page, 'Quebrado');
  await a.page.waitForFunction(() => /código WORKSPACE_LOCAL_CONTRACT_INVALID/.test(document.querySelector('#aviso')?.textContent || ''));
  const aviso = await a.page.textContent('#aviso');
  assert.match(aviso, /^O qa\.project\.json desta pasta não é válido/, 'explicação primeiro, código técnico só no fim');
  assert.equal(fs.readFileSync(path.join(ruim, 'qa.project.json'), 'utf8'), '{"schemaVersion":1}', 'contrato existente nunca é sobrescrito');
});

test('Ajuda: a busca encontra variações e várias palavras, com a página certa no topo', { timeout: 90000 }, async (t) => {
  const a = await abrir(t, novoDados(t)); await ir(a.page, 'ajuda');
  const primeiro = async (q) => { await a.page.fill('#ajuda-busca', q); await a.page.waitForSelector('#ajuda-resultados:not([hidden]) .ds-doc-resultado'); return (await a.page.locator('#ajuda-resultados .ds-doc-resultado button').first().textContent()).trim(); };
  assert.equal(await primeiro('atualizar'), 'Atualizações');
  assert.match(await primeiro('conectar repositório'), /vincular/i);
  assert.match(await primeiro('criar teste'), /Testes/);
  assert.match(await primeiro('instalação'), /instalar/i);
  await a.page.fill('#ajuda-busca', 'zzzz-inexistente'); await a.page.getByText('Nada encontrado').waitFor();
});

test('o projeto selecionado é o mesmo na lateral, no Suporte e em Projetos (inclusive a demonstração)', { timeout: 90000 }, async (t) => {
  const a = await abrir(t, novoDados(t));
  // 2.19: o botão de demonstração saiu da tela; o canal projetos:demo continua e é o que se exercita aqui.
  assert.ok((await a.page.evaluate(() => window.prumo.adicionarDemo())).ok); await ir(a.page, 'ajuda'); await ir(a.page, 'projetos');
  // A pasta da demonstração não é projeto do Prumo: entra no seletor da lateral (Pastas locais) e fica atual quando a pessoa a escolhe.
  await a.page.click('#projeto-botao'); await a.page.locator('#projeto-lista [data-seletor-item="local"]', { hasText: 'Publicações sintéticas' }).click();
  await a.page.waitForFunction(() => /Publicações sintéticas/.test(document.querySelector('#projeto-atual')?.textContent || ''));
  const lateral = (await a.page.textContent('#projeto-atual')).trim();
  await ir(a.page, 'suporte');
  await a.page.waitForFunction((n) => [...document.querySelectorAll('#conteudo div > span')].some((s) => s.textContent.trim() === n), lateral);
});

test('Atualizar agora: confirma, baixa e confere o SHA-256 da release; em desenvolvimento nunca executa instalador', { timeout: 120000 }, async (t) => {
  const http = await import('node:http'); const { createHash } = await import('node:crypto');
  const corpo = Buffer.from('MZ instalador de teste'); const nome = 'Prumo-QA-Setup-99.0.0.exe'; const pedidos = [];
  const srv = http.createServer((req, res) => {
    pedidos.push(req.url);
    if (req.url === '/latest') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://github.com/AnaPLysyk/Prumo-Qa/releases/tag/v99.0.0', body: '- novidade', draft: false, prerelease: false })); }
    if (req.url === `/dl/${nome}.sha256`) return res.end(`${createHash('sha256').update(corpo).digest('hex')} *${nome}`);
    if (req.url === `/dl/${nome}`) return res.end(corpo);
    res.writeHead(404); res.end();
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const a = await abrir(t, novoDados(t), [], { PRUMO_UPDATE_TEST_URL: `${base}/latest`, PRUMO_UPDATE_TEST_DOWNLOAD: `${base}/dl` }); const dlg = confirmacoes(t, a.app);
  await ir(a.page, 'ajuda'); await a.page.click('.indice button:has-text("Atualizações")');
  await a.page.click('#verificar-atualizacao'); await a.page.waitForSelector('#atualizar-agora');
  dlg.r = 'cancelar'; await a.page.click('#atualizar-agora'); await dlg.conf.aguardar(1);
  const pergunta = dlg.conf.registro[0]; assert.equal(pergunta.resposta, 'cancelar'); assert.match(pergunta.mensagem, /versão 99\.0\.0/); assert.match(pergunta.detalhe, /confere o SHA-256/);
  assert.ok(!pedidos.some((p) => p.startsWith('/dl/')), 'cancelar não baixa nada');
  dlg.r = 'confirmar'; await a.page.click('#atualizar-agora');
  await a.page.waitForSelector('#atualizacao-conferida');
  assert.match(await a.page.textContent('#atualizacao-conferida'), /99\.0\.0 baixado e conferido.*nada foi instalado/);
  assert.deepEqual(pedidos.filter((p) => p.startsWith('/dl/')), [`/dl/${nome}.sha256`, `/dl/${nome}`]);
  assert.deepEqual(a.erros, []);
});
