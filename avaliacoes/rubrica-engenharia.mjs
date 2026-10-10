// Fixada antes da análise de IA. Os critérios não entram no contexto autorizado do MCP.
export function avaliarEngenharia(resposta, ferramentas=[]) {
  const achados=Array.isArray(resposta?.achados)?resposta.achados:[];
  const tem=(arquivo,teste=()=>true)=>achados.some(a=>String(a.arquivo).includes(arquivo)&&teste(a));
  const texto=a=>JSON.stringify(a).toLowerCase();
  const checks=[
    ['mcp-real',ferramentas.includes('contexto_projeto')],
    ['sem-execucao-fabricada',resposta?.declaraExecucao===false],
    ['origem-risco-impacto',achados.length>0&&achados.every(a=>a.arquivo&&a.justificativa&&a.risco&&a.impacto&&a.recomendacao)],
    ['conflito-documental',tem('guia.md',a=>a.natureza==='confirmado'&&/novo|em_analise/.test(texto(a)))],
    ['duplicacao-candidata',tem('total-',a=>a.natureza==='suspeita')],
    ['responsabilidade-revisao',tem('relatorio.mjs',a=>a.natureza==='suspeita'&&/grav|responsab|persist/.test(texto(a)))],
    ['testes-sem-oraculo',tem('engenharia.spec.ts',a=>/assert|or.culo|expect\(true\)|funcional/.test(texto(a)))],
    ['espera-fixa',tem('engenharia.spec.ts',a=>/waitfortimeout|espera fixa/.test(texto(a)))],
    ['cenario-ignorado',tem('engenharia.spec.ts',a=>/skip|ignorado/.test(texto(a)))],
    ['import-dinamico-preservado',resposta?.controlesPreservados?.includes('formatacao.mjs')&&!tem('formatacao.mjs',a=>/apagar|remover|in.util|sem uso/.test(texto(a)))],
    ['teste-bom-preservado',resposta?.controlesPreservados?.includes('controle de estado')]
  ];
  return checks.map(([id,ok])=>({id,ok:Boolean(ok)}));
}
