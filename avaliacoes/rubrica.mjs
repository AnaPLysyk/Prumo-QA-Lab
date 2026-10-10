// RUBRICA OBJETIVA da comparação com e sem Prumo. Definida ANTES de qualquer execução com IA e idêntica para os dois braços.
// Cada critério é uma função determinística sobre a resposta ESTRUTURADA do agente (JSON). O hash deste arquivo vai em todo resultado:
// se a rubrica mudar depois de resultados existirem, o hash muda e a comparação fica visivelmente inválida.
// tipo "estrutural": olha números/listas/campos. tipo "textual": busca palavras-chave nos textos livres (mais frágil; reportado à parte).
//
// Formato exigido da resposta (bloco ```json no final):
// { requisito, riscos[], lacunasNosTestesExistentes[], cenarios[{id,comportamento,tecnica,entrada,limite?,resultadoEsperado,oraculo,risco}],
//   redundanciasCandidatas[[a,b]], hipoteses[], incertezas[], bloqueios[], declaraExecucao:boolean }

const texto = (v) => (Array.isArray(v) ? v.map(texto).join(' ') : typeof v === 'object' && v ? Object.values(v).map(texto).join(' ') : String(v ?? ''));
const cen = (r) => (Array.isArray(r?.cenarios) ? r.cenarios : []);
const tudo = (r) => texto(r);
const lac = (r) => texto(r?.lacunasNosTestesExistentes);
const rx = (re, s) => re.test(s);
const todosOsCenarios = (r) => cen(r).map((c) => texto(c));

/** Critérios comuns a todos os casos. `doc` é o texto do requisito. */
const comuns = (limite) => [
  { id: 'formato', tipo: 'estrutural', descricao: 'responde com JSON válido contendo requisito, cenarios e declaraExecucao', avaliar: (r) => !!r && typeof r.requisito === 'string' && Array.isArray(r.cenarios) && typeof r.declaraExecucao === 'boolean' },
  { id: 'requisito-literal', tipo: 'estrutural', descricao: 'o requisito citado aparece literalmente na documentação autorizada (não inventou requisito)', avaliar: (r, doc) => typeof r?.requisito === 'string' && r.requisito.trim().length > 10 && doc.includes(r.requisito.trim()) },
  { id: 'sem-execucao-afirmada', tipo: 'estrutural', descricao: 'não afirma execução nem resultado de teste (declaraExecucao=false e sem declarações como "passaram" ou "status: PASS")', avaliar: (r) => r?.declaraExecucao === false && !rx(/passaram|passou com sucesso|(resultado|status)\s*:\s*PASS|foi executad[oa] com sucesso/i, tudo(r)) },
  { id: 'todo-cenario-tem-oraculo', tipo: 'estrutural', descricao: 'todo cenário proposto declara resultado esperado e oráculo não vazios', avaliar: (r) => cen(r).length > 0 && cen(r).every((c) => String(c.resultadoEsperado ?? '').trim() && String(c.oraculo ?? '').trim()) },
  { id: 'parcimonia', tipo: 'estrutural', descricao: `no máximo ${limite} cenários (menor conjunto justificado, sem dezenas de repetições)`, avaliar: (r) => cen(r).length >= 1 && cen(r).length <= limite }
];

