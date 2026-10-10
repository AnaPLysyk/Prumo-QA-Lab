// Semeia contextos no armazenamento local do Prumo (diretório de dados ISOLADO do avaliador) para os casos de contexto.
// É só preparação do cenário: a avaliação em si acontece pelo MCP real. Usa os módulos do próprio Prumo avaliado
// (dist/contextos.js), derivados do caminho do mcp.js; versões sem Contextos não têm esse módulo (casos NAO_APLICAVEL).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function carregarPrumo(mcpJs) {
  const dist = path.dirname(mcpJs);
  if (!fs.existsSync(path.join(dist, 'contextos.js'))) return null;
  const [ctx, proj] = await Promise.all([import(pathToFileURL(path.join(dist, 'contextos.js')).href), import(pathToFileURL(path.join(dist, 'projeto.js')).href)]);
  return { ctx, proj };
}
/** Cria os contextos do caso e devolve { ids, limpar }. "limpar" remove tudo o que foi semeado (inclusive o projeto auxiliar). */
export async function semear(prumo, lab, dados, esperado) {
  const { ctx, proj } = prumo; const principal = await proj.carregarProjeto(lab); const projetos = [principal]; let auxiliar = null;
  const ids = {}; const doProjeto = async (nome) => {
    if (nome !== 'outro') return principal;
    if (!auxiliar) {
      const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo lab outro projeto ')); fs.writeFileSync(path.join(raiz, 'README.md'), 'projeto auxiliar do laboratório');
      fs.writeFileSync(path.join(raiz, 'qa.project.json'), JSON.stringify({ schemaVersion: 2, id: 'outro-projeto', name: 'Outro projeto', context: { documentation: ['README.md'], tests: [], code: [] }, commands: {}, execution: { requireApproval: true, blockedByDefault: [], environment: 'host', readOnly: true, envAllowlist: [], timeoutMs: 1000, maxOutputBytes: 1024 } }));
      auxiliar = { raiz, projeto: await proj.carregarProjeto(raiz) }; projetos.push(auxiliar.projeto);
    }
    return auxiliar.projeto;
  };
  for (const s of esperado.semente ?? []) {
    const p = await doProjeto(s.projeto); const criado = ctx.criarContexto(p, s.conteudo, 'laboratorio', {}, dados); ids[s.ref] = criado.id;
    for (const acao of s.acoes ?? []) { if (acao === 'aprovar') ctx.aprovarContexto(p, criado.id, 'laboratorio', dados); else if (acao === 'desatualizar') ctx.desatualizarContexto(p, criado.id, 'laboratorio', dados); else throw new Error('ação de semente desconhecida: ' + acao); }
  }
  if (esperado.mcpHabilitado) for (const p of projetos) ctx.gravarConfig(p, true, dados);
  return { ids, limpar() { for (const p of projetos) { try { ctx.excluirTodosContextos(p, dados); ctx.gravarConfig(p, false, dados); } catch { /* já limpo */ } } if (auxiliar) fs.rmSync(auxiliar.raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
