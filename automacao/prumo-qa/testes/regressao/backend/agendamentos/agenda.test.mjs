import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { agendaPausada as pausaGlobal } from '../../../../dist/agendamentos/banco/agendaPausada.js';
import { listarRotinas } from '../../../../dist/agendamentos/banco/listarRotinas.js';
import { obterRotina } from '../../../../dist/agendamentos/banco/obterRotina.js';
import { criarRotina } from '../../../../dist/agendamentos/regras/criarRotina.js';
import { definirPausaGlobal } from '../../../../dist/agendamentos/regras/definirPausaGlobal.js';
import { desativarRotina } from '../../../../dist/agendamentos/regras/desativarRotina.js';
import { editarRotina } from '../../../../dist/agendamentos/regras/editarRotina.js';
import { excluirRotina } from '../../../../dist/agendamentos/regras/excluirRotina.js';
import { horariosEntre as slotsEntre } from '../../../../dist/agendamentos/regras/horariosEntre.js';
import { horariosVencidos as slotsVencidos } from '../../../../dist/agendamentos/regras/horariosVencidos.js';
import { instanteLocal } from '../../../../dist/agendamentos/regras/instanteLocal.js';
import { marcarHorarioTratado as marcarSlot } from '../../../../dist/agendamentos/regras/marcarHorarioTratado.js';
import { pausarRotina } from '../../../../dist/agendamentos/regras/pausarRotina.js';
import { proximoHorario as proximoSlot } from '../../../../dist/agendamentos/regras/proximoHorario.js';
import { retomarRotina } from '../../../../dist/agendamentos/regras/retomarRotina.js';

