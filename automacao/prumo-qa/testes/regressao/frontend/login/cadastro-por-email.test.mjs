// Cadastro por e-mail na janela real: nome, e-mail e senha, o código que chega no e-mail e pronto, a pessoa está dentro.
// Os e-mails vão para a caixa dos testes (serviço de envio real em 127.0.0.1, sem Resend); nada sai do computador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrir, novoDados } from '../../../apoio/janela.mjs';
import { caixaDeEmail } from '../../../apoio/caixa-de-email.mjs';

test('instalação nova: criar a conta com e-mail e código; código errado avisa, Corrigir dados não manda outro e-mail, sem tela de código de recuperação', { timeout: 120000 }, async (t) => {
  const caixa = await caixaDeEmail(); const email = 'lia@prumo.test'; const doEmail = () => caixa.mensagens.filter((m) => m.para === email);
  const a = await abrir(t, novoDados(t), [], {}, { semLogin: true }); const p = a.page;
  await p.waitForSelector('#entrada-login'); await p.click('#entrada-ir-cadastro'); await p.waitForSelector('#primeiro-nome');
  assert.equal(await p.locator('#primeiro-login').count(), 0, 'sem campo de login: a conta é o e-mail');
  await p.fill('#primeiro-nome', 'Lia Lima'); await p.fill('#primeiro-email', 'Lia@Prumo.test'); await p.fill('#primeiro-senha', 'Cadastro-firme-26'); await p.fill('#primeiro-confirma', 'Outra-coisa-26');
  await p.click('#entrada-enviar'); await p.waitForSelector('#entrada-erro:not([hidden])'); assert.match(await p.textContent('#entrada-erro'), /confirmação não é igual/);
  assert.equal(doEmail().length, 0, 'dado errado não manda e-mail');
  await p.fill('#primeiro-confirma', 'Cadastro-firme-26'); await p.click('#entrada-enviar'); await p.waitForSelector('#confirmar-codigo');
  assert.match(await p.textContent('#entrada'), /lia@prumo\.test/); assert.equal(doEmail().length, 1);
  assert.equal(await p.isDisabled('#confirmar-reenviar'), true, 'reenviar espera 60 segundos');
  const certo = caixa.ultimoCodigo(email);
  await p.fill('#confirmar-codigo', certo === '000000' ? '111111' : '000000'); await p.click('#entrada-enviar');
  await p.waitForSelector('#entrada-erro:not([hidden])'); assert.match(await p.textContent('#entrada-erro'), /Código incorreto/);
  await p.click('#entrada-voltar'); await p.waitForSelector('#primeiro-nome');
  assert.equal(await p.inputValue('#primeiro-nome'), 'Lia Lima'); assert.equal(await p.inputValue('#primeiro-email'), 'lia@prumo.test');
  await p.fill('#primeiro-senha', 'Cadastro-firme-26'); await p.fill('#primeiro-confirma', 'Cadastro-firme-26'); await p.click('#entrada-enviar'); await p.waitForSelector('#confirmar-codigo');
  assert.equal(doEmail().length, 1, 'mesmo e-mail: o código já mandado continua valendo');
  await p.fill('#confirmar-codigo', certo); await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]);
  await p.waitForSelector('#conta-botao'); assert.match(await p.textContent('#conta-botao'), /Lia Lima/);
  assert.equal(await p.locator('#entrada-codigo').count(), 0, 'nenhuma tela de código de recuperação');
  await p.click('#conta-botao'); await p.click('#conta-minha'); await p.locator('#qualidade-dialog[open]').waitFor();
  assert.match(await p.textContent('#qualidade-dialog'), /lia@prumo\.test/); assert.equal(await p.locator('#minha-recuperar-senha').count(), 1);
  assert.deepEqual(a.erros.filter((e) => !/LOGIN_SETUP_REQUIRED|CODE_INVALID/.test(e)), []);
});

