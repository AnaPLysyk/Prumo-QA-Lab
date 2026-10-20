// Substitui a persistência por memória: nenhum teste abre SQLite ou dados da pessoa.
import { randomUUID } from 'node:crypto';
import { semAcentos } from '../../../dist/compartilhado/texto/semAcentos.js';
import { normalizarNome } from '../../../dist/agentes/regras/normalizarNome.js';
import { normalizarFoco } from '../../../dist/agentes/regras/normalizarFoco.js';
import { experiencias, papeis } from '../../../dist/agentes/tipos/persona.js';
import { termosDaFrase } from '../../../dist/agentes/regras/termosDaFrase.js';
import { sementeDasSkills } from '../../../dist/agentes/banco/sementeDasSkills.js';
import { validarEspecializacao } from '../../../dist/agentes/regras/validarEspecializacao.js';
import { mascarar } from '../../../dist/compartilhado/seguranca/mascarar.js';
// A mesma regra do banco real (2.17): perfil e atendimentos são da conta da sessão; sem sessão, nada pessoal.
import { pessoaDoConhecimento } from '../../../dist/agentes/banco/pessoaDoConhecimento.js';

// Funções puras reais (não tocam o banco), usadas pela versão em memória.
const real = { norm: semAcentos, normalizarNome, termos: termosDaFrase };

