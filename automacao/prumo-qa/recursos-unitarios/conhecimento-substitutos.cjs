// Funções dos bancos de conhecimento e de Skills (SQLite) que os testes trocam pela versão em memória de conhecimento-falso.mjs.
// Chave: arquivo consolidado em dist/; valor: { nome exportado pelo arquivo: nome da função em `memoria` }.
// Os demais exports do arquivo continuam reais. Usado pelo hook do runner (conhecimento-hook.cjs) e pelo mock (conhecimento-memoria.mjs): uma única lista.
module.exports = {
  'agentes/banco/perfil.js': { lerPerfil: 'lerPerfil', salvarPerfil: 'salvarPerfil' },
  'agentes/banco/conhecimento.js': {
    listarConhecimentos: 'listarConhecimentos', registrarConhecimento: 'registrarConhecimento', apagarConhecimento: 'apagarConhecimento',
    conhecimentosRelevantes: 'relevantes', estadoConhecimento: 'estadoConhecimento'
  },
  'agentes/banco/atendimentos.js': {
    decidirConhecimento: 'decidirConhecimento', aprenderTermos: 'aprenderTermos', pesosAprendidos: 'pesosAprendidos', vocabularioDoAgente: 'vocabularioDoAgente',
    esquecerTermo: 'esquecerTermo', registrarAtendimento: 'registrarAtendimento', avaliarAtendimento: 'avaliarAtendimento', listarAtendimentos: 'listarAtendimentos'
  },
  'agentes/banco/skills.js': { listarTrechosDeSkill: 'listarTrechosDeSkill', registrarTrechosDeSkill: 'registrarTrechosDeSkill', decidirTrechoDeSkill: 'decidirTrechoDeSkill' },
  'agentes/regras/conhecimentoParaIA.js': { conhecimentoParaIA: 'conhecimentoParaIA' },
};
