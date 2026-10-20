// Avaliação SEMÂNTICA controlada com um agente de IA real (Codex CLI), usando o MCP real do Prumo.
// Se o Codex não estiver disponível (ou falhar), cada caso é registrado como NAO_EXECUTADA: nenhuma interação é fabricada.
// Uso: node avaliacoes/semantica.mjs [--casos 1,2,3] [--prumo <mcp.js>] [--codex <codex.exe>] [--timeout-ms 240000] [--sem-gravar]
// A Skill é entregue ao agente por inclusão no prompt (não por invocação automática); o hash dela vai no resultado.
// Critérios: estruturais, sobre as chamadas MCP que o agente realmente fez e as respostas reais do Prumo. Texto final é só registrado.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrair, criterios, falhaDoCliente } from './semantica-criterios.mjs';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const mcpJs = path.resolve(arg('--prumo') ?? process.env.PRUMO_MCP ?? path.join(lab, '..', 'Prumo-Qa', 'dist', 'mcp.js'));
const limite = Number(arg('--timeout-ms') ?? 240000);
const casos = (arg('--casos') ?? '1,2,3,4,5,6,7,8').split(',').map(Number);

function localizarCodex() {
  if (arg('--codex')) return arg('--codex');
  const bin = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  try { for (const d of fs.readdirSync(bin).sort().reverse()) { const e = path.join(bin, d, 'codex.exe'); if (fs.existsSync(e)) return e; } } catch { /* não instalado */ }
  const r = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['codex'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0] : null;
}
const skillArq = path.resolve(path.dirname(mcpJs), '..', 'skills', 'qa', 'SKILL.md');
const skill = fs.existsSync(skillArq) ? fs.readFileSync(skillArq, 'utf8') : '';
const pacotePrumo = path.resolve(path.dirname(mcpJs), '..', 'package.json');
const prumoVersao = fs.existsSync(pacotePrumo) ? JSON.parse(fs.readFileSync(pacotePrumo, 'utf8')).version : null;
const codex = localizarCodex();

const prompt = (n) => `Tarefa de engenharia de qualidade num projeto vinculado ao servidor MCP "prumo-lab". Use SOMENTE as ferramentas MCP do Prumo; não execute shell, não leia nem edite arquivos, não chame outros MCPs.

Passos:
1. Chame contexto_projeto e leia o requisito RQ-0${n} (requisitos/RQ-0${n}.md) e os testes existentes que forem relevantes.
2. Aplique a metodologia da Skill abaixo e proponha os cenários de teste adequados ao requisito. Não invente regra, resultado esperado nem teste existente.
3. Chame revisar_cobertura com: requirement (cópia literal de UMA frase do requisito), source, sourcePath, existingTests (somente os que você leu, com testPath real), candidates e, se houver, contradictions.
4. Explique em português os achados do Prumo, as lacunas e o que ainda depende de esclarecimento. Não declare PASS: nada foi executado. Não chame executar_validacao com solicitarAprovacao.

--- Skill de QA (SKILL.md) ---
${skill}`;

