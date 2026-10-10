// Métricas objetivas calculadas SOMENTE de resultados reais gravados em avaliacoes/resultados/ (fórmulas em docs/METRICAS.md).
// Regras: avaliação não executada nunca entra como aprovada nem como zero (vira "n/a"); chamada MCP bem-sucedida não é análise correta;
// nenhum consumo de tokens ou custo é calculado (não há dado verificável).
// Uso: node avaliacoes/metricas.mjs [--sem-gravar]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(lab, 'avaliacoes', 'resultados');
const pct = (n, d) => (d === 0 ? 'n/a' : Math.round((n / d) * 1000) / 10);
const ler = (n) => JSON.parse(fs.readFileSync(path.join(pasta, n), 'utf8'));
const ultimos = (sufixo) => fs.readdirSync(pasta).filter((n) => n.endsWith(sufixo)).sort();

export function calcular() {
  const m = { geradoEm: new Date().toISOString() };
  // 1. Determinística (núcleo do Prumo pelo MCP real): por versão/commit
  m.deterministica = ultimos('-deterministico.json').map((n) => {
    const r = ler(n); const crit = [...r.casos.flatMap((c) => c.checks), ...r.gerais.checks];
    const falhas = crit.filter((c) => !c.ok).map((c) => c.criterio);
    return { arquivo: n, prumo: `${r.prumo.versao}${r.prumo.commit ? '@' + r.prumo.commit : ''}`, casosAprovados: `${r.casos.filter((c) => c.aprovado).length}/${r.casos.filter((c) => c.estado !== 'NAO_APLICAVEL').length}`, casosNaoAplicaveis: r.casos.filter((c) => c.estado === 'NAO_APLICAVEL').length,
      criteriosAtendidos: crit.filter((c) => c.ok).length, criteriosNaoAtendidos: falhas.length, criteriosNaoAvaliados: 0,
      achadosObrigatoriosApontados: `${crit.filter((c) => c.ok && /^aponta /.test(c.criterio)).length}/${crit.filter((c) => /^aponta /.test(c.criterio)).length}`,
      falsosPositivos: crit.filter((c) => !c.ok && /^não aponta /.test(c.criterio)).length,
      cenariosNecessariosOmitidos: crit.filter((c) => !c.ok && /^mantém /.test(c.criterio)).length,
      redundanciasIndevidas: crit.filter((c) => !c.ok && /redundante candidato|POTENTIAL_REDUNDANCY/.test(c.criterio)).length,
      taxaCriterios: pct(crit.filter((c) => c.ok).length, crit.length), falhas };
  });
  // 2. Mutantes e detecção
  const det = ultimos('-deteccao.json').at(-1);
  if (det) { const r = ler(det); const sob = r.resultados.filter((x) => !x.existentesDetectam);
    m.mutantes = { arquivo: det, total: r.resultados.length, detectadosPelaSuiteOriginal: r.resultados.filter((x) => x.existentesDetectam).length, sobreviventesDaSuiteOriginal: sob.length,
      sobreviventesDetectadosPorTesteNovo: sob.filter((x) => x.diferenciaOsComportamentos).length,
      identificadosAutonomamentePeloPrumo: sob.filter((x) => x.prumo?.identificouODefeito === true).length, identificadosParcialmentePeloPrumo: sob.filter((x) => x.prumo?.identificouODefeito === 'parcial').length,
      taxaDeteccaoSuiteOriginal: pct(r.resultados.filter((x) => x.existentesDetectam).length, r.resultados.length), taxaDeteccaoTesteNovoSobreSobreviventes: pct(sob.filter((x) => x.diferenciaOsComportamentos).length, sob.length),
      taxaIdentificacaoAutonomaDoPrumo: pct(sob.filter((x) => x.prumo?.identificouODefeito === true).length, sob.length) }; }
  // 3. Semântica (conduta do agente com Prumo) e comparação A/B: execuções reais apenas
  const sem = ultimos('-semantica.json').at(-1);
  if (sem) { const r = ler(sem); const feitos = r.casos.filter((c) => c.estado !== 'NAO_EXECUTADA');
    m.semantica = { arquivo: sem, casos: r.casos.length, executados: feitos.length, naoExecutados: r.casos.length - feitos.length, atendeu: feitos.filter((c) => c.estado === 'ATENDEU').length, taxaAtendeuSobreExecutados: pct(feitos.filter((c) => c.estado === 'ATENDEU').length, feitos.length) }; }
  const cmp = ultimos('.json').filter((n) => /-comparacao-/.test(n)).at(-1);
  if (cmp) { const r = ler(cmp); const arm = (b) => { const rs = r.registros.filter((x) => x.braco === b); const f = rs.filter((x) => x.estado !== 'NAO_EXECUTADA'); const crit = f.flatMap((x) => x.criterios);
      return { execucoes: rs.length, executadas: f.length, naoExecutadas: rs.length - f.length, criteriosAtendidos: crit.filter((c) => c.ok).length, criteriosAvaliados: crit.length, taxa: pct(crit.filter((c) => c.ok).length, crit.length),
        cenariosPropostos: f.length ? Math.round((f.reduce((n, x) => n + (x.respostaEstruturada?.cenarios?.length ?? 0), 0) / f.length) * 10) / 10 : 'n/a', duracaoMediaMs: f.length ? Math.round(f.reduce((n, x) => n + (x.duracaoMs ?? 0), 0) / f.length) : 'n/a' }; };
    m.comparacao = { arquivo: cmp, cliente: r.cliente, repeticoes: r.repeticoes, rubricaSha256: r.rubricaSha256, A_semPrumo: arm('A'), B_comPrumo: arm('B'), conclusao: r.resumo.observacao }; }
  m.naoCalculado = ['tokens', 'custo', 'cobertura funcional', 'bugs corrigidos'];
  return m;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const m = calcular(); console.log(JSON.stringify(m, null, 2));
  if (!process.argv.includes('--sem-gravar')) fs.writeFileSync(path.join(pasta, `${m.geradoEm.slice(0, 10)}-metricas.json`), JSON.stringify(m, null, 2) + '\n');
}