export const casos = {
  1: { titulo: 'Valores-limite', limite: 8, criterios: [
    { id: 'quatro-fronteiras', tipo: 'estrutural', descricao: 'cobre os valores de fronteira 17, 18, 65 e 66 (campo limite ou entrada)', avaliar: (r) => [17, 18, 65, 66].every((n) => cen(r).some((c) => c.limite === n || new RegExp(`\\b${n}\\b`).test(String(c.entrada ?? '')))) },
    { id: 'identifica-lacuna-existente', tipo: 'textual', descricao: 'aponta que o teste existente só usa valor típico (nenhum limite)', avaliar: (r) => rx(/limite|fronteira|18|65|t[ií]pic|30/i, lac(r)) && lac(r).length > 10 }] },
  2: { titulo: 'Classes de equivalência', limite: 6, criterios: [
    { id: 'uma-por-faixa', tipo: 'estrutural', descricao: 'ao menos um cenário por faixa (SUL/SUDESTE, NORDESTE/NORTE, CENTRO_OESTE) e um para região desconhecida', avaliar: (r) => { const t = todosOsCenarios(r); return rx(/SUL|SUDESTE/i, t.join('|')) && rx(/NORDESTE|NORTE/i, t.join('|')) && rx(/CENTRO/i, t.join('|')) && t.some((c) => rx(/desconhecid|inv[aá]lid|LUA|inexistent/i, c)); } },
    { id: 'sem-duplicar-faixa', tipo: 'estrutural', descricao: 'não propõe SUL e SUDESTE como cenários independentes (mesma faixa), a menos que os declare como redundância candidata', avaliar: (r) => { const sul = cen(r).filter((c) => /\bSUL\b/i.test(texto(c)) && !/SUDESTE/i.test(texto(c))).length; const sud = cen(r).filter((c) => /SUDESTE/i.test(texto(c)) && !/\bSUL\b/i.test(texto(c))).length; return sul + sud <= 1 || rx(/SUL/i, texto(r.redundanciasCandidatas)) && rx(/SUDESTE/i, texto(r.redundanciasCandidatas)); } }] },
  3: { titulo: 'Permissões', limite: 8, criterios: [
    { id: 'cinco-combinacoes', tipo: 'estrutural', descricao: 'cobre ADMIN, GERENTE com pedido aberto, GERENTE com pedido fechado, OPERADOR e visitante', avaliar: (r) => { const t = todosOsCenarios(r); const tem = (re) => t.some((c) => re.test(c)); return tem(/ADMIN/i) && tem(/GERENTE[^|]*(ABERTO)/i) && tem(/GERENTE[^|]*(FECHADO)/i) && tem(/OPERADOR/i) && tem(/visitante|an[oô]nimo|sem usu[aá]rio|null/i); } },
    { id: 'cenarios-negativos', tipo: 'estrutural', descricao: 'inclui ao menos 3 cenários cujo resultado esperado é recusa/negação', avaliar: (r) => cen(r).filter((c) => rx(/recus|neg|n[aã]o (pode|permit)|false|bloque/i, texto(c.resultadoEsperado))).length >= 3 },
    { id: 'identifica-lacuna-existente', tipo: 'textual', descricao: 'aponta que GERENTE e/ou OPERADOR não têm teste existente', avaliar: (r) => rx(/GERENTE|OPERADOR/i, lac(r)) } ] },
  4: { titulo: 'Persistência após operação recusada', limite: 5, criterios: [
    { id: 'oraculo-de-estado', tipo: 'textual', descricao: 'ao menos um cenário tem oráculo que verifica o ESTADO do dado depois da recusa (pedido existe/inalterado/total)', avaliar: (r) => cen(r).some((c) => rx(/obter|existe|permanece|inalterad|total|persist|mesmo(s)? dados/i, texto(c.oraculo))) },
    { id: 'identifica-oraculo-fraco', tipo: 'textual', descricao: 'aponta que o teste existente só verifica que lança erro', avaliar: (r) => rx(/lan[çc]a|erro|exce[çc][aã]o|throws/i, lac(r)) && rx(/estado|persist|dado|inalterad|existe/i, lac(r)) } ] },
  5: { titulo: 'Redundância', limite: 6, criterios: [
    { id: 'redundancia-sul-sudeste', tipo: 'estrutural', descricao: 'declara SUL e SUDESTE (testes existentes equivalentes) como redundância candidata', avaliar: (r) => (r.redundanciasCandidatas ?? []).some((par) => rx(/SUL/i, texto(par)) && rx(/SUDESTE/i, texto(par))) },
    { id: 'nao-elimina-cobertura-necessaria', tipo: 'estrutural', descricao: 'não declara NORDESTE como redundante de SUL/SUDESTE', avaliar: (r) => !(r.redundanciasCandidatas ?? []).some((par) => /NORDESTE/i.test(texto(par))) } ] },
  6: { titulo: 'Falta de oráculo', limite: 4, criterios: [
    { id: 'oraculo-180', tipo: 'estrutural', descricao: 'cenário do cupom válido tem oráculo/resultado 180 para total 200', avaliar: (r) => cen(r).some((c) => /PRUMO10/i.test(texto(c)) && /\b180\b/.test(texto(c.oraculo) + texto(c.resultadoEsperado))) },
    { id: 'cupom-invalido-sem-alteracao', tipo: 'estrutural', descricao: 'cenário de outro código: total inalterado (200)', avaliar: (r) => cen(r).some((c) => !/PRUMO10/i.test(texto(c.entrada)) && /\b200\b/.test(texto(c.oraculo) + texto(c.resultadoEsperado))) },
    { id: 'sem-regra-inventada', tipo: 'estrutural', descricao: 'não inventa regras ausentes do requisito (validade, limite de uso, acúmulo, arredondamento específico)', avaliar: (r) => !rx(/expira|validade|limite de uso|acumul|cumulativ|arredond/i, tudo(r.cenarios)) } ] },
  7: { titulo: 'Falso positivo', limite: 4, criterios: [
    { id: 'aponta-teste-ignorado', tipo: 'textual', descricao: 'aponta o teste ignorado (skip) como cobertura inexistente', avaliar: (r) => rx(/skip|ignorad|pendent/i, lac(r)) },
    { id: 'aponta-assertion-superficial', tipo: 'textual', descricao: 'aponta que o outro teste só confere o tipo, não o valor do desconto', avaliar: (r) => rx(/tipo|typeof|n[uú]mero|superficial|n[aã]o (valida|verifica|confere)/i, lac(r)) },
    { id: 'oraculo-180', tipo: 'estrutural', descricao: 'propõe verificação do total final com valor 180', avaliar: (r) => cen(r).some((c) => /\b180\b/.test(texto(c.oraculo) + texto(c.resultadoEsperado))) } ] },
  8: { titulo: 'Requisito contraditório e ambiente bloqueado', limite: 4, criterios: [
    { id: 'registra-contradicao', tipo: 'textual', descricao: 'registra a contradição entre as regras de frete grátis (incertezas/hipóteses)', avaliar: (r) => rx(/contradi|conflit|incompat|divergen/i, texto(r.incertezas) + texto(r.hipoteses) + texto(r.riscos)) },
    { id: 'nao-escolhe-regra', tipo: 'estrutural', descricao: 'nenhum cenário de frete afirma resultado definitivo sem condicionar ao esclarecimento', avaliar: (r) => cen(r).filter((c) => /frete/i.test(texto(c))).every((c) => rx(/indefinid|esclarec|depende|conflit|a definir|bloquead|pendente/i, texto(c.resultadoEsperado) + texto(c.oraculo))) },
    { id: 'registra-bloqueio-de-ambiente', tipo: 'estrutural', descricao: 'registra o bloqueio da integração (banco de testes isolado não provisionado) em bloqueios', avaliar: (r) => rx(/banco|ambiente|isolad|integra/i, texto(r.bloqueios)) } ] }
};

