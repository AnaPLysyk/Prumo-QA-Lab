// Detecção dos defeitos (mutantes) por testes NOVOS, com a suíte original preservada para comparação.
// Para cada mutante registra, separadamente: (a) a suíte original o detecta? (b) os testes novos passam na aplicação íntegra?
// (c) os testes novos falham no mutante? Só (b)+(c) provam que o teste diferencia o comportamento correto do defeituoso.
// IMPORTANTE: "detectado por teste novo" NÃO é "identificado pelo Prumo": o campo `prumo` registra, à parte, o que o Prumo
// apontou de forma autônoma (achados estruturais), que nunca é o defeito em si.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutantes } from './mutantes.mjs';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const limpo = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'));
/** Arquivo de detecção de cada mutante (os controles de frete já são detectados pela suíte original). */
export const deteccao = { 'elegibilidade-limite-inferior': 'elegibilidade', 'acesso-gerente-fechado': 'acesso', 'pedidos-recusa-altera-dado': 'pedidos', 'cupom-desconto-errado': 'cupom' };
/** O que o Prumo apontou sozinho (ver resultados determinísticos); nenhum deles é o defeito. */
export const prumoAutonomo = {
  'elegibilidade-limite-inferior': { identificouODefeito: false, apontou: 'MISSING_BOUNDARY apenas no cenário c5 do plano recebido (limite sem valor); não percebeu que o teste existente não exercita 18', caso: 1 },
  'acesso-gerente-fechado': { identificouODefeito: false, apontou: 'MISSING_CONDITIONS apenas no cenário c6 do plano recebido; não percebeu que GERENTE e OPERADOR não têm teste existente', caso: 3 },
  'pedidos-recusa-altera-dado': { identificouODefeito: false, apontou: 'MISSING_ORACLE apenas no cenário c2 do plano recebido; não percebeu que "lança erro" não prova persistência no teste existente', caso: 4 },
  'cupom-desconto-errado': { identificouODefeito: 'parcial', apontou: 'WEAK_TEST no arquivo com teste ignorado (por arquivo, também sinaliza o teste válido do mesmo arquivo); não avaliou o conteúdo da assertion superficial', caso: 7 }
};
const node = (args, cwd, env = {}) => { const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...limpo(), ...env } }); return { ok: r.status === 0, resumo: r.stdout.split('\n').filter((l) => /^ℹ (tests|pass|fail)/.test(l)).join(' ') }; };

export function avaliarMutante(m) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo lab deteccao '));
  try {
    fs.cpSync(path.join(lab, 'aplicacao'), path.join(tmp, 'aplicacao'), { recursive: true });
    const alvo = path.join(tmp, 'aplicacao', m.arquivo); const original = fs.readFileSync(alvo, 'utf8');
    if (!original.includes(m.de)) throw new Error(`mutação não aplicável: ${m.id}`);
    fs.writeFileSync(alvo, original.replace(m.de, m.para));
    const testesOriginais = fs.readdirSync(path.join(lab, 'aplicacao', 'testes')).filter((n) => n.endsWith('.test.mjs')).map((n) => path.join('aplicacao', 'testes', n));
    const existentes = node(['--test', ...testesOriginais], tmp);
    const r = { id: m.id, significado: m.significado, existentesDetectam: !existentes.ok };
    const arq = deteccao[m.id];
    if (arq) {
      const teste = path.join('avaliacoes', 'deteccao', `${arq}.deteccao.test.mjs`);
      const noOriginal = node(['--test', teste], lab, { LAB_APP_DIR: path.join(lab, 'aplicacao') });
      const noMutante = node(['--test', teste], lab, { LAB_APP_DIR: path.join(tmp, 'aplicacao') });
      Object.assign(r, { novosPassamNoOriginal: noOriginal.ok, novosDetectamMutante: !noMutante.ok, diferenciaOsComportamentos: noOriginal.ok && !noMutante.ok, saidaNoMutante: noMutante.resumo, prumo: prumoAutonomo[m.id] });
    } else Object.assign(r, { novosPassamNoOriginal: null, novosDetectamMutante: null, diferenciaOsComportamentos: null, observacao: 'controle: a suíte original já detecta; não há teste novo' });
    return r;
  } finally { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultados = mutantes.map(avaliarMutante);
  const resultado = { tipo: 'deteccao-de-mutantes', geradoEm: new Date().toISOString(), node: process.version, resultados,
    resumo: { mutantes: resultados.length, detectadosPelaSuiteOriginal: resultados.filter((r) => r.existentesDetectam).length, sobreviventesDaSuiteOriginal: resultados.filter((r) => !r.existentesDetectam).length,
      sobreviventesDetectadosPorTesteNovo: resultados.filter((r) => !r.existentesDetectam && r.diferenciaOsComportamentos).length, identificadosAutonomamentePeloPrumo: resultados.filter((r) => r.prumo?.identificouODefeito === true).length } };
  for (const r of resultados) console.log(`${r.id}: suíte original ${r.existentesDetectam ? 'DETECTA' : 'não detecta'} | teste novo ${r.diferenciaOsComportamentos === null ? 'n/a' : r.diferenciaOsComportamentos ? 'DIFERENCIA (passa no correto, falha no mutante)' : 'NÃO diferencia'} | Prumo autônomo: ${r.prumo ? r.prumo.identificouODefeito : 'n/a'}`);
  console.log(JSON.stringify(resultado.resumo));
  if (!process.argv.includes('--sem-gravar')) { fs.mkdirSync(path.join(lab, 'avaliacoes', 'resultados'), { recursive: true }); fs.writeFileSync(path.join(lab, 'avaliacoes', 'resultados', `${resultado.geradoEm.slice(0, 10)}-deteccao.json`), JSON.stringify(resultado, null, 2) + '\n'); }
  process.exitCode = resultados.filter((r) => r.diferenciaOsComportamentos === false).length ? 1 : 0;
}
