// Login e permissões na janela real: ativar o login, criar conta, matriz de permissões, sair, entrar, senha temporária,
// menu filtrado, recusa no backend, cadastro por e-mail pendente, esqueci a senha pelo e-mail e o aviso embaixo sem cobrir nada.
// Os códigos chegam na caixa de e-mail dos testes (serviço de envio real em 127.0.0.1, sem Resend).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir, primeiroAcesso } from '../../../apoio/janela.mjs';
import { caixaDeEmail } from '../../../apoio/caixa-de-email.mjs';

const capturas = path.join('tmp', 'evidencias', 'telas');
const capturar = (page, nome) => { fs.mkdirSync(capturas, { recursive: true }); return page.screenshot({ path: path.join(capturas, nome + '.png') }); };
const recarregou = (page) => page.waitForFunction(() => document.readyState === 'complete' && (document.querySelector('#entrada[open]') || document.querySelector('[data-aba=inicio][aria-current=page], #tela-sem-acesso, #conteudo > *')));
const sobrepoe = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test('login: primeiro acesso, criar conta com senha temporária, permissão por tela na janela e no backend, cadastro e recuperação', async (t) => {
  const dados = novoDados(t); const a = await abrir(t, dados, [], {}, { semLogin: true }); const p = a.page;
  await p.emulateMedia({ reducedMotion: 'reduce' });

  // 1. Primeiro acesso: sem nenhuma conta o Prumo só mostra a criação do Administrador; criada, a pessoa já está dentro.
  await primeiroAcesso(p, { nome: 'Ana Admin', login: 'ana.admin', senha: 'Prumo-admin-2026' });
  await capturar(p, 'administracao-login-ativado');
  assert.match(await p.textContent('#conta-botao'), /Ana Admin/);

  // 2. Nova conta (papel Leitor) com senha temporária mostrada uma vez.
  await ir(p, 'administracao'); await p.waitForSelector('#adm-usuarios');
  await p.click('#adm-nova-conta'); await p.fill('#nova-nome', 'Bruno Leitor'); await p.fill('#nova-login', 'bruno'); await p.selectOption('#nova-papel', 'leitor');
  await p.click('#nova-criar'); await p.waitForSelector('#adm-segredo');
  const temporaria = (await p.textContent('#adm-segredo')).trim(); assert.equal(temporaria.length, 16);
  await p.click('#adm-segredo-fechar'); await p.waitForSelector('[data-conta=bruno]');
  assert.match(await p.textContent('[data-conta=bruno]'), /Senha temporária/);
  await capturar(p, 'administracao-usuarios');

  // 3. Permissões: o Leitor perde a tela Testes.
  await p.getByRole('tab', { name: 'Permissões' }).click(); await p.waitForSelector('#perm-matriz');
  assert.equal(await p.locator('#perm-administrador-testes').count(), 0, 'Administrador é fixo, sem seletor');
  await p.selectOption('#perm-leitor-testes', 'NENHUM'); await p.click('#perm-salvar');
  await p.waitForFunction(() => /Permissões salvas/.test(document.querySelector('#aviso')?.textContent || ''));
  await capturar(p, 'administracao-permissoes');
  await p.getByRole('tab', { name: 'Agentes' }).click(); await p.waitForSelector('#plataforma-agentes [data-agente=orquestrador]');
  assert.equal(await p.isDisabled('#agente-orquestrador'), true, 'o Orchestrator fica sempre ligado');
  await capturar(p, 'administracao-agentes');
  // O padrão atual permite cadastro sem aprovação. Ative a regra para testar o fluxo pendente.
  await p.getByRole('tab', { name: 'Configurações gerais' }).click();
  await p.waitForSelector('#geral-aprovar');
  await p.check('#geral-aprovar'); await p.click('#geral-salvar');
  await p.waitForFunction(() => /Configurações salvas/.test(document.querySelector('#aviso')?.textContent || ''));

  // 4. Sair: a janela volta para a entrada e nada responde sem sessão.
  await p.click('#conta-botao'); await Promise.all([p.waitForEvent('load'), p.click('#conta-sair')]); await recarregou(p);
  await p.waitForSelector('#entrada[open] #entrada-login');
  assert.match(String((await p.evaluate(() => window.prumo.espacos())).error), /^SESSION_REQUIRED/);
  await capturar(p, 'entrada-login');
  await p.fill('#entrada-login', 'bruno'); await p.fill('#entrada-senha', 'senha-errada-1'); await p.click('#entrada-enviar');
  await p.waitForSelector('#entrada-erro:not([hidden])'); assert.match(await p.textContent('#entrada-erro'), /ou senha incorretos/i);

  // 5. Senha temporária: troca obrigatória antes de qualquer tela; trocada, entra direto (não existe mais código de recuperação).
  await p.fill('#entrada-senha', temporaria); await p.click('#entrada-enviar'); await p.waitForSelector('#trocar-atual');
  await p.fill('#trocar-atual', temporaria); await p.fill('#trocar-nova', 'Leitura-firme-26'); await p.fill('#trocar-confirma', 'Leitura-firme-26');
  await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]); await recarregou(p);
  await p.waitForSelector('#conta-botao');

  // 6. Menu e backend respeitam o papel: Leitor não vê Administração nem Testes e não altera nada.
  assert.equal(await p.isHidden('[data-aba=administracao]'), true); assert.equal(await p.isHidden('[data-aba=testes]'), true);
  assert.equal(await p.isVisible('[data-aba=agentes]'), true);
  assert.equal(await p.isHidden('[data-aba=contextos]'), true, 'Contextos fica dentro de Agentes, não no menu'); assert.equal(await p.isHidden('[data-aba=evidencias]'), true);
  const recusas = await p.evaluate(async () => [(await window.prumo.usuariosListar()).error, (await window.prumo.espacoCriar({ nome: 'X', descricao: '' })).error, (await window.prumo.testesCatalogo('11111111-1111-4111-8111-111111111111')).error]);
  assert.match(recusas[0], /^PERMISSION_DENIED: a tela Administração é só para contas marcadas como admin/);
  assert.match(recusas[1], /^PERMISSION_DENIED: o papel Leitor não permite alterar em Projetos/);
  assert.match(recusas[2], /^PERMISSION_DENIED: .*consultar em Testes/);
  await p.evaluate(() => mostrar('administracao')); await p.waitForSelector('#tela-sem-acesso');
  await ir(p, 'projetos'); await p.waitForSelector('#nota-so-ver');
  await capturar(p, 'leitor-somente-consulta');

  // 7. Cadastro por e-mail nasce pendente; "Esqueci a senha" manda outro código ao e-mail e define a senha nova.
  const caixa = await caixaDeEmail();
  await p.click('#conta-botao'); await Promise.all([p.waitForEvent('load'), p.click('#conta-sair')]); await recarregou(p);
  await p.click('#entrada-ir-cadastro'); await p.fill('#cadastro-nome', 'Dani Dev'); await p.fill('#cadastro-email', 'dani@prumo.test');
  await p.fill('#cadastro-senha', 'Cadastro-firme-26'); await p.fill('#cadastro-confirma', 'Cadastro-firme-26'); await p.click('#entrada-enviar');
  await p.waitForSelector('#confirmar-codigo'); await p.fill('#confirmar-codigo', caixa.ultimoCodigo('dani@prumo.test')); await p.click('#entrada-enviar');
  await p.waitForFunction(() => /A Administração precisa aprovar/.test(document.querySelector('#entrada')?.textContent || ''));
  await p.click('#entrada-continuar'); await p.fill('#entrada-login', 'dani@prumo.test'); await p.fill('#entrada-senha', 'Cadastro-firme-26'); await p.click('#entrada-enviar');
  await p.waitForSelector('#entrada-erro:not([hidden])'); assert.match(await p.textContent('#entrada-erro'), /aguarda aprovação/i);
  await p.click('#entrada-ir-recuperar'); await p.fill('#recuperar-email', 'dani@prumo.test'); await p.click('#entrada-enviar');
  await p.waitForSelector('#recuperar-codigo'); await p.fill('#recuperar-codigo', caixa.ultimoCodigo('dani@prumo.test'));
  await p.fill('#recuperar-senha', 'Recupera-firme-26'); await p.fill('#recuperar-confirma', 'Recupera-firme-26'); await p.click('#entrada-enviar');
  await p.waitForFunction(() => document.querySelector('#entrada-titulo')?.textContent === 'Senha nova definida');
  assert.equal(await p.locator('#entrada-codigo').count(), 0, 'nenhuma tela de código de recuperação');
  await capturar(p, 'entrada-recuperacao');
  assert.deepEqual(a.erros, []);
});

