// Comparação controlada: a MESMA IA (Codex) responde aos mesmos casos SEM Prumo (braço A) e COM Skill + MCP do Prumo (braço B).
// Nada é simulado: se o cliente não executa, o registro é NAO_EXECUTADA com o motivo informado por ele.
// Uso: node avaliacoes/comparacao.mjs [--casos 1,2] [--repeticoes 1] [--bracos A,B] [--model <id>] [--prumo <mcp.js>] [--codex <exe>] [--timeout-ms 300000] [--sem-gravar]
// Garantias de isolamento: cada execução roda numa pasta temporária vazia (o gabarito em cenarios/ nunca é visível);
// o braço A recebe os arquivos autorizados dentro do prompt (mesmo conteúdo que contexto_projeto devolve ao braço B);
// resultado de uma execução nunca entra no prompt de outra. A rubrica (rubrica.mjs) é idêntica e fixada por hash.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarResposta, extrairJson, instrucaoDeFormato, casos as rubricaCasos } from './rubrica.mjs';
import { extrair, falhaDoCliente } from './semantica-criterios.mjs';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const mcpJs = path.resolve(arg('--prumo') ?? process.env.PRUMO_MCP ?? path.join(lab, '..', 'Prumo-Qa', 'dist', 'mcp.js'));
const limite = Number(arg('--timeout-ms') ?? 300000);
const listaCasos = (arg('--casos') ?? '1,2,3,4,5,6,7,8').split(',').map(Number);
const repeticoes = Number(arg('--repeticoes') ?? 1);
const bracos = (arg('--bracos') ?? 'A,B').split(',');
const modelo = arg('--model');
const rubricaHash = createHash('sha256').update(fs.readFileSync(path.join(lab, 'avaliacoes', 'rubrica.mjs'))).digest('hex');

const arquivosAutorizados = () => {
  const m = JSON.parse(fs.readFileSync(path.join(lab, 'qa.project.json'), 'utf8'));
  const lista = [];
  for (const dir of [...m.context.documentation, ...m.context.tests, ...m.context.code]) for (const f of fs.readdirSync(path.join(lab, dir)).sort()) { const rel = path.join(dir, f).replaceAll('\\', '/'); if (fs.statSync(path.join(lab, rel)).isFile()) lista.push(rel); }
  return lista;
};
export const tarefa = (n) => `Você é um agente de engenharia de qualidade. Analise o requisito RQ-0${n} do projeto fictício: avalie os testes existentes, aponte lacunas reais, redundâncias e proponha apenas os cenários de teste necessários, com resultado esperado e oráculo verificáveis. Nada foi executado e nenhum teste deve ser executado por você.`;
export const promptA = (n) => `${tarefa(n)}\n\nArquivos autorizados do projeto (documentação, código e testes), todos os que você pode considerar:\n\n${arquivosAutorizados().map((f) => `=== ${f} ===\n${fs.readFileSync(path.join(lab, f), 'utf8')}`).join('\n')}\n\n${instrucaoDeFormato}`;
const skillArq = path.resolve(path.dirname(mcpJs), '..', 'skills', 'qa', 'SKILL.md');
const skill = fs.existsSync(skillArq) ? fs.readFileSync(skillArq, 'utf8') : '';
export const promptB = (n) => `${tarefa(n)}\n\nUse SOMENTE as ferramentas MCP do Prumo (servidor "prumo-lab"): chame contexto_projeto para ler os arquivos autorizados e, depois de formular os cenários, chame revisar_cobertura. Não use shell nem leia arquivos de outra forma. Aplique a metodologia da Skill abaixo.\n\n${instrucaoDeFormato}\n\n--- Skill de QA (SKILL.md) ---\n${skill}`;

