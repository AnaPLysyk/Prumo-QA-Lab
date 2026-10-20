// Mundo simulado e com estado de Jira, Qase e GitHub para testes de contrato das escritas. Não é a API real: valida o que o Prumo
// envia (rotas da lista fechada, corpos e idempotência) e o que ele faz com as respostas, inclusive respostas perdidas.
import { rotaEscritaPermitida } from '../../dist/conexoes/escrita/rotaEscritaPermitida.js';
import { ErroServico } from '../../dist/conexoes/integracoes/ErroServico.js';

const falta = () => new ErroServico('SERVICE_NOT_FOUND');
const url = (c) => new URL(c, 'https://x.test');
export function criarMundo() {
  const m = { chamadas: [], perderProximaResposta: false, jira: null, qase: null, github: null };
  const verificar = (servico, metodo, caminho) => { const u = url(caminho); if (metodo !== 'GET' && !rotaEscritaPermitida(servico, metodo, u.pathname)) throw new Error('ROTA FORA DA LISTA FECHADA: ' + metodo + ' ' + u.pathname); };
  const perder = () => { if (m.perderProximaResposta) { m.perderProximaResposta = false; throw new ErroServico('SERVICE_TIMEOUT'); } };
  // ---------- Jira ----------
  const j = (m.jira = { issues: new Map(), tipos: [{ id: '10001', name: 'Bug' }, { id: '10002', name: 'Task' }, { id: '10003', name: 'Subtask', subtask: true }], n: 100, transicoes: [{ id: '31', name: 'Iniciar', to: { name: 'Em andamento' } }, { id: '41', name: 'Concluir', to: { name: 'Concluído' } }], anexos: [] });
  const semear = (key, projeto = '11') => j.issues.set(key, { id: String(j.n++), key, fields: { project: { id: projeto }, summary: 'Ticket ' + key, status: { name: 'Aberto' }, labels: [], issuelinks: [], attachment: [] } });
  semear('SMART-1'); semear('SMART-2'); semear('CID-1', '22');
  const ctxJira = {
    servico: 'jira', instancia: 'https://lab.atlassian.net', limpar: (v) => v,
    async ler(c) {
      m.chamadas.push(['GET', c]); const u = url(c), p = u.pathname;
      if (/\/issue\/createmeta\/[A-Z]+\/issuetypes$/.test(p)) return { issueTypes: j.tipos };
      if (p === '/rest/api/3/search/jql') { const rot = /labels = "([^"]+)"/.exec(u.searchParams.get('jql'))?.[1]; return { issues: [...j.issues.values()].filter((i) => i.fields.labels.includes(rot)).map((i) => ({ id: i.id, key: i.key })) }; }
      if (/^\/rest\/api\/3\/issue\/[A-Z][A-Z0-9_]*-\d+\/comment$/.test(p)) { const k = p.split('/')[5]; if (!j.issues.get(k)) throw falta(); return { comments: (j.issues.get(k).comentarios ?? []).map((c) => ({ id: c.id, body: c.body })) }; }
      if (/^\/rest\/api\/3\/issue\/[A-Z][A-Z0-9_]*-\d+\/changelog$/.test(p)) return { isLast: true, values: [{ id: '1', created: '2026-10-10T10:00:00.000Z', author: { displayName: 'Pessoa fictícia' }, items: [{ field: 'status', fromString: 'Aberto', toString: 'Em andamento' }] }] };
      const k = /^\/rest\/api\/3\/issue\/([A-Z][A-Z0-9_]*-\d+)(\/transitions)?$/.exec(p); if (!k) throw falta();
      const i = j.issues.get(k[1]); if (!i) throw falta(); return k[2] ? { transitions: j.transicoes } : i;
    },
    async enviar(metodo, c, corpo, tipo, hdr) {
      verificar('jira', metodo, c); m.chamadas.push([metodo, c]); const p = url(c).pathname;
      if (metodo === 'POST' && p === '/rest/api/3/issue') { const f = JSON.parse(corpo).fields; const key = 'SMART-' + j.n; j.issues.set(key, { id: String(j.n++), key, fields: { ...f, status: { name: 'Aberto' }, issuelinks: [], attachment: [] } }); perder(); return { id: j.issues.get(key).id, key }; }
      if (metodo === 'POST' && p === '/rest/api/3/issueLink') { const l = JSON.parse(corpo); j.issues.get(l.inwardIssue.key).fields.issuelinks.push({ inwardIssue: { key: l.outwardIssue.key } }); return {}; }
      let k = /^\/rest\/api\/3\/issue\/([A-Z][A-Z0-9_]*-\d+)\/attachments$/.exec(p);
      if (k) { if (hdr?.['X-Atlassian-Token'] !== 'no-check' || !/^multipart\/form-data; boundary=/.test(tipo)) throw new Error('anexo sem cabeçalho/multipart corretos'); const nome = /filename="([^"]+)"/.exec(corpo.toString('latin1'))[1]; const a = { id: String(900 + j.anexos.length), filename: nome, size: corpo.length }; j.anexos.push({ ...a, corpo }); j.issues.get(k[1]).fields.attachment.push(a); perder(); return [a]; }
      k = /^\/rest\/api\/3\/issue\/([A-Z][A-Z0-9_]*-\d+)\/comment$/.exec(p); if (k) { const i = j.issues.get(k[1]); i.comentarios ??= []; const cm = { id: String(500 + i.comentarios.length), body: JSON.parse(corpo).body }; i.comentarios.push(cm); perder(); return { id: cm.id }; }
      k = /^\/rest\/api\/3\/issue\/([A-Z][A-Z0-9_]*-\d+)\/transitions$/.exec(p); if (k) { const t = j.transicoes.find((x) => x.id === JSON.parse(corpo).transition.id); j.issues.get(k[1]).fields.status = { name: t.to.name }; return {}; }
      k = /^\/rest\/api\/3\/issue\/([A-Z][A-Z0-9_]*-\d+)$/.exec(p); if (k && metodo === 'PUT') { const b = JSON.parse(corpo); const i = j.issues.get(k[1]); if (b.fields?.summary) i.fields.summary = b.fields.summary; for (const l of b.update?.labels ?? []) i.fields.labels.push(l.add); return {}; }
      throw new Error('rota Jira não simulada: ' + metodo + ' ' + p);
    }
  };
  // ---------- Qase ----------
  const q = (m.qase = { suites: [], casos: [], planos: [], runs: [], resultados: [], anexos: [], n: 1 });
  const entidades = (lista, u) => { const s = u.searchParams.get('search'); const suite = u.searchParams.get('suite_id'); const run = u.searchParams.get('run'); const off = Number(u.searchParams.get('offset') ?? 0), lim = Number(u.searchParams.get('limit') ?? 10); let l = lista.filter((x) => (!s || String(x.title ?? '').toLowerCase().includes(s.toLowerCase())) && (!suite || String(x.suite_id) === suite) && (!run || String(x.run_id) === run)); return { status: true, result: { total: l.length, filtered: l.length, count: l.length, entities: l.slice(off, off + lim) } }; };
  const ctxQase = {
    servico: 'qase', instancia: 'https://api.qase.io', limpar: (v) => v,
    async ler(c) {
      m.chamadas.push(['GET', c]); const u = url(c), p = u.pathname; let k;
      if (p === '/v1/system_field') return { status: true, result: [{ title: 'Priority', slug: 'priority', options: [{ id: 1, title: 'High' }] }] };
      if ((k = /^\/v1\/(case|suite|plan|run)\/SFQ$/.exec(p))) return entidades(q[{ case: 'casos', suite: 'suites', plan: 'planos', run: 'runs' }[k[1]]], u);
      if ((k = /^\/v1\/result\/SFQ$/.exec(p))) return entidades(q.resultados, u);
      if ((k = /^\/v1\/plan\/SFQ\/(\d+)$/.exec(p))) { const e = q.planos.find((x) => String(x.id) === k[1]); if (!e) throw falta(); return { status: true, result: e }; }
      if ((k = /^\/v1\/(case|run)\/SFQ\/(\d+)$/.exec(p))) { const e = q[k[1] === 'case' ? 'casos' : 'runs'].find((x) => String(x.id) === k[2]); if (!e) throw falta(); return { status: true, result: e }; }
      throw new Error('rota Qase não simulada: GET ' + p);
    },
    async enviar(metodo, c, corpo, tipo) {
      verificar('qase', metodo, c); m.chamadas.push([metodo, c]); const p = url(c).pathname; let k; const b = typeof corpo === 'string' ? JSON.parse(corpo) : null;
      if ((k = /^\/v1\/(case|suite|plan|run)\/SFQ$/.exec(p)) && metodo === 'POST') { const lista = q[{ case: 'casos', suite: 'suites', plan: 'planos', run: 'runs' }[k[1]]]; const e = { id: q.n++, ...b, external_issues: [] }; lista.push(e); perder(); return { status: true, result: { id: e.id } }; }
      if ((k = /^\/v1\/case\/SFQ\/(\d+)$/.exec(p)) && metodo === 'PATCH') { Object.assign(q.casos.find((x) => String(x.id) === k[1]), b); return { status: true, result: { id: Number(k[1]) } }; }
      if (/^\/v1\/run\/SFQ\/\d+\/complete$/.test(p)) { q.runs.find((x) => String(x.id) === p.split('/')[4]).completa = true; return { status: true }; }
      if ((k = /^\/v1\/result\/SFQ\/(\d+)\/bulk$/.exec(p))) { for (const r of b.results) q.resultados.push({ run_id: Number(k[1]), ...r, hash: 'h' + q.resultados.length }); perder(); return { status: true }; }
      if (/^\/v1\/attachment\/SFQ$/.test(p)) { if (!/^multipart\/form-data; boundary=/.test(tipo) || !/name="file\[\]"/.test(corpo.toString('latin1'))) throw new Error('anexo Qase sem multipart/file[]'); q.anexos.push(1); return { status: true, result: [{ hash: 'abcdef0123456789abcdef', filename: 'x' }] }; }
      if (/^\/v1\/case\/SFQ\/external-issue\/attach$/.test(p)) { for (const l of b.links) q.casos.find((x) => x.id === l.case_id).external_issues.push({ type: b.type, issues: l.external_issues.map((id) => ({ id })) }); return { status: true }; }
      throw new Error('rota Qase não simulada: ' + metodo + ' ' + p);
    }
  };
  // ---------- GitHub ----------
  const g = (m.github = { padrao: 'main', refs: new Map([['main', 'a'.repeat(40)]]), arquivos: new Map(), prs: [], n: 1 });
  const ctxGithub = {
    servico: 'github', instancia: 'https://api.github.com', limpar: (v) => v,
    async ler(c) {
      m.chamadas.push(['GET', c]); const u = url(c), p = u.pathname; let k;
      if (p === '/repos/empresa/automacao-smart') return { id: 111, full_name: 'empresa/automacao-smart', default_branch: g.padrao };
      if ((k = /^\/repos\/empresa\/automacao-smart\/git\/ref\/heads\/(.+)$/.exec(p))) { const s = g.refs.get(decodeURIComponent(k[1])); if (!s) throw falta(); return { ref: 'refs/heads/' + k[1], object: { sha: s } }; }
      if ((k = /^\/repos\/empresa\/automacao-smart\/contents\/(.+)$/.exec(p))) { const a = g.arquivos.get(u.searchParams.get('ref') + ':' + decodeURIComponent(k[1])); if (!a && k[1] === 'tests') return [{ name: 'a.spec.ts', path: 'tests/a.spec.ts', type: 'file', size: 10, sha: 'd'.repeat(40), html_url: 'https://github.com/x' }]; if (!a) throw falta(); return { sha: a.sha, encoding: 'base64', content: Buffer.from(a.conteudo).toString('base64') }; }
      if (p === '/repos/empresa/automacao-smart/contents' || p === '/repos/empresa/automacao-smart/contents/tests') return [{ name: 'a.spec.ts', path: 'tests/a.spec.ts', type: 'file', size: 10, sha: 'd'.repeat(40), html_url: 'https://github.com/x' }];
      if (p === '/repos/empresa/automacao-smart/actions/runs') return { total_count: 1, workflow_runs: [{ id: 77, name: 'CI', status: 'completed', conclusion: 'failure', head_branch: 'main', head_sha: 'a'.repeat(40), event: 'push', run_number: 5, html_url: 'https://github.com/empresa/automacao-smart/actions/runs/77', created_at: '2026-10-10T10:00:00Z' }] };
      if (p === '/repos/empresa/automacao-smart/actions/runs/77/jobs') return { jobs: [{ id: 1, name: 'windows', status: 'completed', conclusion: 'failure', steps: [{ name: 'npm test', status: 'completed', conclusion: 'failure', number: 3 }] }] };
      if (p === '/repos/empresa/automacao-smart/actions/runs/77/artifacts') return { artifacts: [{ id: 5, name: 'relatorio', size_in_bytes: 1234, expired: false }] };
      if (p === '/repos/empresa/automacao-smart/pulls/1/reviews') return [{ id: 9, state: 'APPROVED', user: { login: 'revisora' }, submitted_at: '2026-10-10T11:00:00Z' }];
      if (p === '/repos/empresa/automacao-smart/commits/' + 'a'.repeat(40)) return { sha: 'a'.repeat(40), commit: { message: 'msg token=SEGREDO1234567890abcdef', author: { name: 'Ana', date: '2026-10-10T09:00:00Z' } }, files: [{ filename: 'tests/a.spec.ts', status: 'modified', additions: 3, deletions: 1 }] };
      if (p === '/repos/empresa/automacao-smart/pulls') return g.prs.filter((x) => x.state === 'open' && u.searchParams.get('head') === 'empresa:' + x.head);
      throw new Error('rota GitHub não simulada: GET ' + p);
    },
    async enviar(metodo, c, corpo) {
      verificar('github', metodo, c); m.chamadas.push([metodo, c]); const p = url(c).pathname; const b = JSON.parse(corpo); let k;
      if (metodo === 'POST' && p === '/repos/empresa/automacao-smart/git/refs') { g.refs.set(b.ref.replace('refs/heads/', ''), b.sha); return { ref: b.ref, object: { sha: b.sha } }; }
      if (metodo === 'PUT' && (k = /^\/repos\/empresa\/automacao-smart\/contents\/(.+)$/.exec(p))) { if (b.branch === g.padrao) throw new Error('escrita no branch padrão'); const sha = 'c'.repeat(39) + String(g.n++ % 10); g.arquivos.set(b.branch + ':' + decodeURIComponent(k[1]), { sha, conteudo: Buffer.from(b.content, 'base64').toString('utf8') }); return { commit: { sha, html_url: 'https://github.com/empresa/automacao-smart/commit/' + sha }, content: {} }; }
      if (metodo === 'POST' && p === '/repos/empresa/automacao-smart/pulls') { const n = g.prs.length + 1; g.prs.push({ number: n, html_url: 'https://github.com/empresa/automacao-smart/pull/' + n, state: 'open', head: b.head, base: b.base, draft: b.draft, title: b.title }); return g.prs.at(-1); }
      throw new Error('rota GitHub não simulada: ' + metodo + ' ' + p);
    }
  };
  const recursos = { jira: { id: '11', chave: 'SMART', nome: 'JiraSMART', instancia: 'https://lab.atlassian.net', contaId: 'c1', tipoId: 'id_api' }, qase: { id: 'SFQ', chave: 'SFQ', nome: 'QaseSFQ', instancia: 'https://api.qase.io', contaId: 'conexao-local:x', tipoId: 'codigo_api' }, github: { id: '111', chave: 'empresa/automacao-smart', nome: 'automacao-smart', instancia: 'https://api.github.com', contaId: '900', tipoId: 'id_api' } };
  const ctxs = { jira: ctxJira, qase: ctxQase, github: ctxGithub };
  const IDS = { vinculoId: '00000000-0000-4000-8000-000000000001', conexaoId: '00000000-0000-4000-8000-000000000002' };
  m.executor = { async comContexto(_e, servico, fn) { return fn(ctxs[servico], recursos[servico], IDS); } };
  m.semear = semear; m.recursos = recursos;
  return m;
}