const perfis = new Map();
const itens = [];
const vocabulario = [];
const atendimentos = [];
export const falhasConhecimento = { registrar: null };
const chaveDoPerfil = (base) => { const pessoa = pessoaDoConhecimento(base); return pessoa ? (base ?? '') + '|' + pessoa : null; };
const lerPerfil = (base) => { const k = chaveDoPerfil(base); return (k && perfis.get(k)) || { comoChamar: null, papel: null, experiencia: null, foco: null, compartilharComIa: false, atualizadoEm: null }; };
const listarConhecimentos = (f) => itens.filter(c => (!c.espacoId || c.espacoId === f.espacoId) && (!f.agente || c.agente === f.agente || (!f.somenteDoAgente && !c.agente)) && (!f.estados?.length || f.estados.includes(c.estado)) && (!f.busca || real.norm(c.titulo + ' ' + c.texto).includes(real.norm(f.busca)))).slice(0, f.limite ?? 200);
const registrarConhecimento = (n) => {
  if (falhasConhecimento.registrar) throw new Error(falhasConhecimento.registrar);
  const igual = itens.find(c => c.estado !== 'DESCARTADO' && c.espacoId === n.espacoId && c.agente === n.agente && c.texto === n.texto);
  if (igual) return { item: igual, duplicado: true };
  const item = { ...n, id: randomUUID(), estado: n.origem === 'PESSOA' ? 'APROVADO' : 'RASCUNHO', criadoEm: new Date().toISOString(), decididoEm: null, cliente: n.cliente ?? null };
  itens.push(item); return { item, duplicado: false };
};
// Banco de Skills em memória: os trechos do Prumo vêm dos arquivos reais (sem SQLite); o restante só existe durante o teste.
const trechos = sementeDasSkills().map(t => ({ ...t }));
const listarTrechosDeSkill = (f = {}) => { if (f.especializacao) validarEspecializacao(f.especializacao); return trechos.filter(t => (!f.especializacao || t.especializacao === f.especializacao) && (!f.estados?.length || f.estados.includes(t.estado)) && (!f.busca || real.norm(t.titulo + ' ' + t.texto).includes(real.norm(f.busca)))); };
const registrarTrechosDeSkill = (novos) => novos.map(n => {
  validarEspecializacao(n.especializacao); if (n.origem === 'IMPORTADO' && (!n.fonte || !n.licenca)) throw new Error('SKILL_LICENSE_MISSING');
  const titulo = mascarar(n.titulo).trim(), texto = mascarar(n.texto).trim(); if (titulo.length < 2 || texto.length < 2) throw new Error('SKILL_TEXT_REQUIRED');
  const igual = trechos.find(t => t.estado !== 'DESCARTADO' && t.especializacao === n.especializacao && t.titulo === titulo && t.texto === texto); if (igual) return { item: igual, duplicado: true };
  const em = new Date().toISOString(); const item = { id: randomUUID(), especializacao: n.especializacao, titulo, texto, ordem: n.ordem ?? 1000 + trechos.length, origem: n.origem, estado: n.origem === 'PESSOA' ? 'APROVADO' : 'RASCUNHO', fonte: n.fonte ?? null, licenca: n.licenca ?? null, criadoEm: em, decididoEm: n.origem === 'PESSOA' ? em : null };
  trechos.push(item); return { item, duplicado: false };
});
const decidirTrechoDeSkill = (id, estado) => { const t = trechos.find(x => x.id === id); if (!t) throw new Error('SKILL_NOT_FOUND'); t.estado = estado; t.decididoEm = new Date().toISOString(); return t; };
export const memoria = {
  listarTrechosDeSkill, registrarTrechosDeSkill, decidirTrechoDeSkill,
  lerPerfil, listarConhecimentos, registrarConhecimento,
  salvarPerfil: (a, base) => {
    const k = chaveDoPerfil(base); if (!k) throw new Error('PROFILE_SESSION_REQUIRED');
    const p = { ...lerPerfil(base), ...a, atualizadoEm: new Date().toISOString() };
    if (a.comoChamar) p.comoChamar = real.normalizarNome(a.comoChamar);
    if (p.papel != null && !papeis.includes(p.papel)) throw new Error('PROFILE_ROLE_INVALID');
    if (p.experiencia != null && !experiencias.includes(p.experiencia)) throw new Error('PROFILE_EXPERIENCE_INVALID');
    if (typeof a.foco === 'string') p.foco = normalizarFoco(a.foco);
    perfis.set(k, p); return p;
  },
  decidirConhecimento: (id, estado) => { const c = itens.find(x => x.id === id); if (!c) throw new Error('KNOWLEDGE_NOT_FOUND'); c.estado = estado; return c; },
  apagarConhecimento: (id) => { const i = itens.findIndex(x => x.id === id); if (i < 0) throw new Error('KNOWLEDGE_NOT_FOUND'); itens.splice(i, 1); return { apagado: true }; },
  relevantes: (espacoId, agente, pergunta, limite = 2) => listarConhecimentos({ espacoId, agente, estados: ['APROVADO'] }).filter(c => real.termos(pergunta).some(t => real.norm(c.titulo + ' ' + c.texto).includes(t))).slice(0, limite),
  aprenderTermos: (agente, frase) => { const termos = real.termos(frase); for (const termo of termos) { const v = vocabulario.find(x => x.agente === agente && x.termo === termo); if (v) v.peso++; else vocabulario.push({ agente, termo, peso: 1 }); } return { termos }; },
  pesosAprendidos: frase => { const r = {}; for (const v of vocabulario.filter(x => real.termos(frase).includes(x.termo))) r[v.agente] = (r[v.agente] ?? 0) + v.peso; return r; },
  vocabularioDoAgente: agente => vocabulario.filter(x => x.agente === agente),
  esquecerTermo: (agente, termo) => { const i = vocabulario.findIndex(x => x.agente === agente && x.termo === termo); if (i >= 0) vocabulario.splice(i, 1); return { apagado: i >= 0 }; },
  registrarAtendimento: (a, base) => { atendimentos.push({ ...a, usuarioId: pessoaDoConhecimento(base), id: atendimentos.length + 1, em: new Date().toISOString(), avaliacao: null }); return atendimentos.length; },
  avaliarAtendimento: (id, avaliacao, base) => { const pessoa = pessoaDoConhecimento(base); const a = atendimentos.find(x => x.id === id && pessoa && x.usuarioId === pessoa); if (!a) throw new Error('ATTENDANCE_NOT_FOUND'); a.avaliacao = avaliacao; return { avaliado: true }; },
  listarAtendimentos: (espacoId, agente, limite = 40, base) => { const pessoa = pessoaDoConhecimento(base); return pessoa ? atendimentos.filter(x => x.usuarioId === pessoa && x.espacoId === espacoId && (!agente || x.agente === agente)).slice(-limite).reverse() : []; },
  estadoConhecimento: (espacoId, base) => ({ arquivo: '(memória do runner)', bytes: 0, esquema: 1, tabelas: ['perfil','agentes','conhecimentos','vocabulario','atendimentos'], vistas: [], perfil: lerPerfil(base), porAgente: Object.fromEntries(['orquestrador','qa-geral','requisitos','playwright','api-rest','acessibilidade','investigacao-bugs','regressao','monitoramento'].map(agente => [agente, { aprovados: listarConhecimentos({espacoId, agente, estados:['APROVADO']}).length, rascunhos: listarConhecimentos({espacoId, agente, estados:['RASCUNHO']}).length, atendimentos: atendimentos.filter(x => x.espacoId === espacoId && x.agente === agente).length, uteis: 0, naoUteis: 0 }])), gerais: itens.filter(x => !x.espacoId && !x.agente && x.estado === 'APROVADO').length }),
  conhecimentoParaIA: (espacoId, base) => ({ perfil: ((p) => ({ comoChamar: p.comoChamar, papel: p.papel, ...(p.compartilharComIa ? { experiencia: p.experiencia, foco: p.foco } : {}) }))(lerPerfil(base)), itens: listarConhecimentos({ espacoId, estados: ['APROVADO'] }) })
};
