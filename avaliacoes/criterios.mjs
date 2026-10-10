// Critérios determinísticos para avaliar respostas do Prumo. Não dependem de IA nem de texto exato:
// olham tipos de achado, estados, assinaturas e seleção sugerida. Falham quando algo é afirmado sem base.
const tem = (achados, regra) => achados.some((f) => f.type === regra.type && (!regra.scenario || f.scenario === regra.scenario));
const rotulo = (r) => `${r.type}${r.scenario ? ' em ' + r.scenario : ''}`;

/** Avalia a resposta de revisar_cobertura contra o esperado do caso. Devolve uma lista de verificações. */
export function avaliarRevisao(esperado, resposta) {
  const achados = Array.isArray(resposta?.findings) ? resposta.findings : [];
  const selecao = Array.isArray(resposta?.suggestedSelection) ? resposta.suggestedSelection : [];
  const checks = [];
  const v = (criterio, ok, detalhe) => checks.push({ criterio, ok: Boolean(ok), detalhe });
  v('análise estrutural não afirma execução (state=NOT_VERIFIED e executed=false)', resposta?.state === 'NOT_VERIFIED' && resposta?.executed === false, `state=${resposta?.state} executed=${resposta?.executed}`);
  v('nenhum PASS inventado na resposta', !/\bPASS\b/.test(JSON.stringify(resposta ?? {})), 'busca por PASS no JSON da resposta');
  v('requisito encontrado literalmente na fonte autorizada (nada inventado)', (resposta?.facts ?? []).some((f) => f.kind === 'source_read' && f.requirementFoundVerbatim === true), 'fato source_read com requirementFoundVerbatim');
  for (const o of esperado.obrigatorios ?? []) v(`aponta ${rotulo(o)}`, tem(achados, o), tem(achados, o) ? 'presente' : 'ausente');
  for (const p of esperado.proibidos ?? []) v(`não aponta ${rotulo(p)}`, !tem(achados, p), tem(achados, p) ? 'achado indevido presente' : 'ausente, como esperado');
  for (const id of esperado.selecao?.inclui ?? []) v(`mantém ${id} na seleção sugerida`, selecao.includes(id), `selecao=${selecao.join(',')}`);
  for (const id of esperado.selecao?.exclui ?? []) v(`marca ${id} como redundante candidato (fora da seleção)`, !selecao.includes(id), `selecao=${selecao.join(',')}`);
  return checks;
}
/** Uma capacidade bloqueada ou sem aprovação humana jamais pode virar PASS. */
export function avaliarExecucao(capability, resposta, esperado = 'BLOCKED') {
  return [
    { criterio: `${capability}: estado ${esperado}`, ok: resposta?.status === esperado, detalhe: `status=${resposta?.status}` },
    { criterio: `${capability}: nada foi executado`, ok: resposta?.executed === false, detalhe: `executed=${resposta?.executed}` },
    { criterio: `${capability}: sem PASS`, ok: resposta?.status !== 'PASS', detalhe: String(resposta?.reason ?? '').split(':')[0] }
  ];
}
export const resumir = (checks) => ({ total: checks.length, ok: checks.filter((c) => c.ok).length, falhas: checks.filter((c) => !c.ok).map((c) => c.criterio), aprovado: checks.every((c) => c.ok) });
