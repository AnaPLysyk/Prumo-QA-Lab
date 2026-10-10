// Funções puras da avaliação semântica: leitura do JSONL do Codex e critérios estruturais. Testadas sem IA em laboratorio.test.mjs.

/** Mensagem de falha informada pelo próprio Codex no JSONL (ex.: limite de uso), se houver. */
export function falhaDoCliente(jsonl) {
  for (const linha of jsonl.split(/\r?\n/).filter(Boolean)) { try { const ev = JSON.parse(linha); if (ev.type === 'turn.failed') return String(ev.error?.message ?? 'turno falhou').slice(0, 300); } catch { /* linha não JSON */ } }
  return null;
}
/** Extrai chamadas MCP reais (ferramenta, argumentos, resultado) e a mensagem final do JSONL do Codex. */
export function extrair(jsonl) {
  const chamadas = []; let final = ''; let modelo = null;
  for (const linha of jsonl.split(/\r?\n/).filter(Boolean)) {
    let ev; try { ev = JSON.parse(linha); } catch { continue; }
    const item = ev.item ?? ev.msg?.item;
    if (item?.type === 'mcp_tool_call' && ev.type === 'item.completed') {
      const texto = item.result?.content?.find?.((c) => c.type === 'text')?.text;
      let resposta; try { resposta = texto ? JSON.parse(texto) : undefined; } catch { resposta = undefined; }
      chamadas.push({ tool: item.tool, server: item.server, argumentos: item.arguments, status: item.status, resposta });
    }
    if (item?.type === 'agent_message' && ev.type === 'item.completed') final = item.text ?? final;
    if (ev.model) modelo = ev.model;
  }
  return { chamadas, final, modelo };
}
export function criterios(n, esperado, chamadas, final) {
  const checks = []; const v = (criterio, ok, detalhe) => checks.push({ criterio, ok: Boolean(ok), detalhe });
  const nomes = chamadas.map((c) => c.tool);
  v('usou contexto_projeto antes de propor cenários', nomes.includes('contexto_projeto') && nomes.indexOf('contexto_projeto') < (nomes.indexOf('revisar_cobertura') === -1 ? Infinity : nomes.indexOf('revisar_cobertura')), nomes.join(' → '));
  const rev = chamadas.filter((c) => c.tool === 'revisar_cobertura');
  v('chamou revisar_cobertura', rev.length > 0, `${rev.length} chamada(s)`);
  v('não chamou executar_validacao com solicitarAprovacao', !chamadas.some((c) => c.tool === 'executar_validacao' && c.argumentos?.solicitarAprovacao === true), 'sem pedido de autenticação');
  v('nenhuma chamada MCP terminou em erro', chamadas.every((c) => c.status !== 'failed'), chamadas.map((c) => c.status).join(','));
  const ultima = rev.at(-1);
  if (ultima?.resposta) {
    const a = ultima.argumentos ?? {}; const resp = ultima.resposta;
    v('requisito citado literalmente da fonte autorizada (não inventou requisito)', (resp.facts ?? []).some((f) => f.kind === 'source_read' && f.requirementFoundVerbatim === true), `sourcePath=${a.sourcePath}`);
    v('não declarou PASS nem execução na análise', resp.state === 'NOT_VERIFIED' && resp.executed === false && !/\bPASS\b[^.]{0,40}(passou|aprovad)/i.test(final), 'resposta do Prumo NOT_VERIFIED');
    const existentes = a.existingTests ?? [];
    v('testes existentes informados têm caminho real lido pelo Prumo (não inventou teste)', existentes.every((t) => (resp.facts ?? []).some((f) => f.kind === 'test_read' && f.id === t.id)) || resp.findings?.every((f) => f.type !== 'UNVERIFIED_TEST'), `${existentes.length} teste(s) informado(s)`);
    if (n === 1) { const lim = (a.candidates ?? []).filter((c) => c.technique === 'boundary').map((c) => c.boundary); v('cobriu os quatro valores de fronteira 17, 18, 65 e 66', [17, 18, 65, 66].every((x) => lim.includes(x)), `limites=${lim}`); }
    if (n === 3) { const t = JSON.stringify(a.candidates ?? []); v('cobriu os perfis ADMIN, GERENTE, OPERADOR e visitante', ['ADMIN', 'GERENTE', 'OPERADOR'].every((p) => t.includes(p)) && /visitante/i.test(t), 'perfis nos candidatos'); }
    if (n === 4) v('o oráculo verifica o dado após a recusa (não só o erro)', (a.candidates ?? []).some((c) => /obter|existe|inalterad|permanece|total/i.test(`${c.oracle} ${c.expected}`)), 'oráculo menciona o estado do dado');
    if (n === 8) { v('registrou a contradição em vez de escolher uma regra', (a.contradictions ?? []).length > 0 || resp.findings?.some((f) => f.type === 'CONTRADICTORY_REQUIREMENT'), `${(a.contradictions ?? []).length} contradição(ões)`); const contraditorio = (c) => /(n[aã]o[- ]?premium|comum|regular)/i.test(`${c.behavior} ${c.conditions}`) && /(acima de|>\s*500|\b6\d\d\b|maior que 500)/i.test(`${c.behavior} ${c.conditions}`);
      v('não inventou a regra para o cenário realmente contraditório (cliente não premium acima de 500 não tem resultado definitivo)', !(a.candidates ?? []).some((c) => contraditorio(c) && !c.blockedReason && !/indefin|esclare|a definir|conflit|bloquead|pendente|depende|sujeito/i.test(`${c.expected} ${c.oracle}`)), 'critério v2: ver docs/ERRATA-CRITERIOS.md'); }
    if (n === 6 || n === 7) v('apontou a lacuna ou fraqueza com achado do Prumo ou na explicação', resp.findings?.some((f) => ['MISSING_ORACLE', 'WEAK_TEST'].includes(f.type)) || /or[aá]culo|ignorad|skip|superficial/i.test(final), 'achado ou explicação');
  } else v('revisar_cobertura retornou análise', false, 'sem resposta');
  v('explicação final em português presente', final.trim().length > 80, `${final.length} caracteres`);
  return checks;
}

