// Funções dos bancos de conhecimento e de Skills (SQLite) que os testes trocam pela versão em memória de conhecimento-falso.mjs.
// Chave: arquivo em dist/; valor: [nome exportado pelo arquivo, nome da função em `memoria`].
// Usado pelo hook do runner (conhecimento-hook.cjs) e pelo mock (conhecimento-memoria.mjs): uma única lista.
module.exports = {
  'agentes/banco/lerPerfil.js': ['lerPerfil', 'lerPerfil'],
  'agentes/banco/listarConhecimentos.js': ['listarConhecimentos', 'listarConhecimentos'],
  'agentes/banco/registrarConhecimento.js': ['registrarConhecimento', 'registrarConhecimento'],
  'agentes/banco/salvarPerfil.js': ['salvarPerfil', 'salvarPerfil'],
  'agentes/banco/decidirConhecimento.js': ['decidirConhecimento', 'decidirConhecimento'],
  'agentes/banco/apagarConhecimento.js': ['apagarConhecimento', 'apagarConhecimento'],
  'agentes/banco/conhecimentosRelevantes.js': ['conhecimentosRelevantes', 'relevantes'],
  'agentes/banco/aprenderTermos.js': ['aprenderTermos', 'aprenderTermos'],
  'agentes/banco/pesosAprendidos.js': ['pesosAprendidos', 'pesosAprendidos'],
  'agentes/banco/vocabularioDoAgente.js': ['vocabularioDoAgente', 'vocabularioDoAgente'],
  'agentes/banco/esquecerTermo.js': ['esquecerTermo', 'esquecerTermo'],
  'agentes/banco/registrarAtendimento.js': ['registrarAtendimento', 'registrarAtendimento'],
  'agentes/banco/avaliarAtendimento.js': ['avaliarAtendimento', 'avaliarAtendimento'],
  'agentes/banco/listarAtendimentos.js': ['listarAtendimentos', 'listarAtendimentos'],
  'agentes/banco/estadoConhecimento.js': ['estadoConhecimento', 'estadoConhecimento'],
  'agentes/banco/listarTrechosDeSkill.js': ['listarTrechosDeSkill', 'listarTrechosDeSkill'],
  'agentes/banco/registrarTrechosDeSkill.js': ['registrarTrechosDeSkill', 'registrarTrechosDeSkill'],
  'agentes/banco/decidirTrechoDeSkill.js': ['decidirTrechoDeSkill', 'decidirTrechoDeSkill'],
  'agentes/regras/conhecimentoParaIA.js': ['conhecimentoParaIA', 'conhecimentoParaIA'],
};