test('aviso: embaixo, centralizado no conteúdo, some sozinho e não cobre o robô, o topo nem o modal', async (t) => {
  const dados = novoDados(t); const a = await abrir(t, dados); const p = a.page;
  await p.setViewportSize({ width: 1280, height: 800 });
  await ir(p, 'projetos');
  await p.evaluate(() => avisar('Aviso de teste para conferir a posição.'));
  const r = await p.evaluate(() => {
    const ret = (s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    const c = ret('#conteudo'); return { aviso: ret('#aviso'), conteudo: c, robo: ret('.v36f-botao'), topo: ret('.topo-direita'), lateral: ret('header#lateral'), altura: innerHeight, reserva: getComputedStyle(document.querySelector('#conteudo'), '::after').height };
  });
  assert.ok(r.aviso.bottom <= r.altura - 8 && r.aviso.top > r.altura / 2, 'na metade de baixo da janela');
  assert.ok(Math.abs((r.aviso.left + r.aviso.right) / 2 - (r.conteudo.left + r.conteudo.right) / 2) < 2, 'centralizado na área de conteúdo');
  for (const [nome, outro] of [['robô', r.robo], ['topo', r.topo], ['menu lateral', r.lateral]]) if (outro) assert.ok(!sobrepoe(r.aviso, outro), 'não cobre o ' + nome);
  assert.notEqual(r.reserva, '0px', 'reserva espaço no fim da página');
  await capturar(p, 'aviso-embaixo');
  await p.waitForSelector('#aviso', { state: 'hidden', timeout: 6000 });
  // Com modal aberto, o aviso entra no fim do modal, no fluxo.
  await p.evaluate(() => { DS.modal('Detalhe', [h('p', {}, 'conteúdo')], { tamanho: 'sm' }); avisar('Aviso dentro do modal.'); });
  const dentro = await p.evaluate(() => { const av = document.querySelector('#aviso'); return { pai: av.parentElement.id, posicao: getComputedStyle(av).position }; });
  assert.deepEqual(dentro, { pai: 'qualidade-dialog', posicao: 'static' });
  await capturar(p, 'aviso-no-modal');
  assert.deepEqual(a.erros, []);
});
