import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarMundo } from '../../../apoio/mundo-servicos.mjs';
import { criarPoliticaEscrita } from '../../../../dist/agendamentos/autorizacoes/criarPoliticaEscrita.js';
import { estadoDaAutorizacao as estadoEscrita } from '../../../../dist/agendamentos/autorizacoes/estadoDaAutorizacao.js';
import { listarOperacoes } from '../../../../dist/conexoes/banco/listarOperacoes.js';
import { catalogoOperacoes } from '../../../../dist/conexoes/escrita/catalogoOperacoes.js';
import { escritaHabilitada } from '../../../../dist/conexoes/escrita/escritaHabilitada.js';
import { executarOperacao } from '../../../../dist/conexoes/escrita/executarOperacao.js';
import { habilitarEscrita } from '../../../../dist/conexoes/escrita/habilitarEscrita.js';
import { prepararOperacao } from '../../../../dist/conexoes/escrita/prepararOperacao.js';
import { rotaEscritaPermitida } from '../../../../dist/conexoes/escrita/rotaEscritaPermitida.js';
import { caminhoDeTesteValido } from '../../../../dist/conexoes/github/caminhoDeTesteValido.js';
import { idsDeOperacao } from '../../../../dist/conexoes/tipos/operacoesExternas.js';
import { criarEspaco } from '../../../../dist/projetos/regras/criarEspaco.js';

