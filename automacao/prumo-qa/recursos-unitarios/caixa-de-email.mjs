import http from 'node:http';
import { criarServico } from '../../../backend/aplicativo/servidor/servidor.mjs';
import { repositorioDeSuporteFalso } from './repositorio-de-suporte-falso.mjs';

/**
 * Serviço do Prumo dos testes: o serviço real (backend/aplicativo/servidor/servidor.mjs) em 127.0.0.1, com o Resend trocado por uma caixa
 * em memória e o GitHub por um repositório de chamados em memória. O aplicativo aponta para ele com PRUMO_SERVICO.
 * Não é um teste e nunca fala com a internet.
 */
export const CHAVE_DE_ADMIN_DOS_TESTES = 'chave-de-administracao-dos-testes-0123456789';
let servico = null;
export async function caixaDeEmail() {
  if (servico) return servico;
  const mensagens = []; const repositorio = repositorioDeSuporteFalso();
  const limites = { porEmail10min: 1e6, porEmailDia: 1e6, porIpHora: 1e6, totalHora: 1e6 };
  const suporte = { github: repositorio, chaveAdmin: CHAVE_DE_ADMIN_DOS_TESTES, limites: { porIpHora: 1e6, totalHora: 1e6, anexosPorIpHora: 1e6, leiturasPorIpHora: 1e6, errosDeAdminPorIpHora: 1e6 } };
  const servidor = http.createServer(criarServico({ enviar: async (m) => { mensagens.push(m); }, limites, suporte, registrar: () => {} }));
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok)); servidor.unref();
  const url = 'http://127.0.0.1:' + servidor.address().port;
  /** Último código mandado a este e-mail, lido do texto da mensagem como a pessoa leria. */
  const ultimoCodigo = (email) => {
    const m = mensagens.filter((x) => x.para === email.toLowerCase()).at(-1);
    if (!m) throw new Error('Nenhum e-mail para ' + email);
    return /\b(\d{6})\b/.exec(m.texto)[1];
  };
  servico = { url, mensagens, ultimoCodigo, repositorio };
  return servico;
}
export const servicoLocal = caixaDeEmail;
/** E-mail de uma conta de teste: quem não informou usa <login>@prumo.test, e o login nasce igual. */
export const emailDa = (conta) => conta.email || conta.login + '@prumo.test';
