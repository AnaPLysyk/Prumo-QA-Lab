/** Regressão do tratamento visual de erros: sem janela, rede, sessão ou credenciais reais. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const ler = rel => fs.readFileSync(path.join(raiz,rel), 'utf8');
const qase = ler('frontend/conexoes/mostrarConexoes.js');
const login = ler('frontend/login/entrarNaConta.js');
const mensagensLogin = ler('frontend/login/mensagensDeEntrada.js');

// Avalia as funções efetivamente utilizadas pelas telas, sem simular aprovação de autenticação.
const corteQase = qase.indexOf('abas.conexoes=async el=>');
assert.ok(corteQase > 0, 'a função de mensagens precede a tela');
const ctxQase = vm.createContext({});
vm.runInContext(qase.slice(0, corteQase) + '\nthis.mensagem = mensagemFalhaQase;', ctxQase);
const mensagemQase = ctxQase.mensagem;

const ctxLogin = vm.createContext({ window: {} });
vm.runInContext(mensagensLogin, ctxLogin);
const mensagemLogin = ctxLogin.window.PrumoMensagensEntrada.mensagemDaEntrada;
assert.match(login, /PrumoMensagensEntrada/, 'a tela deve usar o módulo de mensagens, não duplicá-lo');

test('Qase diferencia rede, tempo, limite, credencial e permissão', () => {
  assert.match(mensagemQase('SERVICE_UNAVAILABLE'), /rede, DNS, proxy/);
  assert.match(mensagemQase('SERVICE_TIMEOUT'), /demorou/);
  assert.match(mensagemQase('SERVICE_RATE_LIMIT'), /limitou temporariamente/);
  assert.match(mensagemQase('CREDENTIAL_INVALID_OR_EXPIRED'), /inválido ou expirado/);
  assert.match(mensagemQase('SERVICE_PERMISSION'), /permissão/);
  assert.match(mensagemQase('CREDENTIAL_PROTECTION_UNAVAILABLE'), /cofre de credenciais/);
});
test('Qase desconhecido não revela dados ou exceções do backend', () => {
  const secreto = 'INTERNAL_BROKEN: token=segredo-123 caminho=C:\\perfis';
  const resposta = mensagemQase(secreto);
  assert.match(resposta, /Não foi possível validar/);
  assert.doesNotMatch(resposta, /segredo-123|C:\\perfis|INTERNAL_BROKEN/);
  assert.match(resposta, /Nenhum token foi salvo/);
});
test('Login diferencia credenciais, código do e-mail, envio, bloqueio e senha fraca com orientação', () => {
  assert.match(mensagemLogin('LOGIN_INVALID: detalhe técnico'), /E-mail ou senha incorretos/);
  assert.match(mensagemLogin('CODE_INVALID: x'), /Código incorreto/);
  assert.match(mensagemLogin('CODE_EXPIRED: x'), /Peça um novo/);
  assert.match(mensagemLogin('EMAIL_TAKEN: x'), /já tem conta/);
  assert.match(mensagemLogin('EMAIL_WAIT: x'), /Espere um minuto/);
  assert.match(mensagemLogin('EMAIL_SERVICE_UNAVAILABLE: x'), /serviço de envio/);
  assert.match(mensagemLogin('ACCOUNT_PENDING: aguardando'), /aguarda aprovação/);
  assert.match(mensagemLogin('ACCOUNT_LOCKED: x'), /temporariamente bloqueada/);
  assert.match(mensagemLogin('PASSWORD_WEAK: x'), /pelo menos 10 caracteres/);
  assert.match(mensagemLogin('LOGIN_NOT_ACTIVE: x'), /não existe conta/);
});
test('Login não imprime conteúdo arbitrário do backend e preserva erros de validação local', () => {
  assert.equal(mensagemLogin('Preencha todos os campos.'), 'Preencha todos os campos.');
  assert.equal(mensagemLogin('A confirmação não é igual à senha.'), 'A confirmação não é igual à senha.');
  const erro = mensagemLogin('FALHA_DESCONHECIDA: stack token=segredo=abc');
  assert.doesNotMatch(erro, /FALHA_DESCONHECIDA|stack|segredo/);
});
test('recuperação também é acessível por Minha conta e termina a sessão após sucesso', () => {
  assert.match(login, /minha-recuperar-senha/);
  assert.match(login, /if \(sessao\?\.usuario\) \{ await api\.contaSair\(\); sessao = null; \}/);
  assert.match(login, /entrada-ir-recuperar/);
});
