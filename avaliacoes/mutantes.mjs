// Análise de mutantes: injeta um defeito conhecido numa CÓPIA da aplicação e roda os testes existentes.
// "sobrevive" = os testes atuais não detectam o defeito (lacuna real); "morto" = detectam. Não depende do Prumo nem de IA.
// É o oráculo independente para o que o Prumo não consegue julgar estruturalmente (qualidade das assertions).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const mutantes = [
  { id: 'elegibilidade-limite-inferior', arquivo: 'src/elegibilidade.mjs', de: 'idade >= 18', para: 'idade > 18', esperado: 'sobrevive', significado: 'Off-by-one no limite inferior: nenhum teste exercita 18 (caso 1).' },
  { id: 'acesso-gerente-fechado', arquivo: 'src/acesso.mjs', de: "pedido.status === 'ABERTO'", para: 'true', esperado: 'sobrevive', significado: 'GERENTE excluindo pedido fechado: perfil sem teste (caso 3).' },
  { id: 'pedidos-recusa-altera-dado', arquivo: 'src/pedidos.mjs', de: "if (!podeExcluir(usuario, pedido))", para: "if (!podeExcluir(usuario, pedido) && (pedido.status = 'EXCLUIDO', true))", esperado: 'sobrevive', significado: 'Recusa que altera o dado: o teste só confere que lança erro (caso 4).' },
  { id: 'cupom-desconto-errado', arquivo: 'src/cupom.mjs', de: '0.9', para: '0.95', esperado: 'sobrevive', significado: 'Desconto errado: um teste ignorado e outro que só confere o tipo (caso 7).' },
  { id: 'frete-sul-errado', arquivo: 'src/frete.mjs', de: 'SUL: 10', para: 'SUL: 11', esperado: 'morto', significado: 'Controle: o teste de SUL tem oráculo e detecta o defeito.' },
  { id: 'frete-nordeste-errado', arquivo: 'src/frete.mjs', de: 'NORDESTE: 20', para: 'NORDESTE: 21', esperado: 'morto', significado: 'Controle: o teste de NORDESTE tem oráculo e detecta o defeito.' }
];
const testes = fs.readdirSync(path.join(lab, 'aplicacao', 'testes')).filter((n) => n.endsWith('.test.mjs')).sort();
function rodar(mutante) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo lab mutante '));
  try {
    fs.cpSync(path.join(lab, 'aplicacao'), path.join(tmp, 'aplicacao'), { recursive: true });
    if (mutante) {
      const alvo = path.join(tmp, 'aplicacao', mutante.arquivo); const original = fs.readFileSync(alvo, 'utf8');
      if (!original.includes(mutante.de)) throw new Error(`mutação não aplicável em ${mutante.arquivo}: trecho ausente`);
      fs.writeFileSync(alvo, original.replace(mutante.de, mutante.para));
    }
    const r = spawnSync(process.execPath, ['--test', ...testes.map((t) => path.join('aplicacao', 'testes', t))], { cwd: tmp, encoding: 'utf8', windowsHide: true, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
    return { status: r.status, saida: r.stdout.split('\n').filter((l) => /^ℹ (tests|pass|fail|skipped)/.test(l)).join(' ') };
  } finally { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = rodar(null);
  if (base.status !== 0) { console.error('Os testes da aplicação íntegra falharam; análise de mutantes inválida.', base.saida); process.exit(2); }
  const resultados = mutantes.map((m) => { const r = rodar(m); const situacao = r.status === 0 ? 'sobrevive' : 'morto'; return { id: m.id, situacao, esperado: m.esperado, conforme: situacao === m.esperado, significado: m.significado }; });
  const resultado = { tipo: 'analise-de-mutantes', geradoEm: new Date().toISOString(), node: process.version, baseline: base.saida, resultados };
  for (const r of resultados) console.log(`${r.conforme ? 'OK    ' : 'DIFERE '} ${r.id}: ${r.situacao} (esperado ${r.esperado}) — ${r.significado}`);
  if (!process.argv.includes('--sem-gravar')) { fs.mkdirSync(path.join(lab, 'avaliacoes', 'resultados'), { recursive: true }); fs.writeFileSync(path.join(lab, 'avaliacoes', 'resultados', `${resultado.geradoEm.slice(0, 10)}-mutantes.json`), JSON.stringify(resultado, null, 2) + '\n'); }
  process.exitCode = resultados.every((r) => r.conforme) ? 0 : 1;
}
