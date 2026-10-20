// Avaliação determinística do Prumo QA pelo protocolo MCP REAL (stdio). Não usa IA.
// Uso: node avaliacoes/avaliar.mjs [--prumo <caminho do mcp.js>] [--comando <executavel>] [--dados <pasta>] [--sem-gravar]
// Ambiente: PRUMO_MCP (mcp.js), PRUMO_MCP_COMMAND (ex.: "Prumo QA.exe") e PRUMO_MCP_ELECTRON=1 quando o comando for o app instalado.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarRevisao, avaliarExecucao, resumir } from './criterios.mjs';
import { carregarPrumo, semear } from './semear.mjs';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const mcpJs = path.resolve(arg('--prumo') ?? process.env.PRUMO_MCP ?? path.join(lab, '..', 'Prumo-Qa', 'dist', 'mcp.js'));
if (!fs.existsSync(mcpJs)) { console.error(`mcp.js do Prumo não encontrado em ${mcpJs}. Informe --prumo ou PRUMO_MCP.`); process.exit(2); }
const comando = arg('--comando') ?? process.env.PRUMO_MCP_COMMAND ?? process.execPath;
const dados = arg('--dados') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'prumo lab dados '));
const env = { PRUMO_DATA_DIR: dados, ...(process.env.PRUMO_MCP_ELECTRON === '1' ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };

const client = new Client({ name: 'prumo-qa-lab-avaliador', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: comando, args: [mcpJs, lab], env }));
const chamar = async (name, args) => { const r = await client.callTool({ name, arguments: args }); const texto = r.content?.[0]?.text ?? ''; try { return JSON.parse(texto); } catch { return { erro: texto, isError: r.isError }; } };
try {
  const versaoPrumo = client.getServerVersion()?.version ?? 'desconhecida';
  // Commit do código do Prumo avaliado (a mesma versão 2.3.0 pode ter commits pós-release); "-dirty" se houver alterações locais.
  const git = (...a) => spawnSync('git', ['-C', path.resolve(path.dirname(mcpJs), '..'), ...a], { encoding: 'utf8' });
  const commit = git('rev-parse', '--short', 'HEAD').status === 0 ? git('rev-parse', '--short', 'HEAD').stdout.trim() + (git('status', '--porcelain', '--', 'src', 'skills', 'package.json').stdout.trim() ? '-dirty' : '') : null;
  const skill = path.resolve(path.dirname(mcpJs), '..', 'skills', 'qa', 'SKILL.md');
  const skillSha = fs.existsSync(skill) ? createHash('sha256').update(fs.readFileSync(skill)).digest('hex') : null;
  const ferramentas = (await client.listTools()).tools.map((t) => t.name).sort();
  const gerais = [];
  gerais.push({ criterio: 'servidor expõe exatamente as oito ferramentas', ok: JSON.stringify(ferramentas) === JSON.stringify(['consultar_evidencias', 'contexto_projeto', 'executar_validacao', 'listar_politicas', 'propor_aprendizado', 'propor_bug', 'propor_caso', 'revisar_cobertura']), detalhe: ferramentas.join(',') });
  const ctx = await chamar('contexto_projeto', {});
  gerais.push({ criterio: 'contexto identifica projeto de automação com node:test', ok: ctx.tipo === 'automacao' && ctx.stack?.includes('node:test'), detalhe: `tipo=${ctx.tipo} stack=${ctx.stack}` });
  gerais.push({ criterio: 'contexto lista requisitos, testes e código autorizados', ok: ['requisitos/RQ-01.md', 'aplicacao/testes/frete.test.mjs', 'aplicacao/src/frete.mjs'].every((p) => ctx.sources?.some((s) => s.path.replaceAll('\\', '/') === p)), detalhe: `${ctx.sources?.length} fontes` });
  gerais.push({ criterio: 'contexto é NOT_VERIFIED e declara informações ausentes', ok: ctx.state === 'NOT_VERIFIED' && ctx.missing?.length > 0, detalhe: `state=${ctx.state}` });
  gerais.push({ criterio: 'contexto não expõe cenários, esperados nem avaliações do laboratório', ok: !JSON.stringify(ctx).match(/esperado\.json|obrigatorios|cenarios\/caso/), detalhe: 'varredura do contexto retornado' });
  // Recursos que só existem a partir do 2.4 (contextos persistentes e Playwright): versões antigas ficam NAO_APLICAVEL, nunca reprovadas.
  const props = (await client.listTools()).tools.find((t) => t.name === 'revisar_cobertura')?.inputSchema?.properties ?? {};
  const recursos = { contextoId: 'contextoId' in props, frameworks: Array.isArray(ctx.frameworks) };
  if (recursos.frameworks) gerais.push({ criterio: 'contexto detecta Playwright como CONFIRMADO por evidência real (dependência + configuração)', ok: ctx.frameworks.some((f) => f.id === 'playwright' && f.estado === 'CONFIRMADO' && f.evidencias.length >= 2), detalhe: JSON.stringify(ctx.frameworks.map((f) => [f.id, f.estado])) });
  if (recursos.contextoId) gerais.push({ criterio: 'sem habilitação da pessoa, contexto_projeto não entrega contextos ao agente (padrão seguro)', ok: ctx.contextos?.disponivel === false && ctx.contextos?.referencias?.length === 0, detalhe: JSON.stringify(ctx.contextos?.disponivel) });
  const evid = await chamar('consultar_evidencias', {});
  const resultadosIniciais = evid.results ?? [];
  gerais.push({ criterio: 'evidências existentes (rodadas anteriores) não contêm PASS nem execução real sem aprovação humana', ok: resultadosIniciais.every((e) => e.status !== 'PASS' && e.executed === false) && (resultadosIniciais.length > 0 || evid.status === 'NOT_RUN'), detalhe: `${resultadosIniciais.length} evidência(s); status=${evid.status ?? 'com resultados'}` });

  const casos = [];
  for (let n = 1; n <= 8; n++) {
    const dir = path.join(lab, 'cenarios', `caso-${n}`);
    const esperado = JSON.parse(fs.readFileSync(path.join(dir, 'esperado.json'), 'utf8'));
    const plano = JSON.parse(fs.readFileSync(path.join(dir, 'plano.json'), 'utf8'));
    const resposta = await chamar('revisar_cobertura', plano);
    let checks = avaliarRevisao(esperado, resposta);
    for (const c of esperado.capacidades ?? []) checks = checks.concat(avaliarExecucao(c.capability, await chamar('executar_validacao', { capability: c.capability }), c.estadoEsperado));
    casos.push({ caso: n, titulo: esperado.titulo, ...resumir(checks), checks, achados: (resposta.findings ?? []).map((f) => ({ type: f.type, scenario: f.scenario ?? null, severity: f.severity })), seleçãoSugerida: resposta.suggestedSelection ?? [], limitesConhecidos: esperado.limitesConhecidos ?? [] });
  }
  // Casos 9 a 14: contextos persistentes (semeados no armazenamento isolado) e testes Playwright.
  const prumo = await carregarPrumo(mcpJs);
  for (let n = 9; n <= 14; n++) {
    const dir = path.join(lab, 'cenarios', `caso-${n}`);
    const esperado = JSON.parse(fs.readFileSync(path.join(dir, 'esperado.json'), 'utf8')); const plano = JSON.parse(fs.readFileSync(path.join(dir, 'plano.json'), 'utf8'));
    if (!recursos[esperado.exigeRecurso] || (esperado.semente && !prumo)) { casos.push({ caso: n, titulo: esperado.titulo, estado: 'NAO_APLICAVEL', motivo: `esta versão do Prumo não possui o recurso "${esperado.exigeRecurso}"`, aprovado: null, total: 0, ok: 0, falhas: [], checks: [], achados: [], limitesConhecidos: esperado.limitesConhecidos ?? [] }); continue; }
    const semeado = esperado.semente ? await semear(prumo, lab, dados, esperado) : null;
    try {
      const entrada = { ...plano }; if (semeado) { entrada.contextoId = semeado.ids[plano.contextoRef]; delete entrada.contextoRef; }
      const resposta = await chamar('revisar_cobertura', entrada); let checks = avaliarRevisao(esperado, resposta);
      if (esperado.contextoProjeto) {
        const c = await chamar('contexto_projeto', {}); const refs = c.contextos?.referencias ?? [];
        for (const [ref, estadoEsperado] of Object.entries(esperado.contextoProjeto.estados ?? {})) { const r = refs.find((x) => x.id === semeado.ids[ref]); checks.push({ criterio: `contexto_projeto entrega o contexto "${ref}" com estado ${estadoEsperado}, versão, hash e origem`, ok: !!r && r.estado === estadoEsperado && r.versao >= 1 && /^[a-f0-9]{64}$/.test(r.hash) && !!r.origem, detalhe: r ? `estado=${r.estado}` : 'ausente' }); }
        for (const ref of esperado.contextoProjeto.ausentes ?? []) checks.push({ criterio: `contexto_projeto NÃO entrega o contexto "${ref}" de outro projeto (isolamento)`, ok: !refs.some((x) => x.id === semeado.ids[ref]) && !JSON.stringify(c).includes(semeado.ids[ref]), detalhe: `${refs.length} referência(s)` });
      }
      if (esperado.frameworkConfirmado) checks.push({ criterio: `framework "${esperado.frameworkConfirmado}" confirmado por evidência antes da análise`, ok: ctx.frameworks?.some((f) => f.id === esperado.frameworkConfirmado && f.estado === 'CONFIRMADO'), detalhe: 'contexto_projeto.frameworks' });
      casos.push({ caso: n, titulo: esperado.titulo, ...resumir(checks), checks, achados: (resposta.findings ?? []).map((f) => ({ type: f.type, scenario: f.scenario ?? null, severity: f.severity })), seleçãoSugerida: resposta.suggestedSelection ?? [], limitesConhecidos: esperado.limitesConhecidos ?? [] });
    } finally { semeado?.limpar(); }
  }
  const unit = await chamar('executar_validacao', { capability: 'unit' });
  gerais.push(...avaliarExecucao('unit', unit, 'BLOCKED'));
  const evidDepois = await chamar('consultar_evidencias', {});
  gerais.push({ criterio: 'a tentativa bloqueada gerou evidência BLOCKED, sem PASS', ok: (evidDepois.results ?? []).length === resultadosIniciais.length + 2 && evidDepois.results.every((e) => e.status === 'BLOCKED'), detalhe: `${resultadosIniciais.length} → ${(evidDepois.results ?? []).length} evidências` });

  const resultado = { tipo: 'avaliacao-deterministica', geradoEm: new Date().toISOString(), prumo: { versao: versaoPrumo, commit, mcp: path.relative(lab, mcpJs).startsWith('..') ? 'externo' : mcpJs, skillSha256: skillSha }, node: process.version,
    ferramentas, gerais: { ...resumir(gerais), checks: gerais }, casos,
    resumo: { casosAprovados: casos.filter((c) => c.aprovado).length, casos: casos.filter((c) => c.estado !== 'NAO_APLICAVEL').length, naoAplicaveis: casos.filter((c) => c.estado === 'NAO_APLICAVEL').length, verificacoes: casos.reduce((n, c) => n + c.total, 0) + gerais.length, verificacoesOk: casos.reduce((n, c) => n + c.ok, 0) + gerais.filter((g) => g.ok).length },
    aprovado: casos.filter((c) => c.estado !== 'NAO_APLICAVEL').every((c) => c.aprovado) && gerais.every((g) => g.ok),
    observacao: 'Aprovado significa que o comportamento estrutural do Prumo atendeu aos critérios. Julgamento semântico não é avaliado aqui (veja semantica.mjs).' };
  if (!process.argv.includes('--sem-gravar')) {
    const nome = `${resultado.geradoEm.slice(0, 10)}-prumo-${versaoPrumo}${commit ? '-' + commit : ''}-deterministico.json`;
    fs.mkdirSync(path.join(lab, 'avaliacoes', 'resultados'), { recursive: true });
    fs.writeFileSync(path.join(lab, 'avaliacoes', 'resultados', nome), JSON.stringify(resultado, null, 2) + '\n');
    console.log('Resultado gravado em avaliacoes/resultados/' + nome);
  }
  for (const c of casos) console.log(`${c.estado === 'NAO_APLICAVEL' ? 'N/A   ' : c.aprovado ? 'OK    ' : 'FALHOU'} caso ${c.caso} — ${c.titulo}: ${c.estado === 'NAO_APLICAVEL' ? c.motivo : `${c.ok}/${c.total}${c.falhas.length ? ' · ' + c.falhas.join(' | ') : ''}`}`);
  console.log(`${gerais.every((g) => g.ok) ? 'OK    ' : 'FALHOU'} gerais: ${gerais.filter((g) => g.ok).length}/${gerais.length}${gerais.filter((g) => !g.ok).map((g) => ' · ' + g.criterio).join('')}`);
  console.log(`Prumo ${versaoPrumo}${commit ? ' @' + commit : ''}: ${resultado.resumo.casosAprovados}/${resultado.resumo.casos} casos, ${resultado.resumo.verificacoesOk}/${resultado.resumo.verificacoes} verificações.`);
  process.exitCode = resultado.aprovado ? 0 : 1;
} finally { await client.close(); }