function localizarCodex() {
  if (arg('--codex')) return arg('--codex');
  const bin = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  try { for (const d of fs.readdirSync(bin).sort().reverse()) { const e = path.join(bin, d, 'codex.exe'); if (fs.existsSync(e)) return e; } } catch { /* não instalado */ }
  const r = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['codex'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0] : null;
}
const fwd = (p) => p.replaceAll('\\', '/');
function executar(codex, braco, n) {
  return new Promise((resolve) => {
    const neutro = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo lab neutro ')); const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo lab dados '));
    const base = ['exec', '--ephemeral', '--ignore-user-config', '--json', '-s', 'read-only', '-C', neutro, ...(modelo ? ['-m', modelo] : [])];
    const mcp = braco === 'B' ? ['-c', 'mcp_servers.prumo-lab.command="node"', '-c', `mcp_servers.prumo-lab.args=["${fwd(mcpJs)}","${fwd(lab)}"]`, '-c', `mcp_servers.prumo-lab.env={PRUMO_DATA_DIR="${fwd(dados)}"}`] : [];
    const filho = spawn(codex, [...base, ...mcp, braco === 'A' ? promptA(n) : promptB(n)], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = ''; let expirou = false; const t0 = Date.now();
    const timer = setTimeout(() => { expirou = true; filho.kill(); }, limite);
    filho.stdout.on('data', (b) => { saida += b; }); filho.stderr.on('data', () => {});
    const fim = (extra) => { clearTimeout(timer); for (const d of [neutro, dados]) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); resolve({ saida, expirou, ms: Date.now() - t0, ...extra }); };
    filho.on('error', (e) => fim({ falha: e.message, codigo: null }));
    filho.on('close', (codigo) => fim({ codigo }));
  });
}
/** Combina as execuções dos dois braços em números comparáveis. Só conta execuções realmente feitas. */
export function resumir(registros) {
  const porBraco = {};
  for (const b of ['A', 'B']) {
    const rs = registros.filter((r) => r.braco === b); const feitos = rs.filter((r) => r.estado !== 'NAO_EXECUTADA');
    const crit = feitos.flatMap((r) => r.criterios);
    porBraco[b] = { execucoes: rs.length, executadas: feitos.length, naoExecutadas: rs.length - feitos.length, criteriosAtendidos: crit.filter((c) => c.ok).length, criteriosAvaliados: crit.length,
      taxa: crit.length ? Math.round((crit.filter((c) => c.ok).length / crit.length) * 1000) / 10 : null, naoAvaliados: rs.length - feitos.length };
  }
  const completo = ['A', 'B'].every((b) => porBraco[b].executadas > 0 && porBraco[b].naoExecutadas === 0);
  const prumoUsado = registros.filter((r) => r.braco === 'B' && r.estado !== 'NAO_EXECUTADA').every((r) => r.prumoUtilizado);
  return { porBraco, comparavel: completo && prumoUsado, observacao: !completo ? 'INSUFICIENTE: há execuções NAO_EXECUTADA; nenhuma conclusão sobre o efeito do Prumo.' : !prumoUsado ? 'O braço B não usou as ferramentas do Prumo em todas as execuções; comparação inválida.' : 'Diferença observada em amostra pequena e sem teste estatístico; não é prova de superioridade.' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const codex = localizarCodex(); const registros = []; let cliente = { nome: 'codex', executavel: codex ? path.basename(codex) : null, modelo: modelo ?? 'padrão do cliente (não informado)' };
  for (const n of listaCasos) for (let rep = 1; rep <= repeticoes; rep++) for (const braco of bracos) {
    const base = { caso: n, titulo: rubricaCasos[n].titulo, braco, repeticao: rep };
    if (!codex) { registros.push({ ...base, estado: 'NAO_EXECUTADA', motivo: 'Codex CLI não encontrado neste ambiente' }); continue; }
    const r = await executar(codex, braco, n);
    if (r.falha || r.expirou || r.codigo !== 0 || !r.saida) { registros.push({ ...base, estado: 'NAO_EXECUTADA', motivo: r.falha ? `falha ao iniciar: ${r.falha}` : r.expirou ? `tempo esgotado (${limite} ms)` : (falhaDoCliente(r.saida ?? '') ?? `Codex terminou com código ${r.codigo}`) }); console.log(`NAO_EXECUTADA caso ${n} braço ${braco}: ${registros.at(-1).motivo}`); continue; }
    const { chamadas, final, modelo: m } = extrair(r.saida); if (m) cliente.modelo = m;
    const resposta = extrairJson(final); const doc = fs.readFileSync(path.join(lab, 'requisitos', `RQ-0${n}.md`), 'utf8');
    const criterios = avaliarResposta(n, resposta, doc);
    const ferramentas = chamadas.map((c) => c.tool);
    const prumoUtilizado = braco === 'B' ? ferramentas.includes('contexto_projeto') && ferramentas.includes('revisar_cobertura') : false;
    registros.push({ ...base, estado: criterios.every((c) => c.ok) ? 'ATENDEU' : 'NAO_ATENDEU', duracaoMs: r.ms, ferramentasMcp: ferramentas, prumoUtilizado: braco === 'B' ? prumoUtilizado : undefined, respostaEstruturada: resposta, criterios, respostaFinal: final });
    console.log(`${registros.at(-1).estado} caso ${n} braço ${braco}#${rep}: ${criterios.filter((c) => c.ok).length}/${criterios.length}${braco === 'B' && !prumoUtilizado ? ' (Prumo NÃO foi usado)' : ''}`);
  }
  const resultado = { tipo: 'comparacao-com-e-sem-prumo', geradoEm: new Date().toISOString(), prumo: { versao: JSON.parse(fs.readFileSync(path.resolve(path.dirname(mcpJs), '..', 'package.json'), 'utf8')).version, skillSha256: skill ? createHash('sha256').update(skill).digest('hex') : null }, cliente, rubricaSha256: rubricaHash, repeticoes, registros, resumo: resumir(registros) };
  console.log(JSON.stringify(resultado.resumo));
  if (!process.argv.includes('--sem-gravar')) { fs.mkdirSync(path.join(lab, 'avaliacoes', 'resultados'), { recursive: true }); const nome = `${resultado.geradoEm.slice(0, 10)}-comparacao-prumo-${resultado.prumo.versao}.json`; fs.writeFileSync(path.join(lab, 'avaliacoes', 'resultados', nome), JSON.stringify(resultado, null, 2) + '\n'); console.log('Resultado gravado em avaliacoes/resultados/' + nome); }
}
