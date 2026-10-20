import { esquecerCodigos, pedirCodigo } from '../../../dist/login/regras/codigosPorEmail.js';
import { ativarLogin, cadastrarConta } from '../../../dist/login/regras/contas.js';
import { emailDa } from './caixa-de-email.mjs';

/**
 * Apoio dos testes unitários de contas: pede o código por e-mail com um envio em memória (nada sai do processo) e devolve o código.
 * Não é um teste. Esquece os códigos pendentes antes, para a espera entre envios não atrapalhar testes que reusam o mesmo e-mail.
 */
export async function codigoPara(email, finalidade, b) {
  esquecerCodigos(); let codigo = null;
  await pedirCodigo({ email, finalidade }, b, async (p) => { codigo = p.codigo; });
  return codigo;
}
/** Primeira conta (Administrador) com o e-mail confirmado; o login nasce da parte antes do @. */
export async function criarPrimeiraConta(conta, b, agora) {
  const email = emailDa(conta);
  return ativarLogin({ email, nome: conta.nome, senha: conta.senha, codigo: await codigoPara(email, 'CADASTRO', b) }, b, agora);
}
/** Cadastro pela tela de entrada, com o e-mail confirmado. */
export async function cadastrarComEmail(conta, b) {
  const email = emailDa(conta);
  return cadastrarConta({ email, nome: conta.nome, senha: conta.senha, codigo: await codigoPara(email, 'CADASTRO', b) }, b);
}
