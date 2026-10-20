/**
 * Repositório de chamados em memória, com a mesma interface do cliente do GitHub do serviço (backend/suporte/servidor/github.mjs).
 * Não é um teste e nunca fala com o GitHub: issues, comentários e arquivos ficam em mapas.
 */
export function repositorioDeSuporteFalso({ agora = () => new Date() } = {}) {
  const issues = new Map(); const comentarios = new Map(); const arquivos = new Map(); let proximo = 1;
  const rotulos = (l) => l.map((name) => ({ name }));
  return {
    issues, comentarios, arquivos,
    criarIssue: async ({ titulo, corpo, rotulos: r }) => { const n = proximo++; const em = agora().toISOString(); const i = { number: n, title: titulo, body: corpo, labels: rotulos(r), state: 'open', created_at: em, updated_at: em }; issues.set(n, i); comentarios.set(n, []); return i; },
    lerIssue: async (n) => issues.get(n) ?? null,
    listarIssues: async (rotulo) => [...issues.values()].filter((i) => i.labels.some((l) => l.name === rotulo)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    atualizarIssue: async (n, { rotulos: r, estado }) => { const i = issues.get(n); if (r) i.labels = rotulos(r); if (estado) i.state = estado; i.updated_at = agora().toISOString(); return i; },
    comentarios: async (n) => comentarios.get(n) ?? [],
    comentar: async (n, texto) => { const c = { body: texto, created_at: agora().toISOString() }; comentarios.get(n).push(c); issues.get(n).updated_at = c.created_at; return c; },
    gravarArquivo: async (caminho, bytes) => { if (arquivos.has(caminho)) return false; arquivos.set(caminho, Buffer.from(bytes)); return true; },
    listarArquivos: async (pasta) => [...arquivos.entries()].filter(([c]) => c.startsWith(pasta + '/')).map(([c, b]) => ({ nome: c.slice(pasta.length + 1), caminho: c, tamanho: b.length })),
    lerArquivo: async (caminho) => arquivos.get(caminho) ?? null
  };
}
