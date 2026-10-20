// Suporte sem GitHub na janela real: a pessoa abre o chamado com imagem, a Administração › Chamados recebe, vê a imagem, responde e resolve,
// e a pessoa vê a resposta em Meus chamados. Outra conta, sem a marca admin, não vê nada disso.
// O serviço do Prumo é o real em 127.0.0.1 com um repositório em memória no lugar do GitHub (testes/apoio/caixa-de-email.mjs): nada sai do computador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrir, ir, novoDados } from '../../../apoio/janela.mjs';
import { CHAVE_DE_ADMIN_DOS_TESTES } from '../../../apoio/caixa-de-email.mjs';

// PNG válido de 1x1 pixel: a tela da Administração precisa conseguir mostrar a imagem.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const recarregou = (page) => page.waitForFunction(() => document.readyState === 'complete' && (document.querySelector('#entrada[open]') || document.querySelector('#conteudo > *')));

test('chamado sem GitHub: abrir com imagem, receber na Administração, responder e a pessoa ver a resposta; outra conta não vê nada', { timeout: 180000 }, async (t) => {
  const dados = novoDados(t); const a = await abrir(t, dados); const p = a.page;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-anexo-')); t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const imagem = path.join(pasta, 'tela-do-erro.png'); fs.writeFileSync(imagem, PNG);
  await a.app.evaluate(({ dialog }, arquivo) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [arquivo] }); }, imagem);

  // 1. A pessoa descreve, anexa a imagem, revisa e envia. Nenhuma conta do GitHub é usada.
  await ir(p, 'suporte'); await p.waitForSelector('#sup-meus-vazio');
  assert.match(await p.textContent('#aviso-publico'), /vai só para a equipe do Prumo QA/);
  await p.selectOption('#sup-categoria', 'bug'); await p.fill('#sup-titulo', 'Botão Salvar não responde'); await p.fill('#sup-descricao', 'Cliquei em Salvar na tela de Testes e nada aconteceu.'); await p.fill('#sup-passos', '1. Abrir Testes 2. Clicar em Salvar');
  await p.click('#sup-anexar'); await p.waitForSelector('#sup-anexos li[data-anexo="tela-do-erro.png"]');
  await p.check('#sup-consentimento'); await p.click('#sup-revisar'); await p.waitForSelector('#sup-enviar:not([disabled])');
  assert.match(await p.textContent('#sup-previa-anexos'), /tela-do-erro\.png/);
  await p.click('#sup-enviar'); await p.waitForSelector('#sup-enviado');
  const numero = Number(/#(\d+)/.exec(await p.textContent('#sup-enviado'))[1]); assert.ok(numero >= 1);
  await p.waitForSelector(`#sup-meus-lista [data-chamado="${numero}"]`); assert.match(await p.textContent(`#sup-meus-lista [data-chamado="${numero}"]`), /Novo/);
  assert.equal(await p.locator('#sup-anexos li').count(), 0, 'anexos saem da tela depois do envio');

  // 2. Administração › Chamados: sem a chave pede a chave; com ela, lista, abre, mostra a imagem, responde e resolve.
  await ir(p, 'administracao'); await p.click('[data-aba-ds="chamados"]'); await p.waitForSelector('#chamados-chave');
  await p.fill('#chamados-chave', CHAVE_DE_ADMIN_DOS_TESTES); await p.click('#chamados-salvar-chave');
  await p.waitForSelector(`#chamados-tabela tr[data-chamado="${numero}"]`);
  assert.match(await p.textContent(`#chamados-tabela tr[data-chamado="${numero}"]`), /Botão Salvar não responde[\s\S]*Admin Teste[\s\S]*Novo/);
  const cfg = await p.evaluate(() => window.prumo.chamadosConfiguracao()); assert.equal(cfg.data.configurada, true); assert.ok(!JSON.stringify(cfg).includes('chave-de-administracao-dos-testes-0123456789'), 'a configuração nunca devolve a chave');
  assert.equal(await p.locator('#chamados-chave').inputValue(), '', 'a chave não volta para a tela');
  await p.click(`#chamados-tabela tr[data-chamado="${numero}"] td.ds-abrir button`); await p.locator('#qualidade-dialog[open]').waitFor();
  assert.match(await p.textContent('#qualidade-dialog'), /Cliquei em Salvar na tela de Testes/); assert.match(await p.textContent('#qualidade-dialog'), /admin-teste@prumo\.test/);
  await p.click('#chamado-ver-0'); await p.waitForFunction(() => { const i = document.querySelector('#qualidade-dialog img.chamado-midia'); return i && i.complete && i.naturalWidth === 1; });
  await p.fill('#chamado-resposta', 'Obrigada! Corrigimos na próxima versão.'); await p.click('#chamado-responder');
  await p.waitForFunction(() => /Obrigada! Corrigimos/.test(document.querySelector('#chamado-respostas')?.textContent || ''));
  await p.selectOption('#chamado-estado', 'RESOLVIDO'); await p.click('#chamado-estado-salvar');
  await p.waitForFunction((n) => /Resolvido/.test(document.querySelector(`#chamados-tabela tr[data-chamado="${n}"]`)?.textContent || ''), numero);

  // 3. A pessoa vê o estado e a resposta em Meus chamados.
  await ir(p, 'suporte'); await p.waitForFunction((n) => /Resolvido[\s\S]*1 resposta/.test(document.querySelector(`#sup-meus-lista [data-chamado="${n}"]`)?.textContent || ''), numero);
  await p.click(`#sup-meus-lista [data-chamado="${numero}"]`); await p.locator('#qualidade-dialog[open]').waitFor();
  assert.match(await p.textContent('#qualidade-dialog'), /Obrigada! Corrigimos na próxima versão\./);
  await p.keyboard.press('Escape');

  // 4. Outra conta (Analista de QA, sem a marca admin): não vê o chamado de ninguém e não chega aos chamados da Administração.
  const nova = await p.evaluate(() => window.prumo.usuariosCriar('carla', 'Carla QA', 'qa', false)); assert.equal(nova.ok, true);
  await p.click('#conta-botao'); await Promise.all([p.waitForEvent('load'), p.click('#conta-sair')]); await recarregou(p);
  await p.fill('#entrada-login', 'carla'); await p.fill('#entrada-senha', nova.data.senhaTemporaria); await p.click('#entrada-enviar'); await p.waitForSelector('#trocar-atual');
  await p.fill('#trocar-atual', nova.data.senhaTemporaria); await p.fill('#trocar-nova', 'Analista-firme-26'); await p.fill('#trocar-confirma', 'Analista-firme-26');
  await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]); await recarregou(p); await p.waitForSelector('#conta-botao');
  await ir(p, 'suporte'); await p.waitForSelector('#sup-meus-vazio');
  const recusas = await p.evaluate(async (n) => [await window.prumo.chamadosListar(), await window.prumo.chamadosDetalhe(n), await window.prumo.chamadosAnexo(n, 0), await window.prumo.chamadosChave('x'.repeat(40)), await window.prumo.suporteMeu(n)].map((r) => ({ ok: r.ok, erro: String(r.error ?? '') })), numero);
  for (const r of recusas.slice(0, 4)) { assert.equal(r.ok, false); assert.match(r.erro, /^PERMISSION_DENIED: a tela Administração é só para contas marcadas como admin/); }
  assert.equal(recusas[4].ok, false); assert.match(recusas[4].erro, /^TICKET_NOT_FOUND/, 'o chamado da Ana não existe para a Carla');
  assert.deepEqual(a.erros.filter((e) => !/PERMISSION_DENIED|TICKET_NOT_FOUND/.test(e)), []);
});