const base = (t) => { const b = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo escrita ')); t.after(() => fs.rmSync(b, { recursive: true, force: true })); return b; };
async function montar(t, { escrita = true } = {}) {
  const b = base(t); const mundo = criarMundo(); const e = await criarEspaco({ nome: 'SMART-LAB' }, b);
  if (escrita) for (const s of ['jira', 'qase', 'github']) habilitarEscrita(e.id, s, true, 'pessoa', b);
  const rodar = (op, params, o = {}) => executarOperacao(mundo.executor, e.id, op, params, { base: b, confirmado: true, ...o });
  return { b, mundo, e, rodar };
}
const escritas = (mundo) => mundo.chamadas.filter(([metodo]) => metodo !== 'GET');

test('lista fechada de rotas: só as escritas previstas passam; apagar, traversal e rotas alheias são recusados', () => {
  const ok = [['jira', 'POST', '/rest/api/3/issue'], ['jira', 'PUT', '/rest/api/3/issue/SMART-1'], ['jira', 'POST', '/rest/api/3/issue/SMART-1/attachments'], ['jira', 'POST', '/rest/api/3/issue/SMART-1/transitions'], ['jira', 'POST', '/rest/api/3/issueLink'],
    ['qase', 'POST', '/v1/case/SFQ'], ['qase', 'PATCH', '/v1/case/SFQ/12'], ['qase', 'POST', '/v1/run/SFQ/9/complete'], ['qase', 'POST', '/v1/result/SFQ/9/bulk'], ['qase', 'POST', '/v1/attachment/SFQ'],
    ['github', 'POST', '/repos/empresa/repo/git/refs'], ['github', 'PUT', '/repos/empresa/repo/contents/tests/a.spec.ts'], ['github', 'POST', '/repos/empresa/repo/pulls']];
  for (const [s, m, c] of ok) assert.equal(rotaEscritaPermitida(s, m, c), true, `${s} ${m} ${c}`);
  const nao = [['jira', 'DELETE', '/rest/api/3/issue/SMART-1'], ['jira', 'PUT', '/rest/api/3/project/11'], ['jira', 'POST', '/rest/api/3/issue/SMART-1/watchers'], ['qase', 'DELETE', '/v1/case/SFQ/1'], ['qase', 'POST', '/v1/project'], ['qase', 'PATCH', '/v1/run/SFQ/1'],
    ['github', 'PUT', '/repos/empresa/repo/pulls/1/merge'], ['github', 'POST', '/repos/empresa/repo/git/refs/heads/main'], ['github', 'PATCH', '/repos/empresa/repo/git/refs/heads/main'], ['github', 'DELETE', '/repos/empresa/repo/git/refs/heads/x'],
    ['github', 'PUT', '/repos/empresa/repo/contents/../.github/workflows/x.yml'], ['github', 'PUT', '/repos/empresa/repo/contents/a%2e%2e/b'], ['jira', 'POST', '/rest/api/3/issue/SMART-1/comment%0d%0a']];
  for (const [s, m, c] of nao) assert.equal(rotaEscritaPermitida(s, m, c), false, `${s} ${m} ${c}`);
  assert.ok(idsDeOperacao.length >= 17 && catalogoOperacoes.every((o) => o.exigeConfirmacao === true));
});

test('portões: escrita desligada por padrão, confirmação humana obrigatória, leitura não dá permissão de escrita', async (t) => {
  const { mundo, e, rodar, b } = await montar(t, { escrita: false });
  await assert.rejects(rodar('jira.criar_ticket', { tipoId: '10001', resumo: 'Bug de teste' }), /WRITE_NOT_ENABLED/);
  assert.equal(escritaHabilitada(e.id, 'jira', b), false); assert.equal(escritas(mundo).length, 0);
  habilitarEscrita(e.id, 'jira', true, 'pessoa', b); assert.equal(escritaHabilitada(e.id, 'qase', b), false, 'habilitar o Jira não habilita o Qase');
  await assert.rejects(rodar('jira.criar_ticket', { tipoId: '10001', resumo: 'Bug de teste' }, { confirmado: false }), /HUMAN_CONFIRMATION_REQUIRED/);
  await assert.rejects(rodar('qase.criar_suite', { titulo: 'Suite A' }), /WRITE_NOT_ENABLED/);
  await assert.rejects(rodar('jira.apagar_tudo', {}), /OPERATION_UNKNOWN/); await assert.rejects(rodar('jira.criar_ticket', { tipoId: '10001', resumo: 'x', extra: 1 }));
  assert.equal(escritas(mundo).length, 0, 'nenhuma escrita chegou ao serviço');
  habilitarEscrita(e.id, 'jira', false, 'pessoa', b); assert.equal(escritaHabilitada(e.id, 'jira', b), false, 'revogável');
});

test('Jira: criar bug relacionado ao ticket de origem, idempotência, resposta perdida reconciliada e protegido contra outro projeto', async (t) => {
  const { mundo, e, rodar, b } = await montar(t);
  const p = { tipoId: '10001', resumo: 'Falha ao gravar após recarregar', descricao: 'Passos...\ntoken=SEGREDO1234567890abcdef', origem: 'SMART-1', rotulos: ['regressao'] };
  const previa = prepararOperacao(e.id, 'jira.criar_ticket', p, b); assert.match(previa.resumo, /Criar ticket "Falha ao gravar/); assert.equal(previa.escritaHabilitada, true); assert.equal(escritas(mundo).length, 0, 'prévia não envia');
  const r1 = await rodar('jira.criar_ticket', p); assert.equal(r1.estado, 'CONFIRMADA'); assert.match(r1.remoto.chave, /^SMART-\d+$/); assert.equal(r1.remoto.detalhes.vinculo, 'SMART-1'); assert.match(r1.remoto.url, /\/browse\/SMART-/);
  const criado = mundo.jira.issues.get(r1.remoto.chave); assert.ok(criado.fields.labels.some((l) => l.startsWith('prumo-'))); assert.doesNotMatch(JSON.stringify(criado), /SEGREDO1234567890abcdef/); assert.equal(criado.fields.project.id, '11');
  const r2 = await rodar('jira.criar_ticket', p); assert.equal(r2.reutilizada, true); assert.equal(r2.remoto.chave, r1.remoto.chave); assert.equal([...mundo.jira.issues.keys()].filter((k) => mundo.jira.issues.get(k).fields.summary === p.resumo).length, 1);
  // resposta perdida: o Jira criou, o Prumo não soube
  mundo.perderProximaResposta = true; const p2 = { tipoId: '10002', resumo: 'Melhoria de relatório' };
  const falha = await rodar('jira.criar_ticket', p2); assert.equal(falha.estado, 'FALHA'); assert.equal(falha.erro, 'SERVICE_TIMEOUT');
  const antes = mundo.jira.issues.size; const rec = await rodar('jira.criar_ticket', p2); assert.equal(rec.estado, 'CONFIRMADA'); assert.equal(rec.remoto.detalhes.reconciliado, true); assert.equal(mundo.jira.issues.size, antes, 'não criou segundo ticket');
  // proteções
  assert.equal((await rodar('jira.criar_ticket', { tipoId: '10001', resumo: 'Outro projeto', origem: 'CID-1' })).estado, 'FALHA'); // origem de outro projeto
  assert.equal((await rodar('jira.criar_ticket', { tipoId: '10003', resumo: 'Subtarefa proibida' })).estado, 'FALHA'); assert.equal((await rodar('jira.criar_ticket', { tipoId: '99999', resumo: 'Tipo inexistente' })).estado, 'FALHA');
  const hist = listarOperacoes(e.id, 50, b); assert.ok(hist.length >= 5); assert.doesNotMatch(JSON.stringify(hist), /SEGREDO1234567890abcdef|token=/); assert.ok(hist.every((h) => h.chave.length === 64));
});

test('idempotência recusa outro vínculo/conexão e livro legado sem escopo, sem reenviar', async t => {
  const {mundo,e,rodar,b}=await montar(t);const p={titulo:'Suite com escopo'};const reg=await rodar('qase.criar_suite',p);assert.equal(reg.estado,'CONFIRMADA');const antes=escritas(mundo).length;
  const original=mundo.executor.comContexto.bind(mundo.executor);
  mundo.executor.comContexto=(id,s,fn)=>original(id,s,(ctx,rec,info)=>fn(ctx,rec,{...info,vinculoId:'00000000-0000-4000-8000-000000000009'}));
  await assert.rejects(rodar('qase.criar_suite',p),/OPERATION_SCOPE_CHANGED/);assert.equal(escritas(mundo).length,antes);
  mundo.executor.comContexto=(id,s,fn)=>original(id,s,(ctx,rec,info)=>fn(ctx,rec,{...info,conexaoId:'00000000-0000-4000-8000-000000000009'}));
  await assert.rejects(rodar('qase.criar_suite',p),/OPERATION_SCOPE_CHANGED/);assert.equal(escritas(mundo).length,antes);
  mundo.executor.comContexto=original;const arquivo=path.join(b,'plataforma','operacoes-externas.json');const livro=JSON.parse(fs.readFileSync(arquivo,'utf8'));delete livro.itens[0].vinculoId;delete livro.itens[0].conexaoId;fs.writeFileSync(arquivo,JSON.stringify(livro));
  await assert.rejects(rodar('qase.criar_suite',p),/OPERATION_SCOPE_CHANGED/);assert.equal(escritas(mundo).length,antes);assert.equal(listarOperacoes(e.id,10,b)[0].estado,'CONFIRMADA');
});
test('Jira: anexar só de pastas autorizadas, sem duplicar; editar, mudar status e vincular conferem o projeto e o resultado', async (t) => {
  const { mundo, e, rodar, b } = await montar(t);
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo evid ')); t.after(() => fs.rmSync(raiz, { recursive: true, force: true })); fs.writeFileSync(path.join(raiz, 'log.txt'), 'saida\nPASSWORD=hunter2hunter2hunter2\n'); fs.writeFileSync(path.join(raiz, 'tela.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  const fora = path.join(os.tmpdir(), 'prumo-fora.txt'); fs.writeFileSync(fora, 'x'); t.after(() => fs.rmSync(fora, { force: true }));
  const aux = { raizesDeEvidencia: [raiz], arquivosAutorizados: [] };
  const a1 = await rodar('jira.anexar', { ticket: 'SMART-1', arquivo: path.join(raiz, 'log.txt') }, { aux }); assert.equal(a1.estado, 'CONFIRMADA'); assert.equal(mundo.jira.anexos.length, 1); assert.doesNotMatch(mundo.jira.anexos[0].corpo.toString('latin1'), /hunter2/, 'texto mascarado');
  assert.equal((await rodar('jira.anexar', { ticket: 'SMART-1', arquivo: path.join(raiz, 'tela.png') }, { aux })).estado, 'CONFIRMADA'); assert.equal(mundo.jira.anexos.length, 2);
  const repetido = await rodar('jira.anexar', { ticket: 'SMART-1', arquivo: path.join(raiz, 'tela.png') }, { aux }); assert.equal(repetido.reutilizada, true); assert.equal(mundo.jira.anexos.length, 2);
  mundo.perderProximaResposta = true; fs.writeFileSync(path.join(raiz, 'video.mp4'), Buffer.from([0, 1, 2, 3, 4]));
  assert.equal((await rodar('jira.anexar', { ticket: 'SMART-2', arquivo: path.join(raiz, 'video.mp4') }, { aux })).estado, 'FALHA'); const n = mundo.jira.anexos.length;
  assert.equal((await rodar('jira.anexar', { ticket: 'SMART-2', arquivo: path.join(raiz, 'video.mp4') }, { aux })).estado, 'CONFIRMADA'); assert.equal(mundo.jira.anexos.length, n, 'resposta perdida: o anexo não foi reenviado');
  assert.equal((await rodar('jira.anexar', { ticket: 'SMART-1', arquivo: fora }, { aux })).estado, 'FALHA', 'arquivo fora das pastas autorizadas'); assert.equal((await rodar('jira.anexar', { ticket: 'SMART-1', arquivo: fora }, { aux: { ...aux, arquivosAutorizados: [fora] } })).estado, 'CONFIRMADA', 'escolhido no diálogo nativo');
  fs.writeFileSync(path.join(raiz, 'segredo.pem'), 'x'); assert.equal((await rodar('jira.anexar', { ticket: 'SMART-1', arquivo: path.join(raiz, 'segredo.pem') }, { aux })).estado, 'FALHA', 'extensão não permitida');
  assert.equal((await rodar('jira.editar', { ticket: 'SMART-1', resumo: 'Resumo novo', adicionarRotulos: ['qa'] })).estado, 'CONFIRMADA'); assert.equal(mundo.jira.issues.get('SMART-1').fields.summary, 'Resumo novo');
  assert.equal((await rodar('jira.editar', { ticket: 'CID-1', resumo: 'Invasão' })).estado, 'FALHA'); assert.equal(mundo.jira.issues.get('CID-1').fields.summary, 'Ticket CID-1', 'ticket de outro projeto intacto');
  assert.equal((await rodar('jira.transicionar', { ticket: 'SMART-2', transicaoId: '31' })).estado, 'CONFIRMADA'); assert.equal(mundo.jira.issues.get('SMART-2').fields.status.name, 'Em andamento'); assert.equal((await rodar('jira.transicionar', { ticket: 'SMART-2', transicaoId: '999' })).estado, 'FALHA');
  const com = await rodar('jira.comentar', { ticket: 'SMART-2', texto: 'Falha reproduzida no ambiente de teste. token=SEGREDO1234567890abcdef' }); assert.equal(com.estado, 'CONFIRMADA'); assert.equal(mundo.jira.issues.get('SMART-2').comentarios.length, 1); assert.doesNotMatch(JSON.stringify(mundo.jira.issues.get('SMART-2').comentarios), /SEGREDO1234567890abcdef/);
  assert.equal((await rodar('jira.comentar', { ticket: 'SMART-2', texto: 'Falha reproduzida no ambiente de teste. token=SEGREDO1234567890abcdef' })).reutilizada, true); mundo.perderProximaResposta = true; assert.equal((await rodar('jira.comentar', { ticket: 'SMART-1', texto: 'Segundo comentário' })).estado, 'FALHA'); assert.equal((await rodar('jira.comentar', { ticket: 'SMART-1', texto: 'Segundo comentário' })).estado, 'CONFIRMADA'); assert.equal(mundo.jira.issues.get('SMART-1').comentarios.length, 1, 'resposta perdida: sem comentário duplicado'); assert.equal((await rodar('jira.comentar', { ticket: 'CID-1', texto: 'Outro projeto' })).estado, 'FALHA');
  assert.equal((await rodar('jira.vincular', { ticket: 'SMART-1', comTicket: 'SMART-2' })).estado, 'CONFIRMADA'); assert.equal(mundo.jira.issues.get('SMART-1').fields.issuelinks.length, 1); await assert.rejects(rodar('jira.vincular', { ticket: 'SMART-1', comTicket: 'SMART-1' }));
  void e;
});

test('Qase: criar caso sem duplicar, associar ao ticket, editar, resposta perdida reconciliada', async (t) => {
  const { mundo, rodar } = await montar(t);
  const caso = { titulo: 'Editor grava e persiste após recarregar', descricao: 'Regra RQ-01', preCondicoes: 'Usuário Editor', passos: [{ acao: 'Entrar como Editor', esperado: 'Painel visível' }, { acao: 'Gravar', esperado: 'Valor persistido' }], automacao: 'a-automatizar', ticket: 'SMART-100', prioridade: 1 };
  const c1 = await rodar('qase.criar_caso', caso); assert.equal(c1.estado, 'CONFIRMADA'); assert.match(c1.remoto.chave, /^SFQ-\d+$/); const salvo = mundo.qase.casos[0];
  assert.equal(salvo.steps.length, 2); assert.equal(salvo.isManual, 1); assert.equal(salvo.isToBeAutomated, 1); /* API real do Qase só aceita 0/1 */ assert.equal(salvo.steps_type, 'classic'); assert.deepEqual(salvo.external_issues[0].issues, [{ id: 'SMART-100' }]); assert.equal(c1.remoto.detalhes.ticket, 'SMART-100');
  assert.equal((await rodar('qase.criar_caso', caso)).reutilizada, true); assert.equal(mundo.qase.casos.length, 1);
  const dup = await rodar('qase.criar_caso', { ...caso, descricao: 'Outra descrição, mesmo título' }); assert.equal(dup.estado, 'FALHA'); assert.equal(dup.erro, 'SERVICE_DUPLICATE'); assert.equal(mundo.qase.casos.length, 1, 'título repetido na mesma suite não duplica');
  mundo.perderProximaResposta = true; const c2 = { titulo: 'Leitor é recusado ao gravar', passos: [{ acao: 'Entrar como Leitor' }] };
  assert.equal((await rodar('qase.criar_caso', c2)).estado, 'FALHA'); assert.equal(mundo.qase.casos.length, 2);
  const rec = await rodar('qase.criar_caso', c2); assert.equal(rec.estado, 'CONFIRMADA'); assert.equal(rec.remoto.detalhes.reconciliado, true); assert.equal(mundo.qase.casos.length, 2);
  assert.equal((await rodar('qase.editar_caso', { casoId: Number(c1.remoto.id), titulo: 'Editor grava e persiste (revisado)' })).estado, 'CONFIRMADA'); assert.match(mundo.qase.casos[0].title, /revisado/); assert.equal((await rodar('qase.editar_caso', { casoId: 9999, titulo: 'Inexistente' })).estado, 'FALHA');
  assert.equal((await rodar('qase.associar_ticket', { casoId: Number(rec.remoto.id), ticket: 'SMART-101' })).estado, 'CONFIRMADA'); assert.equal((await rodar('qase.criar_suite', { titulo: 'Regressão SMART' })).estado, 'CONFIRMADA'); assert.equal((await rodar('qase.criar_suite', { titulo: 'Regressão SMART', descricao: 'dup' })).erro, 'SERVICE_DUPLICATE');
});

test('Qase: plano, run, resultados verificáveis, sem duplicar e sem PASS inventado; run criada não é run executada', async (t) => {
  const { mundo, rodar } = await montar(t);
  const ids = []; for (const titulo of ['Caso A', 'Caso B', 'Caso C']) ids.push(Number((await rodar('qase.criar_caso', { titulo, passos: [{ acao: 'x' }] })).remoto.id));
  assert.equal((await rodar('qase.criar_plano', { titulo: 'Plano SMART', casos: [...ids, 9999] })).estado, 'FALHA', 'caso inexistente no projeto'); assert.equal(mundo.qase.planos.length, 0);
  assert.equal((await rodar('qase.criar_plano', { titulo: 'Plano SMART', casos: ids })).estado, 'CONFIRMADA'); assert.equal(mundo.qase.planos[0].cases.length, 3);
  const run = await rodar('qase.criar_run', { titulo: 'Run de regressão', casos: ids, planoId: mundo.qase.planos[0].id }); assert.equal(run.estado, 'CONFIRMADA'); const runId = Number(run.remoto.id); assert.equal(mundo.qase.resultados.length, 0, 'criar a run não registra resultado');
  const resultados = [{ casoId: ids[0], status: 'passed', tempoMs: 120, comentario: 'ok' }, { casoId: ids[1], status: 'failed', comentario: 'valor não persistiu', stacktrace: 'Error: x\nat token=SEGREDO1234567890abcdef' }, { casoId: ids[2], status: 'blocked', comentario: 'ambiente indisponível' }];
  const pub = await rodar('qase.publicar_resultados', { runId, resultados }); assert.equal(pub.estado, 'CONFIRMADA'); assert.equal(pub.remoto.detalhes.enviados, 3); assert.equal(mundo.qase.resultados.length, 3);
  assert.ok(mundo.qase.resultados.every((r) => /\[prumo-[a-f0-9]{10}\]/.test(r.comment))); assert.doesNotMatch(JSON.stringify(mundo.qase.resultados), /SEGREDO1234567890abcdef/); assert.deepEqual(mundo.qase.resultados.map((r) => r.status), ['passed', 'failed', 'blocked']);
  assert.equal((await rodar('qase.publicar_resultados', { runId, resultados })).reutilizada, true); assert.equal(mundo.qase.resultados.length, 3, 'repetir não duplica');
  // resposta perdida no envio parcial: reconcilia pelo marcador
  const run2 = Number((await rodar('qase.criar_run', { titulo: 'Segunda run', casos: ids })).remoto.id); mundo.perderProximaResposta = true;
  assert.equal((await rodar('qase.publicar_resultados', { runId: run2, resultados: [resultados[0]] })).estado, 'FALHA'); assert.equal(mundo.qase.resultados.length, 4);
  const rec = await rodar('qase.publicar_resultados', { runId: run2, resultados: [resultados[0]] }); assert.equal(rec.estado, 'CONFIRMADA'); assert.equal(mundo.qase.resultados.length, 4, 'nada reenviado');
  assert.equal((await rodar('qase.publicar_resultados', { runId: 9999, resultados: [resultados[0]] })).estado, 'FALHA'); assert.equal((await rodar('qase.completar_run', { runId })).estado, 'CONFIRMADA'); assert.equal(mundo.qase.runs[0].completa, true);
  await assert.rejects(rodar('qase.publicar_resultados', { runId, resultados: [{ casoId: ids[0], status: 'PASS' }] }), 'status fora do contrato do Qase é recusado');
});

test('Qase: anexar envia multipart com file[] e devolve o hash para usar nos resultados', async (t) => {
  const { mundo, rodar } = await montar(t); const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo evq ')); t.after(() => fs.rmSync(raiz, { recursive: true, force: true })); fs.writeFileSync(path.join(raiz, 'relatorio.json'), '{"ok":true,"token":"abc"}');
  const r = await rodar('qase.anexar', { arquivo: path.join(raiz, 'relatorio.json') }, { aux: { raizesDeEvidencia: [raiz], arquivosAutorizados: [] } }); assert.equal(r.estado, 'CONFIRMADA'); assert.match(r.remoto.id, /^[a-f0-9]{16,}$/); assert.equal(mundo.qase.anexos.length, 1);
});

test('GitHub: branch prumo/, arquivo de teste, PR em rascunho; nunca branch padrão, workflows, segredos nem arquivo que não seja teste', async (t) => {
  const { mundo, rodar } = await montar(t);
  assert.equal((await rodar('github.criar_branch', { nome: 'prumo/smart-100-cenarios' })).estado, 'CONFIRMADA'); assert.ok(mundo.github.refs.has('prumo/smart-100-cenarios'));
  const repetido = await rodar('github.criar_branch', { nome: 'prumo/smart-100-cenarios' }); assert.equal(repetido.reutilizada, true); assert.equal(mundo.github.refs.size, 2);
  await assert.rejects(rodar('github.criar_branch', { nome: 'main' })); await assert.rejects(rodar('github.criar_branch', { nome: 'feature/x' })); await assert.rejects(rodar('github.criar_branch', { nome: 'prumo/../main' }));
  const arq = { branch: 'prumo/smart-100-cenarios', caminho: 'tests/smart-100.spec.ts', conteudo: "import { test } from '@playwright/test';\ntest('x', async () => {});\n", mensagem: 'test: cenário SMART-100' };
  const c1 = await rodar('github.commitar_arquivo', arq); assert.equal(c1.estado, 'CONFIRMADA'); assert.match(c1.remoto.id, /^[a-f0-9]{40}$/); assert.equal(mundo.github.arquivos.size, 1);
  const c2 = await rodar('github.commitar_arquivo', { ...arq, mensagem: 'test: cenário SMART-100 (de novo)' }); assert.equal(c2.estado, 'CONFIRMADA'); assert.equal(c2.remoto.detalhes.semMudanca, true, 'mesmo conteúdo: sem novo commit');
  for (const ruim of ['.github/workflows/ci.yml', '.env', 'src/app.ts', '../tests/x.spec.ts', 'tests/chave.pem', '/tests/a.spec.ts', 'tests/a b.spec.ts?x']) await assert.rejects(rodar('github.commitar_arquivo', { ...arq, caminho: ruim }), `caminho ${ruim}`);
  assert.equal((await rodar('github.commitar_arquivo', { ...arq, branch: 'prumo/inexistente', caminho: 'tests/b.spec.ts' })).estado, 'FALHA');
  const pr = await rodar('github.abrir_pr', { branch: 'prumo/smart-100-cenarios', titulo: 'Cenários do SMART-100', corpo: 'Propostos pelo Prumo QA para revisão.' }); assert.equal(pr.estado, 'CONFIRMADA'); assert.equal(mundo.github.prs[0].draft, true); assert.equal(mundo.github.prs[0].base, 'main'); assert.match(pr.remoto.url, /\/pull\/1$/);
  assert.equal((await rodar('github.abrir_pr', { branch: 'prumo/smart-100-cenarios', titulo: 'Cenários do SMART-100 v2' })).remoto.detalhes.existente, true); assert.equal(mundo.github.prs.length, 1, 'PR aberto do branch é reaproveitado');
  assert.ok(escritas(mundo).every(([m, c]) => !/\/merge|\/refs\/heads\/main|DELETE/.test(m + c)));
  for (const [c, esperado] of [['tests/login.spec.ts', true], ['e2e/fluxo.test.js', true], ['automacao/api/pedidos.py', true], ['README.md', false], ['src/index.ts', false], ['.github/workflows/x.yml', false], ['tests/.env', false]]) assert.equal(caminhoDeTesteValido(c), esperado, c);
});

test('escrita agendada: só publicar resultados no Qase, só com política vigente para aquela run; sem política fica BLOQUEADA', async (t) => {
  const { mundo, e, rodar, b } = await montar(t); const caso = Number((await rodar('qase.criar_caso', { titulo: 'Caso agendado', passos: [{ acao: 'x' }] })).remoto.id); const runId = Number((await rodar('qase.criar_run', { titulo: 'Run agendada', casos: [caso] })).remoto.id);
  const pub = { runId, resultados: [{ casoId: caso, status: 'passed', comentario: 'rotina agendada' }] };
  const sem = await rodar('qase.publicar_resultados', pub, { origem: 'AGENDADO', confirmado: false, runPolitica: runId }); assert.equal(sem.estado, 'BLOQUEADA'); assert.equal(sem.erro, 'WRITE_POLICY_MISSING'); assert.equal(mundo.qase.resultados.length, 0);
  assert.equal((await rodar('jira.criar_ticket', { tipoId: '10001', resumo: 'Bug agendado' }, { origem: 'AGENDADO', runPolitica: runId })).estado, 'BLOQUEADA', 'criar ticket nunca é agendável');
  const pol = criarPoliticaEscrita(e.id, { operacao: 'qase.publicar_resultados', runs: [runId], dias: 1, maxUsos: 2 }, 'pessoa', b); assert.equal(estadoEscrita(pol), 'VIGENTE');
  assert.equal((await rodar('qase.publicar_resultados', { ...pub, runId: runId + 50 }, { origem: 'AGENDADO', runPolitica: runId + 50 })).estado, 'BLOQUEADA', 'outra run não é coberta');
  const ok = await rodar('qase.publicar_resultados', pub, { origem: 'AGENDADO', runPolitica: runId }); assert.equal(ok.estado, 'CONFIRMADA'); assert.equal(ok.origem, 'AGENDADO'); assert.equal(mundo.qase.resultados.length, 1);
  assert.equal((await rodar('qase.publicar_resultados', pub, { origem: 'AGENDADO', runPolitica: runId })).reutilizada, true, 'repetir não duplica');
});
