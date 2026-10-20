import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { avisoDeVersaoPendente as avisoPendente } from '../../../../dist/atualizacoes/regras/avisoDeVersaoPendente.js';
import { marcarVersaoVista as marcarVisualizada } from '../../../../dist/atualizacoes/regras/marcarVersaoVista.js';
import { registrarConsultaDeVersao as registrarConsulta } from '../../../../dist/atualizacoes/regras/registrarConsultaDeVersao.js';
import { lerPreferencias } from '../../../../dist/configuracoes/banco/lerPreferencias.js';
import { alterarPreferencias } from '../../../../dist/configuracoes/regras/alterarPreferencias.js';
import { padrao } from '../../../../dist/configuracoes/tipos/configuracoes.js';

const base = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-pref-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const nova = { versao: '9.9.0', notas: '- Correção importante\n- Segurança reforçada' };

test('padrão: aviso automático de versão nova ligado (2.10.1), som desligado, sem aviso pendente', (t) => {
  const b = base(t); assert.deepEqual(lerPreferencias(b), padrao);
  assert.equal(padrao.avisoAutomatico, true); assert.equal(padrao.verificarAoIniciar, false); assert.equal(padrao.som, false);
  assert.equal(avisoPendente('2.4.0', b).indicador, false);
});

test('arquivo da 2.9 (verificarAoIniciar=false gravado, sem avisoAutomatico) passa a avisar; desligar é respeitado', (t) => {
  const b = base(t); fs.mkdirSync(b, { recursive: true });
  fs.writeFileSync(path.join(b, 'preferencias.json'), JSON.stringify({ version: 1, verificarAoIniciar: false, som: false, silenciar: false, versaoVisualizada: null, versaoNotificada: null, disponivel: null, ultimaConsulta: null }));
  assert.equal(lerPreferencias(b).avisoAutomatico, true);
  alterarPreferencias({ avisoAutomatico: false }, b); assert.equal(lerPreferencias(b).avisoAutomatico, false);
});

test('notificação visual: uma vez por versão, independente do som; silenciar só cala o som', (t) => {
  const b = base(t); alterarPreferencias({ silenciar: true }, b);
  const r1 = registrarConsulta(nova, b); assert.equal(r1.notificar, true); assert.equal(r1.tocarSom, false);
  assert.equal(registrarConsulta(nova, b).notificar, false, 'a mesma versão não notifica de novo');
  marcarVisualizada('9.9.0', b); assert.equal(registrarConsulta(nova, b).notificar, false, 'versão vista não notifica');
  assert.equal(registrarConsulta({ versao: '9.10.0', notas: '' }, b).notificar, true, 'versão mais nova notifica');
  assert.equal(registrarConsulta(null, b).notificar, false);
});

test('uma consulta com versão nova acende o indicador e ele persiste ao reabrir (offline)', (t) => {
  const b = base(t); const r = registrarConsulta(nova, b);
  assert.equal(r.indicador, true); assert.equal(r.versao, '9.9.0');
  const aviso = avisoPendente('2.4.0', b); assert.equal(aviso.indicador, true); assert.equal(aviso.versao, '9.9.0'); assert.match(aviso.notas, /Correção/);
  assert.equal(avisoPendente('9.9.0', b).indicador, false, 'quem já instalou a versão não é avisado');
});

test('som: só com som ligado, não silenciado, e no máximo UMA vez por versão', (t) => {
  const b = base(t);
  assert.equal(registrarConsulta(nova, b).tocarSom, false, 'som desligado por padrão');
  alterarPreferencias({ som: true }, b);
  // a versão já foi notificada acima (sem som): não toca retroativamente, mas uma versão mais nova toca
  assert.equal(registrarConsulta(nova, b).tocarSom, false);
  const v2 = { versao: '9.10.0', notas: 'x'.repeat(10) };
  assert.equal(registrarConsulta(v2, b).tocarSom, true, 'primeira vez da versão nova');
  assert.equal(registrarConsulta(v2, b).tocarSom, false, 'não repete na consulta seguinte');
  assert.equal(registrarConsulta(v2, b).tocarSom, false, 'nem ao reabrir');
  assert.equal(lerPreferencias(b).versaoNotificada, '9.10.0');
});

test('silenciar impede o som mesmo com som ligado, e visualizar apaga o indicador sem regredir', (t) => {
  const b = base(t); alterarPreferencias({ som: true, silenciar: true }, b);
  const r = registrarConsulta(nova, b); assert.equal(r.indicador, true); assert.equal(r.tocarSom, false);
  marcarVisualizada('9.9.0', b); assert.equal(avisoPendente('2.4.0', b).indicador, false);
  marcarVisualizada('9.0.0', b); assert.equal(lerPreferencias(b).versaoVisualizada, '9.9.0', 'nunca regride');
  assert.equal(registrarConsulta(nova, b).indicador, false, 'versão vista não reacende');
  assert.equal(registrarConsulta({ versao: '10.0.0', notas: '' }, b).indicador, true, 'versão mais nova reacende');
});

test('consulta "já atualizado" limpa a versão disponível; entradas inválidas são recusadas', (t) => {
  const b = base(t); registrarConsulta(nova, b);
  const r = registrarConsulta(null, b); assert.equal(r.indicador, false); assert.equal(lerPreferencias(b).disponivel, null);
  assert.throws(() => alterarPreferencias({ versaoVisualizada: '1.0.0' }, b), 'campos de versão não são alteráveis pela interface');
  assert.throws(() => alterarPreferencias({ som: 'sim' }, b));
  assert.throws(() => marcarVisualizada('abc', b), /INVALID_VERSION/);
});

test('arquivo adulterado ou ilegível volta ao padrão seguro, sem lançar', (t) => {
  const b = base(t); fs.writeFileSync(path.join(b, 'preferencias.json'), '{"version":1,"som":"talvez"}'); assert.deepEqual(lerPreferencias(b), padrao);
  fs.writeFileSync(path.join(b, 'preferencias.json'), 'não é json'); assert.deepEqual(lerPreferencias(b), padrao);
});
