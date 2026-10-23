/** Integração do cliente de e-mail com HTTP local real; nunca chama servidores externos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { enviarCodigoPorEmail } from '../../../../dist/login/integracoes/envioEmail.js';
import { criarServico } from '../../../../backend/aplicativo/servidor/servidor.mjs';

test('cliente do serviço: fala com o serviço local e traduz as respostas; endereço fora de HTTPS e de 127.0.0.1 é recusado sem rede', async (t) => {
  const mensagens = []; let falhar = false;
  const servidor = http.createServer(criarServico({ enviar: async (m) => { if (falhar) throw new Error('fora'); mensagens.push(m); }, registrar: () => {}, limites: { porEmail10min: 1, porEmailDia: 10, porIpHora: 10, totalHora: 10 } }));
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok)); t.after(() => servidor.close());
  const antes = process.env.PRUMO_SERVICO; t.after(() => { if (antes === undefined) delete process.env.PRUMO_SERVICO; else process.env.PRUMO_SERVICO = antes; });
  process.env.PRUMO_SERVICO = 'http://127.0.0.1:' + servidor.address().port;
  await enviarCodigoPorEmail({ email: 'eli@exemplo.com', codigo: '765432', finalidade: 'SENHA', idioma: 'pt-BR' });
  assert.equal(mensagens.length, 1); assert.match(mensagens[0].texto, /765432/);
  await assert.rejects(enviarCodigoPorEmail({ email: 'eli@exemplo.com', codigo: '765432', finalidade: 'SENHA', idioma: 'pt-BR' }), /^Error: EMAIL_RATE_LIMIT/);
  falhar = true; await assert.rejects(enviarCodigoPorEmail({ email: 'fabi@exemplo.com', codigo: '765432', finalidade: 'SENHA', idioma: 'pt-BR' }), /^Error: EMAIL_SEND_FAILED/);
  for (const url of ['http://exemplo.com', 'http://localhost:9', 'ftp://127.0.0.1', 'não é url']) {
    process.env.PRUMO_SERVICO = url;
    await assert.rejects(enviarCodigoPorEmail({ email: 'eli@exemplo.com', codigo: '765432', finalidade: 'SENHA', idioma: 'pt-BR' }), /^Error: EMAIL_SERVICE_UNAVAILABLE: endereço/, url);
  }
});