test('o e-mail do código sai no idioma escolhido na entrada', { timeout: 120000 }, async (t) => {
  const caixa = await caixaDeEmail();
  const a = await abrir(t, novoDados(t), [], {}, { semLogin: true }); const p = a.page;
  await p.waitForSelector('#entrada-login'); await p.selectOption('#entrada-idioma', 'en'); await p.click('#entrada-ir-cadastro'); await p.waitForSelector('#primeiro-nome');
  await p.fill('#primeiro-nome', 'Max Mustermann'); await p.fill('#primeiro-email', 'max@prumo.test'); await p.fill('#primeiro-senha', 'Signup-steady-26'); await p.fill('#primeiro-confirma', 'Signup-steady-26');
  await p.click('#entrada-enviar'); await p.waitForSelector('#confirmar-codigo');
  const m = caixa.mensagens.filter((x) => x.para === 'max@prumo.test').at(-1); assert.match(m.assunto, /^Your Prumo QA code: \d{6}$/);
  assert.equal(await p.textContent('#entrada-titulo'), 'Confirm your e-mail');
});

test('duas etapas na janela: Esqueci a senha sempre na entrada; ligada em Minha conta, a senha pede o código do e-mail e só ele abre a sessão', { timeout: 150000 }, async (t) => {
  const caixa = await caixaDeEmail(); const email = 'rui@prumo.test'; const senha = 'Duas-etapas-26';
  const a = await abrir(t, novoDados(t), [], {}, { semLogin: true }); const p = a.page;
  await p.waitForSelector('#entrada-login'); assert.equal(await p.locator('#entrada-ir-recuperar').count(), 1, 'Esqueci a senha aparece mesmo sem contas');
  await p.click('#entrada-ir-cadastro'); await p.fill('#primeiro-nome', 'Rui Lima'); await p.fill('#primeiro-email', email); await p.fill('#primeiro-senha', senha); await p.fill('#primeiro-confirma', senha);
  await p.click('#entrada-enviar'); await p.waitForSelector('#confirmar-codigo'); await p.fill('#confirmar-codigo', caixa.ultimoCodigo(email));
  await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]); await p.waitForSelector('#conta-botao');
  await p.click('#conta-botao'); await p.click('#conta-minha'); await p.locator('#qualidade-dialog[open]').waitFor();
  await p.fill('#minha-duas-senha', senha); await p.click('#minha-duas-etapas'); await p.waitForFunction(() => /ligada/i.test(document.querySelector('#aviso')?.textContent || ''));
  await p.keyboard.press('Escape'); await p.click('#conta-botao'); await Promise.all([p.waitForEvent('load'), p.click('#conta-sair')]);
  await p.waitForSelector('#entrada[open] #entrada-login'); const antes = caixa.mensagens.length;
  await p.fill('#entrada-login', email); await p.fill('#entrada-senha', senha); await p.click('#entrada-enviar');
  await p.waitForSelector('#entrada-codigo-email'); assert.match(await p.textContent('#entrada'), /r\*\*\*@prumo\.test/);
  assert.equal(caixa.mensagens.length, antes + 1); assert.match(caixa.mensagens.at(-1).texto, /concluir a entrada/);
  assert.equal((await p.evaluate(() => window.prumo.espacos())).ok, false, 'sem o código não há sessão');
  const certo = caixa.ultimoCodigo(email);
  await p.fill('#entrada-codigo-email', certo === '000000' ? '111111' : '000000'); await p.click('#entrada-enviar'); await p.waitForSelector('#entrada-erro:not([hidden])'); assert.match(await p.textContent('#entrada-erro'), /Código incorreto/);
  await p.fill('#entrada-codigo-email', certo); await Promise.all([p.waitForEvent('load'), p.click('#entrada-enviar')]); await p.waitForSelector('#conta-botao');
  assert.deepEqual(a.erros.filter((e) => !/LOGIN_SETUP_REQUIRED|CODE_INVALID|SESSION_REQUIRED/.test(e)), []);
});