const base = (t) => { const b = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo agenda ')); t.after(() => fs.rmSync(b, { recursive: true, force: true })); return b; };
const iso = (ms) => new Date(ms).toISOString();
const espacoId = randomUUID();
const dados = (extra = {}) => ({ nome: 'Rotina', espacoId, tipo: 'smoke', capability: 'unit', ambiente: 'local', frequencia: { tipo: 'diario', hora: '09:00' }, fuso: 'America/Sao_Paulo', ...extra });

test('fuso: horário de parede vira o instante UTC certo, inclusive no verão', () => {
  assert.equal(iso(instanteLocal(2026, 7, 1, '09:00', 'America/Sao_Paulo')), '2026-07-01T12:00:00.000Z');
  assert.equal(iso(instanteLocal(2026, 7, 1, '09:00', 'America/New_York')), '2026-07-01T13:00:00.000Z');
  assert.equal(iso(instanteLocal(2026, 1, 15, '09:00', 'America/New_York')), '2026-01-15T14:00:00.000Z');
});

test('horário de verão: salto da primavera avança para depois do salto; fim do verão usa a primeira ocorrência', () => {
  // 08/03/2026 02:30 não existe em Nova York (02:00 -> 03:00): executa 03:30 local (07:30Z), uma única vez.
  assert.equal(iso(instanteLocal(2026, 3, 8, '02:30', 'America/New_York')), '2026-03-08T07:30:00.000Z');
  // 01/11/2026 01:30 ocorre duas vezes; vale a primeira (EDT, 05:30Z).
  assert.equal(iso(instanteLocal(2026, 11, 1, '01:30', 'America/New_York')), '2026-11-01T05:30:00.000Z');
});

test('diário: um slot por dia de parede, estável antes e depois da mudança de horário', () => {
  const r = { frequencia: { tipo: 'diario', hora: '09:00' }, fuso: 'America/New_York', ancora: '2026-03-05T00:00:00.000Z' };
  const s = slotsEntre(r, Date.parse('2026-03-06T00:00:00Z'), Date.parse('2026-03-12T23:59:00Z')).map(iso);
  assert.equal(s.length, 7); assert.equal(new Set(s).size, 7);
  assert.equal(s[0], '2026-03-06T14:00:00.000Z'); // EST
  assert.ok(s.includes('2026-03-09T13:00:00.000Z')); // EDT depois do salto
  assert.ok(!s.includes('2026-03-08T14:00:00.000Z'));
});

test('semanal: somente nos dias escolhidos, no horário do fuso', () => {
  const r = { frequencia: { tipo: 'semanal', dias: [1, 3], hora: '10:00' }, fuso: 'America/Sao_Paulo', ancora: '2026-10-05T00:00:00.000Z' };
  const s = slotsEntre(r, Date.parse('2026-10-05T00:00:00Z'), Date.parse('2026-10-18T00:00:00Z')).map(iso);
  assert.deepEqual(s, ['2026-10-05T13:00:00.000Z', '2026-10-07T13:00:00.000Z', '2026-10-12T13:00:00.000Z', '2026-10-14T13:00:00.000Z']);
  for (const x of s) assert.ok([1, 3].includes(new Date(Date.parse(x) - 3 * 3600000).getUTCDay()));
});

test('intervalo: ancorado na criação, igual depois de reiniciar; único: exatamente uma vez', () => {
  const r = { frequencia: { tipo: 'intervalo', minutos: 30 }, fuso: 'UTC', ancora: '2026-10-10T10:00:00.000Z' };
  assert.deepEqual(slotsEntre(r, Date.parse('2026-10-10T10:00:00Z'), Date.parse('2026-10-10T11:30:00Z')).map(iso), ['2026-10-10T10:30:00.000Z', '2026-10-10T11:00:00.000Z', '2026-10-10T11:30:00.000Z']);
  assert.deepEqual(slotsEntre(r, Date.parse('2026-10-10T10:40:00Z'), Date.parse('2026-10-10T11:10:00Z')).map(iso), ['2026-10-10T11:00:00.000Z']);
  const u = { frequencia: { tipo: 'unico', em: '2026-10-11T08:00:00-03:00' }, fuso: 'UTC', ancora: '2026-10-10T00:00:00.000Z' };
  assert.deepEqual(slotsEntre(u, 0, Date.parse('2027-01-01T00:00:00Z')).map(iso), ['2026-10-11T11:00:00.000Z']);
  assert.equal(slotsEntre(u, Date.parse('2026-10-11T11:00:00Z'), Date.parse('2027-01-01T00:00:00Z')).length, 0);
});

test('CRUD persistente, validação e isolamento por projeto', (t) => {
  const b = base(t); const agora = new Date('2026-10-10T12:00:00Z');
  const a = criarRotina(dados(), b, agora); const outro = criarRotina(dados({ nome: 'Outra', espacoId: randomUUID() }), b, agora);
  assert.equal(listarRotinas(b).length, 2); assert.notEqual(a.id, outro.id); assert.equal(a.estado, 'ATIVA');
  assert.throws(() => criarRotina(dados({ fuso: 'Marte/Olimpo' }), b, agora)); assert.throws(() => criarRotina(dados({ capability: undefined }), b, agora), /capability/);
  assert.throws(() => criarRotina(dados({ tipo: 'k6', capability: undefined }), b, agora), /k6/); assert.throws(() => criarRotina(dados({ tipo: 'validacao-ticket', ticket: 'abc' }), b, agora));
  assert.throws(() => criarRotina(dados({ frequencia: { tipo: 'unico', em: '2020-01-01T00:00:00Z' } }), b, agora), /SCHEDULE_IN_THE_PAST/);
  assert.throws(() => criarRotina(dados({ comando: 'rm -rf /' }), b, agora)); // campos desconhecidos (comando arbitrário) são recusados
  assert.equal(pausarRotina(a.id, b).estado, 'PAUSADA'); assert.equal(retomarRotina(a.id, b, agora).estado, 'ATIVA');
  assert.throws(() => editarRotina(a.id, dados({ espacoId: randomUUID() }), b), /SCHEDULE_PROJECT_IMMUTABLE/);
  assert.equal(editarRotina(a.id, dados({ nome: 'Renomeada' }), b, agora).nome, 'Renomeada');
  assert.equal(desativarRotina(a.id, b).estado, 'DESATIVADA'); excluirRotina(outro.id, b); assert.equal(listarRotinas(b).length, 1);
  assert.throws(() => obterRotina(outro.id, b), /SCHEDULE_NOT_FOUND/);
  assert.equal(definirPausaGlobal(true, b), true); assert.equal(pausaGlobal(b), true);
});

test('horários perdidos: PULAR registra perdido fora da tolerância; EXECUTAR_UMA_VEZ roda só o mais recente', (t) => {
  const b = base(t); const criada = new Date('2026-10-10T00:00:00Z');
  const base1 = { frequencia: { tipo: 'intervalo', minutos: 60 }, fuso: 'UTC', toleranciaMinutos: 10 };
  const pular = criarRotina(dados(base1), b, criada); const uma = criarRotina(dados({ ...base1, politicaPerdido: 'EXECUTAR_UMA_VEZ' }), b, criada);
  const depois = Date.parse('2026-10-10T03:05:00Z'); // computador desligado 3h
  const vp = slotsVencidos(listarRotinas(b).find((r) => r.id === pular.id), depois);
  assert.equal(vp.length, 3); assert.deepEqual(vp.map((x) => x.executar), [false, false, true]); assert.equal(vp[0].motivo, 'PERDIDO');
  const vu = slotsVencidos(listarRotinas(b).find((r) => r.id === uma.id), depois);
  assert.deepEqual(vu.map((x) => x.executar), [false, false, true]); assert.equal(vu[0].motivo, 'SUBSTITUIDO');
  marcarSlot(pular.id, vp.at(-1).slot, b); assert.equal(slotsVencidos(listarRotinas(b).find((r) => r.id === pular.id), depois).length, 0, 'slot tratado não reaparece');
});

test('rotina pausada não vence; retomar não executa o que passou durante a pausa', (t) => {
  const b = base(t); const criada = new Date('2026-10-10T00:00:00Z');
  const r = criarRotina(dados({ frequencia: { tipo: 'intervalo', minutos: 10 }, fuso: 'UTC' }), b, criada);
  pausarRotina(r.id, b); assert.equal(slotsVencidos(listarRotinas(b)[0], Date.parse('2026-10-10T05:00:00Z')).length, 0);
  const volta = new Date('2026-10-10T05:00:00Z'); retomarRotina(r.id, b, volta);
  assert.equal(slotsVencidos(listarRotinas(b)[0], volta.getTime() + 5 * 60000).length, 0);
  assert.equal(slotsVencidos(listarRotinas(b)[0], volta.getTime() + 10 * 60000).length, 1);
  assert.equal(proximoSlot(listarRotinas(b)[0], volta.getTime() + 11 * 60000), volta.getTime() + 10 * 60000, 'slot vencido e não tratado é o próximo');
  marcarSlot(r.id, volta.getTime() + 10 * 60000, b);
  assert.equal(proximoSlot(listarRotinas(b)[0], volta.getTime() + 11 * 60000), volta.getTime() + 20 * 60000);
});

test('rotina única conclui depois do slot e nunca repete', (t) => {
  const b = base(t); const criada = new Date('2026-10-10T00:00:00Z');
  const r = criarRotina(dados({ frequencia: { tipo: 'unico', em: '2026-10-10T01:00:00Z' } }), b, criada);
  const v = slotsVencidos(r, Date.parse('2026-10-10T01:00:30Z')); assert.equal(v.length, 1);
  assert.equal(marcarSlot(r.id, v[0].slot, b).estado, 'CONCLUIDA'); assert.equal(slotsVencidos(listarRotinas(b)[0], Date.parse('2026-10-11T00:00:00Z')).length, 0);
});
