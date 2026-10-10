// Compara duas avaliações REAIS gravadas em avaliacoes/resultados/ (mesmo tipo, versões do Prumo diferentes).
// Uso: node avaliacoes/comparar.mjs <antigo.json> <novo.json>
// Só mostra diferenças que existem nos arquivos; nunca preenche lacunas. Sem dois arquivos, informa que não há base de comparação.
import fs from 'node:fs';
import path from 'node:path';

export function comparar(a, b) {
  if (a.tipo !== b.tipo) throw new Error(`Tipos diferentes (${a.tipo} × ${b.tipo}); não comparável.`);
  const linhas = []; const mapa = (r) => new Map(r.casos.map((c) => [c.caso, c]));
  const ma = mapa(a), mb = mapa(b);
  for (const n of [...new Set([...ma.keys(), ...mb.keys()])].sort((x, y) => x - y)) {
    const ca = ma.get(n), cb = mb.get(n);
    if (!ca || !cb) { linhas.push({ caso: n, mudanca: 'presente em apenas uma das avaliações' }); continue; }
    if (a.tipo === 'avaliacao-semantica') { if (ca.estado !== cb.estado) linhas.push({ caso: n, titulo: cb.titulo, de: ca.estado, para: cb.estado }); continue; }
    const ck = (c) => new Map(c.checks.map((x) => [x.criterio, x.ok]));
    const ka = ck(ca), kb = ck(cb);
    for (const [criterio, ok] of kb) if (ka.has(criterio) && ka.get(criterio) !== ok) linhas.push({ caso: n, titulo: cb.titulo, criterio, de: ka.get(criterio) ? 'ok' : 'falhou', para: ok ? 'ok' : 'falhou' });
    for (const criterio of kb.keys()) if (!ka.has(criterio)) linhas.push({ caso: n, titulo: cb.titulo, criterio, de: '(não existia)', para: kb.get(criterio) ? 'ok' : 'falhou' });
  }
  return { tipo: a.tipo, de: a.prumo.versao, para: b.prumo.versao, diferencas: linhas };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const [x, y] = process.argv.slice(2);
  if (!x || !y) { console.error('Uso: node avaliacoes/comparar.mjs <antigo.json> <novo.json>. Sem dois resultados reais não há comparação.'); process.exit(2); }
  const r = comparar(JSON.parse(fs.readFileSync(x, 'utf8')), JSON.parse(fs.readFileSync(y, 'utf8')));
  console.log(`Prumo ${r.de} → ${r.para} (${r.tipo})`);
  console.log(r.diferencas.length ? r.diferencas.map((d) => `  caso ${d.caso}${d.titulo ? ' — ' + d.titulo : ''}: ${d.criterio ? d.criterio + ': ' : ''}${d.de ?? ''} → ${d.para ?? d.mudanca}`).join('\n') : '  Nenhuma diferença nos critérios avaliados.');
}
