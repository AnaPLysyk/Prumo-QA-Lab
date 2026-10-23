import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { abrir, novoDados, ir } from '../../infra/janela.mjs';
import { concluirTrabalho as concluir } from '../../../../dist/agendamentos/banco/fila.js';
import { enfileirar } from '../../../../dist/agendamentos/banco/fila.js';
import { obterTrabalho } from '../../../../dist/agendamentos/banco/fila.js';
import { pegarProximoTrabalho as reivindicar } from '../../../../dist/agendamentos/banco/fila.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/cicloDaRotina.js';

// Dados no formato da 2.8 (agenda, fila, histórico), sem nenhum dos arquivos novos da 2.9.
// No modelo atual, a pasta legado permanece intacta, mas nao e atribuida automaticamente a uma conta.
test('legado 2.8 fica preservado no disco e isolado de nova conta, sem escrita externa', async (t) => {
  const dados = novoDados(t); const a0 = await abrir(t, dados, [], {}, { inicio: true });
  const e = (await a0.page.evaluate(() => window.prumo.espacoCriar({ nome: 'LEGADO-28', descricao: 'dados da 2.8' }))).data; await a0.fechar();
  const rotina = criarRotina({ nome: 'Regressão noturna', espacoId: e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', frequencia: { tipo: 'diario', hora: '02:00' }, fuso: 'America/Sao_Paulo' }, dados);
  const { trabalho } = enfileirar({ chave: 'legado-1', rotinaId: rotina.id, espacoId: e.id, tipo: 'regressao', capability: 'unit', ambiente: 'teste', origem: 'MANUAL', slot: null }, dados); reivindicar(dados);
  concluir(trabalho.id, { status: 'PASS', motivo: 'ok', contagem: { pass: 3, fail: 0, blocked: 0, notRun: 0 } }, dados);
  const pasta = path.join(dados, 'plataforma'); const novos = ['operacoes-externas.json', 'permissoes-servicos.json', 'propostas.json', 'runs-qase.json', 'agentes.json'];
  for (const n of novos) assert.ok(!fs.existsSync(path.join(pasta, n)), n + ' ainda não existe (formato 2.8)');
  const antes = fs.readFileSync(path.join(pasta, 'agenda.json'), 'utf8');

  const a = await abrir(t, dados, [], {}, { inicio: true });
  assert.equal((await a.page.evaluate(() => window.prumo.agendaListar())).data.length, 0, 'conta atual nao importa automaticamente dados antigos sem proprietario');
  assert.equal(obterTrabalho(trabalho.id, dados).resultado.status, 'PASS', 'histórico da 2.8 preservado');
  const est = (await a.page.evaluate((id) => window.prumo.escritaEstado(id), e.id)).data; assert.ok(est.servicos.every((s) => s.escrita === false), 'escrita externa desligada por padrão');
  const ag = (await a.page.evaluate((id) => window.prumo.agentesEstado(id), e.id)).data; assert.equal(ag.configuracao.padrao, true, 'agentes partem do padrão');
  for (const aba of ['inicio', 'testes', 'runs', 'vinculos', 'agentes', 'metricas', 'agenda']) await ir(a.page, aba);
  assert.equal(fs.readFileSync(path.join(pasta, 'agenda.json'), 'utf8'), antes, 'abrir as telas novas não reescreve a agenda');
  assert.deepEqual(a.erros, []);
});