function executar(n) {
  return new Promise((resolve) => {
    const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo lab semantica '));
    const fwd = (p) => p.replaceAll('\\', '/');
    const args = ['exec', '--ephemeral', '--ignore-user-config', '--json', '-s', 'read-only', '-C', lab,
      '-c', 'mcp_servers.prumo-lab.command="node"', '-c', `mcp_servers.prumo-lab.args=["${fwd(mcpJs)}","${fwd(lab)}"]`, '-c', `mcp_servers.prumo-lab.env={PRUMO_DATA_DIR="${fwd(dados)}"}`, prompt(n)];
    const filho = spawn(codex, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '', erro = ''; let expirou = false;
    const timer = setTimeout(() => { expirou = true; filho.kill(); }, limite);
    filho.stdout.on('data', (b) => { saida += b; }); filho.stderr.on('data', (b) => { erro += b; });
    filho.on('error', (e) => { clearTimeout(timer); resolve({ falha: e.message, saida: '', expirou: false, codigo: null }); });
    filho.on('close', (codigo) => { clearTimeout(timer); fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); resolve({ saida, stderr: erro.slice(-1500), expirou, codigo }); });
  });
}
const resultado = { tipo: 'avaliacao-semantica', geradoEm: new Date().toISOString(), prumo: { versao: prumoVersao, skillSha256: skill ? createHash('sha256').update(skill).digest('hex') : null, skillEntregue: 'inclusão no prompt' }, cliente: { nome: 'codex', executavel: codex ? path.basename(codex) : null }, casos: [] };
if (!codex) { for (const n of casos) resultado.casos.push({ caso: n, estado: 'NAO_EXECUTADA', motivo: 'Codex CLI não encontrado neste ambiente' }); }
else for (const n of casos) {
  const esperado = JSON.parse(fs.readFileSync(path.join(lab, 'cenarios', `caso-${n}`, 'esperado.json'), 'utf8'));
  const r = await executar(n);
  if (r.falha || r.expirou || r.codigo !== 0 || !r.saida) { resultado.casos.push({ caso: n, titulo: esperado.titulo, estado: 'NAO_EXECUTADA', motivo: r.falha ? `falha ao iniciar: ${r.falha}` : r.expirou ? `tempo esgotado (${limite} ms)` : (falhaDoCliente(r.saida ?? '') ?? `Codex terminou com código ${r.codigo}`), codigoDeSaida: r.codigo }); console.log(`NAO_EXECUTADA caso ${n}: ${resultado.casos.at(-1).motivo}${r.stderr ? " | " + String(r.stderr).slice(-300) : ""}`); continue; }
  const { chamadas, final, modelo } = extrair(r.saida);
  const checks = criterios(n, esperado, chamadas, final);
  resultado.cliente.modelo = modelo ?? resultado.cliente.modelo ?? 'não informado pelo cliente';
  resultado.casos.push({ caso: n, titulo: esperado.titulo, estado: checks.every((c) => c.ok) ? 'ATENDEU' : 'NAO_ATENDEU', ferramentasChamadas: chamadas.map((c) => c.tool), chamadasMcp: chamadas.map((c) => ({ tool: c.tool, status: c.status, argumentos: c.tool === 'contexto_projeto' ? {} : c.argumentos })), checks, achadosDoPrumo: (chamadas.filter((c) => c.tool === 'revisar_cobertura').at(-1)?.resposta?.findings ?? []).map((f) => ({ type: f.type, scenario: f.scenario ?? null })), respostaFinalDoAgente: final });
  console.log(`${resultado.casos.at(-1).estado} caso ${n} — ${esperado.titulo}: ${checks.filter((c) => c.ok).length}/${checks.length}${checks.some((c) => !c.ok) ? ' · ' + checks.filter((c) => !c.ok).map((c) => c.criterio).join(' | ') : ''}`);
}
resultado.resumo = { atendeu: resultado.casos.filter((c) => c.estado === 'ATENDEU').length, naoAtendeu: resultado.casos.filter((c) => c.estado === 'NAO_ATENDEU').length, naoExecutada: resultado.casos.filter((c) => c.estado === 'NAO_EXECUTADA').length };
resultado.observacao = 'Critérios estruturais sobre chamadas MCP reais. A qualidade semântica final das explicações deve ser revista por uma pessoa (respostaFinalDoAgente).';
if (!process.argv.includes('--sem-gravar')) { fs.mkdirSync(path.join(lab, 'avaliacoes', 'resultados'), { recursive: true }); const nome = `${resultado.geradoEm.slice(0, 10)}-prumo-${prumoVersao}-semantica.json`; fs.writeFileSync(path.join(lab, 'avaliacoes', 'resultados', nome), JSON.stringify(resultado, null, 2) + '\n'); console.log('Resultado gravado em avaliacoes/resultados/' + nome); }
console.log(JSON.stringify(resultado.resumo));
