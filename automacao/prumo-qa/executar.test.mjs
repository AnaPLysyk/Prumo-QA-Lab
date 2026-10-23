/** Testes locais da ponte do Lab: selecao segura, sem abrir Electron ou tocar em contas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { argumentos, selecionar } from './executar.mjs';

test('catálogo externo distingue smoke, regressão, integração e E2E', () => {
  assert.equal(selecionar(argumentos(['--tipo', 'smoke'])).length, 1);
  assert.ok(selecionar(argumentos(['--tipo', 'e2e'])).length >= 2);
  assert.ok(selecionar(argumentos(['--tipo', 'regressao'])).length >= 79, 'novos cenários devem ser descobertos automaticamente');
  assert.equal(selecionar(argumentos(['--tipo', 'integracao'])).length, 3);
  assert.deepEqual(selecionar(argumentos(['--tipo', 'e2e',
    '--arquivo', 'frontend/aplicativo/todas-as-telas.test.mjs'])),
    ['frontend/aplicativo/todas-as-telas.test.mjs']);
});

test('ponte recusa comandos e caminhos nao autorizados', () => {
  for (const args of [
    ['--tipo', 'unitario'], ['--tipo', 'smoke', '--arquivo', '../outro.test.mjs'],
    ['--tipo', 'regressao', '--empacotado'], ['--tipo', 'smoke', '--arquivo', 'backend/aplicativo/backend-sobe.test.mjs', '--empacotado'], ['--tipo', 'smoke', '--exec'],
    ['--tipo', 'smoke', '--arquivo', 'frontend/../login/x.test.mjs']
  ]) assert.throws(() => argumentos(args), /LAB_/);
  assert.throws(() => selecionar(argumentos(['--tipo', 'smoke',
    '--arquivo', 'frontend/login/inexistente.test.mjs'])), /LAB_SELECAO_VAZIA/);
});

test('modo Lab simula e-mail local e recusa credenciais externas', async () => {
  const { ambienteLab, ultimoCodigoLab } = await import('./abrir-lab.mjs');
  const pasta = path.resolve(os.tmpdir(), 'prumo-qa-lab-teste');
  const env = ambienteLab('http://127.0.0.1:38652', pasta, {
    PRUMO_AUTH_API_URL:'https://prumo-qa-auth-dev.onrender.com',
    PRUMO_SERVICO:'https://prumo-qa-servico.onrender.com',
    PRUMO_LOGIN_MVP:'1', DATABASE_URL:'postgresql://segredo',
    RESEND_API_KEY:'re_segredo',BETTER_AUTH_SECRET:'segredo',
    NEON_API_KEY:'segredo',ELECTRON_RUN_AS_NODE:'1',
    GITHUB_TOKEN:'token-externo',AWS_SECRET_ACCESS_KEY:'segredo-aws',
    OPENAI_API_KEY:'chave-externa',Path:'C:/Windows'
  });
  assert.equal(env.PRUMO_SERVICO,'http://127.0.0.1:38652');
  assert.equal(env.PRUMO_AUTH_API_URL,'');
  assert.equal(env.PRUMO_LOGIN_MVP,'0');
  assert.equal(env.PRUMO_DATA_DIR,pasta);
  for(const key of ['DATABASE_URL','RESEND_API_KEY','BETTER_AUTH_SECRET','NEON_API_KEY',
    'ELECTRON_RUN_AS_NODE','GITHUB_TOKEN','AWS_SECRET_ACCESS_KEY','OPENAI_API_KEY'])
    assert.equal(env[key],undefined);
  assert.equal(env.Path,'C:/Windows', 'somente variáveis essenciais do sistema passam');
  assert.throws(()=>ambienteLab('https://prumo-qa-auth-dev.onrender.com',pasta),/LAB_AMBIENTE_INVALIDO/);
  assert.throws(()=>ambienteLab('http://0.0.0.0:38652',pasta),/LAB_AMBIENTE_INVALIDO/);
  assert.throws(()=>ambienteLab('http://localhost:38652',pasta),/LAB_AMBIENTE_INVALIDO/);
  const emails=[{para:'outra@prumo.test',texto:'000001'},
    {para:'laboratorio@prumo.test',texto:'Seu codigo de teste: 048213'}];
  assert.equal(ultimoCodigoLab(emails,'laboratorio@prumo.test'),'048213');
  assert.throws(()=>ultimoCodigoLab(emails,'inexistente@prumo.test'),/LAB_EMAIL_LOCAL_NAO_RECEBIDO/);
});