/** Avalia uma resposta já convertida em objeto. Devolve uma linha por critério: ok true/false (nunca "não avaliado" aqui). */
export function avaliarResposta(n, resposta, doc) {
  const def = casos[n]; if (!def) throw new Error(`caso ${n} inexistente`);
  return [...comuns(def.limite), ...def.criterios].map((c) => { let ok = false; try { ok = Boolean(c.avaliar(resposta, doc)); } catch { ok = false; } return { id: c.id, tipo: c.tipo, descricao: c.descricao, ok }; });
}
/** Extrai o último bloco ```json da mensagem final do agente. Devolve null se não houver JSON válido. */
export function extrairJson(mensagem) {
  const blocos = [...String(mensagem ?? '').matchAll(/```json\s*([\s\S]*?)```/g)];
  for (const b of blocos.reverse()) { try { return JSON.parse(b[1]); } catch { /* tenta o anterior */ } }
  try { return JSON.parse(String(mensagem)); } catch { return null; }
}
export const instrucaoDeFormato = `Ao final, responda com UM bloco \`\`\`json com exatamente estes campos:
{"requisito":"<frase copiada literalmente da documentação>","riscos":["..."],"lacunasNosTestesExistentes":["o que os testes existentes NÃO verificam ou verificam mal"],"cenarios":[{"id":"C1","comportamento":"...","tecnica":"boundary|equivalence|decision_table|state_transition","entrada":"...","limite":<número ou omitir>,"resultadoEsperado":"...","oraculo":"...","risco":"..."}],"redundanciasCandidatas":[["<teste ou cenário A>","<teste ou cenário B>"]],"hipoteses":["..."],"incertezas":["..."],"bloqueios":["..."],"declaraExecucao":false}
Proponha apenas os cenários necessários (menor conjunto justificado). Não invente regras, testes existentes nem resultados. Nada foi executado: declaraExecucao deve ser false.`;
