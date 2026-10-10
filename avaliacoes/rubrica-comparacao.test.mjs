import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { avaliarResposta, extrairJson, casos } from './rubrica.mjs';
import { promptA, promptB, resumir } from './comparacao.mjs';
import { calcular } from './metricas.mjs';
import { avaliarMutante } from './deteccao.mjs';
import { mutantes } from './mutantes.mjs';

/**
 * Testes da rubrica, da comparação com/sem Prumo, das métricas e da detecção de mutantes.
 * As respostas abaixo são FIXTURES SINTÉTICAS escritas à mão para provar que a rubrica é satisfazível e que reprova respostas ruins.
 * NÃO são respostas de IA e NÃO entram em nenhum resultado de avaliação.
 */
const doc = (n) => (n === 14 ? '' : fs.readFileSync(`requisitos/RQ-0${n}.md`, 'utf8'));
const req = (n) => doc(n).split('\n').filter((l) => l && !l.startsWith('#'))[0];
const c = (id, entrada, resultadoEsperado, oraculo, extra = {}) => ({ id, comportamento: `cenário ${id}`, tecnica: 'equivalence', entrada, resultadoEsperado, oraculo, risco: 'risco', ...extra });
const base = (n, cenarios, extra = {}) => ({ requisito: req(n), riscos: ['r'], lacunasNosTestesExistentes: [], cenarios, redundanciasCandidatas: [], hipoteses: [], incertezas: [], bloqueios: [], declaraExecucao: false, ...extra });
const boas = {
  1: base(1, [17, 18, 65, 66].map((n) => c('L' + n, `idade ${n}`, n === 18 || n === 65 ? 'elegível' : 'não elegível', `elegivel(${n})`, { tecnica: 'boundary', limite: n })), { lacunasNosTestesExistentes: ['O único teste usa 30 e não exercita nenhum limite (18, 65)'] }),
  2: base(2, [c('a', 'região SUL', '10', 'frete 10'), c('b', 'região NORDESTE', '20', 'frete 20'), c('c', 'região CENTRO_OESTE', '15', 'frete 15'), c('d', 'região LUA desconhecida', 'RangeError', 'lança RangeError')]),
  3: base(3, [c('a', 'ADMIN pedido FECHADO', 'permitido', 'true'), c('b', 'GERENTE pedido ABERTO', 'permitido', 'true'), c('c', 'GERENTE pedido FECHADO', 'recusado', 'false'), c('d', 'OPERADOR pedido ABERTO', 'recusado', 'false'), c('e', 'visitante sem usuário', 'recusado', 'false')], { lacunasNosTestesExistentes: ['GERENTE e OPERADOR não têm teste'] }),
  4: base(4, [c('a', 'OPERADOR tenta excluir pedido 1', 'recusa e pedido permanece', 'loja.obter(1) igual ao original e total() inalterado')], { lacunasNosTestesExistentes: ['O teste existente só verifica que lança erro, não o estado do dado (persistência)'] }),
  5: base(5, [c('a', 'região NORDESTE', '20', 'frete 20')], { redundanciasCandidatas: [['teste SUL', 'teste SUDESTE']] }),
  6: base(6, [c('a', 'cupom PRUMO10 total 200', '180', 'total final igual a 180'), c('b', 'cupom OUTRO total 200', '200', 'total final igual a 200')]),
  7: base(7, [c('a', 'PRUMO10 total 200', '180', 'total final 180')], { lacunasNosTestesExistentes: ['O teste está com skip (ignorado)', 'O outro teste só confere o tipo número, não valida o valor do desconto'] }),
  8: base(8, [c('a', 'frete de pedido de 600 de cliente comum', 'indefinido até esclarecer o conflito', 'a definir')], { incertezas: ['As regras de frete grátis se contradizem'], bloqueios: ['Banco de testes isolado ausente: integração bloqueada'] }),
  14: base(14, [c('a', 'cancelar pedido pela interface', 'pedido cancelado', 'o status do pedido mudou (consulta GET ao servidor)')], { requisito: 'O cancelamento de pedido deve ser verificado pela interface e pela API.', lacunasNosTestesExistentes: ['O teste cancelar pedido não tem nenhuma assertion', 'Usa waitForTimeout (espera fixa) e um seletor XPath frágil', 'O teste do operador está com skip (ignorado)', 'Os dois testes de listar pedidos são idênticos (duplicados)', 'O teste do título da página usa toBeTruthy (assertion fraca)', 'O teste de API só confere .ok(), sem validar o corpo', 'Falta verificar a persistência no servidor depois de salvar ou cancelar'] })
};
const falhou = (n, r) => avaliarResposta(n, r, doc(n)).filter((x) => !x.ok).map((x) => x.id);

test('rubrica é satisfazível: a resposta sintética correta de cada caso atende a todos os critérios', () => {
  for (const n of Object.keys(casos).map(Number)) assert.deepEqual(falhou(n, boas[n]), [], `caso ${n}`);
});

test('rubrica reprova respostas ruins: execução afirmada, requisito inventado, sem oráculo, excesso de cenários e formato inválido', () => {
  assert.ok(falhou(6, { ...boas[6], declaraExecucao: true }).includes('sem-execucao-afirmada'));
  assert.ok(falhou(6, { ...boas[6], incertezas: ['todos os testes passaram'] }).includes('sem-execucao-afirmada'));
  assert.ok(falhou(6, { ...boas[6], requisito: 'O cupom dá 50% de desconto na primeira compra' }).includes('requisito-literal'));
  assert.ok(falhou(6, { ...boas[6], cenarios: [c('a', 'PRUMO10 200', '180', '')] }).includes('todo-cenario-tem-oraculo'));
  assert.ok(falhou(6, base(6, Array.from({ length: 9 }, (_, i) => c('x' + i, 'PRUMO10 200', '180', 'total 180')))).includes('parcimonia'));
  assert.ok(falhou(6, null).includes('formato'));
  assert.ok(falhou(6, { ...boas[6], cenarios: [...boas[6].cenarios, c('z', 'cupom com validade de 30 dias', 'expira', 'recusa')] }).includes('sem-regra-inventada'));
});

test('rubrica do caso 14 (Playwright): exige cada antipadrão, não acusa o teste bom e não exige requisito literal', () => {
  assert.deepEqual(falhou(14, boas[14]), []);
  const sem = (trecho) => ({ ...boas[14], lacunasNosTestesExistentes: boas[14].lacunasNosTestesExistentes.filter((l) => !l.includes(trecho)) });
  for (const [trecho, id] of [['waitForTimeout', 'espera-fixa'], ['skip', 'teste-ignorado'], ['duplicados', 'duplicado'], ['toBeTruthy', 'assertion-fraca'], ['.ok()', 'api-so-status']]) assert.ok(falhou(14, sem(trecho)).includes(id), id);
  // persistência pode ser citada nas lacunas OU no oráculo dos cenários: só some se as duas fontes não a mencionarem
  assert.ok(falhou(14, { ...sem('persistência'), cenarios: [c('a', 'cancelar pedido pela interface', 'pedido cancelado', 'mensagem de sucesso na tela')] }).includes('persistencia'));
  assert.ok(falhou(14, { ...boas[14], lacunasNosTestesExistentes: [...boas[14].lacunasNosTestesExistentes, 'O teste salvar pedido usa seletor frágil'] }).includes('nao-acusa-teste-bom'));
  assert.ok(falhou(14, { ...boas[14], declaraExecucao: true }).includes('sem-execucao-afirmada'));
});

test('rubrica por caso: fronteira faltando, faixa duplicada, perfil ausente, oráculo só de erro, escolha de regra contraditória', () => {
  assert.ok(falhou(1, base(1, [17, 18, 65].map((n) => c('L' + n, `idade ${n}`, 'x', 'y', { limite: n })))).includes('quatro-fronteiras'));
  assert.ok(falhou(2, base(2, [c('a', 'região SUL', '10', 'x'), c('b', 'região SUDESTE', '10', 'x'), c('c', 'região NORDESTE', '20', 'x'), c('d', 'região CENTRO_OESTE', '15', 'x'), c('e', 'região LUA desconhecida', 'erro', 'x')])).includes('sem-duplicar-faixa'));
  assert.ok(!falhou(2, base(2, [c('a', 'região SUL', '10', 'x'), c('b', 'região SUDESTE', '10', 'x'), c('c', 'região NORDESTE', '20', 'x'), c('d', 'região CENTRO_OESTE', '15', 'x'), c('e', 'região LUA desconhecida', 'erro', 'x')], { redundanciasCandidatas: [['SUL', 'SUDESTE']] })).includes('sem-duplicar-faixa'), 'duplicar é aceito se declarado como redundância');
  assert.ok(falhou(3, base(3, boas[3].cenarios.slice(0, 3))).includes('cinco-combinacoes'));
  assert.ok(falhou(4, base(4, [c('a', 'OPERADOR exclui', 'recusa', 'lança erro /não autorizada/')])).includes('oraculo-de-estado'));
  assert.ok(falhou(5, base(5, [], { redundanciasCandidatas: [['NORDESTE', 'SUL']] })).includes('nao-elimina-cobertura-necessaria'));
  // critério v2 (docs/ERRATA-CRITERIOS.md): só o cenário contraditório (não premium, acima de 500) não pode ter resultado definitivo
  const comum = (esperado) => base(8, [c('a', 'frete de pedido de 600 de cliente não premium', esperado, esperado)], { bloqueios: ['banco'], incertezas: ['contradição'] });
  assert.ok(falhou(8, comum('frete grátis')).includes('nao-escolhe-regra'), 'escolher a regra para o cenário contraditório reprova');
  assert.ok(!falhou(8, comum('indefinido até esclarecer o conflito')).includes('nao-escolhe-regra'));
  assert.ok(!falhou(8, base(8, [c('a', 'frete de pedido de 600 de cliente premium', 'frete zero: as duas regras concordam', 'frete = 0')], { bloqueios: ['banco'], incertezas: ['contradição'] })).includes('nao-escolhe-regra'), 'cenário determinado pelas duas regras é livre');
  assert.ok(falhou(8, { ...boas[8], bloqueios: [] }).includes('registra-bloqueio-de-ambiente'));
});

test('extrairJson usa o último bloco json válido e devolve null sem JSON', () => {
  assert.deepEqual(extrairJson('texto\n```json\n{"a":1}\n```\ndepois\n```json\n{"b":2}\n```'), { b: 2 });
  assert.deepEqual(extrairJson('```json\n{"a":1}\n```\n```json\nquebrado\n```'), { a: 1 });
  assert.equal(extrairJson('sem json aqui'), null);
});

test('isolamento: nenhum prompt carrega o gabarito; o braço A não menciona Prumo; o B não embute os arquivos do projeto', () => {
  const proibidos = /obrigatorios|esperado\.json|cenarios\/caso|mutante|intencional|MISSING_|POTENTIAL_REDUNDANCY|lacuna proposital/i;
  for (let n = 1; n <= 8; n++) {
    const a = promptA(n), b = promptB(n);
    assert.doesNotMatch(a, proibidos, `prompt A caso ${n}`); assert.doesNotMatch(b.replace(/MISSING_|POTENTIAL_REDUNDANCY/g, ''), proibidos, `prompt B caso ${n}`);
    assert.doesNotMatch(a, /Prumo QA|\bMCP\b|contexto_projeto|revisar_cobertura|SKILL/, 'o braço A não vê o Prumo nem a Skill (PRUMO10 é só o código de cupom fictício)');
    assert.ok(a.includes(`RQ-0${n}`) && a.includes('aplicacao/src/frete.mjs') && a.includes('aplicacao/testes/superficial.test.mjs'));
    assert.match(b, /contexto_projeto/); assert.doesNotMatch(b, /=== aplicacao\/src/, 'o B recebe os arquivos pelo MCP, não colados');
  }
});

test('comparação: sem cliente de IA tudo é NAO_EXECUTADA e nenhuma conclusão é emitida', () => {
  const r = spawnSync(process.execPath, ['avaliacoes/comparacao.mjs', '--casos', '1,2', '--codex', path.resolve('nao-existe', 'codex.exe'), '--sem-gravar'], { encoding: 'utf8' });
  assert.equal((r.stdout.match(/NAO_EXECUTADA caso/g) ?? []).length, 4);
  const resumo = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(resumo.comparavel, false); assert.match(resumo.observacao, /INSUFICIENTE/);
  for (const b of ['A', 'B']) { assert.equal(resumo.porBraco[b].executadas, 0); assert.equal(resumo.porBraco[b].taxa, null, 'sem execução não há taxa (nem 0% nem 100%)'); }
});

test('resumo da comparação: só conta execuções reais e exige o Prumo realmente usado no braço B', () => {
  const ok = (b, uso) => ({ braco: b, estado: 'ATENDEU', prumoUtilizado: uso, criterios: [{ ok: true }, { ok: false }] });
  const completo = resumir([ok('A'), ok('B', true)]); assert.equal(completo.comparavel, true); assert.equal(completo.porBraco.A.taxa, 50);
  assert.match(completo.observacao, /não é prova de superioridade/);
  assert.equal(resumir([ok('A'), ok('B', false)]).comparavel, false, 'Prumo não usado invalida a comparação');
  const parcial = resumir([ok('A'), { braco: 'B', estado: 'NAO_EXECUTADA', motivo: 'limite' }]);
  assert.equal(parcial.comparavel, false); assert.equal(parcial.porBraco.B.taxa, null); assert.equal(parcial.porBraco.B.naoExecutadas, 1);
});

test('métricas dos resultados reais: não executado vira n/a, nada de tokens ou custo, e fórmulas coerentes', () => {
  const m = calcular();
  assert.ok(m.deterministica.length >= 3);
  for (const d of m.deterministica) { assert.equal(d.criteriosNaoAvaliados, 0); assert.equal(d.criteriosAtendidos + d.criteriosNaoAtendidos > 0, true); assert.equal(typeof d.taxaCriterios, 'number'); }
  if (m.semantica?.executados === 0) { assert.equal(m.semantica.taxaAtendeuSobreExecutados, 'n/a'); assert.equal(m.semantica.atendeu, 0); }
  assert.deepEqual(m.naoCalculado, ['tokens', 'custo', 'cobertura funcional', 'bugs corrigidos']);
  assert.ok(!/"tokens"\s*:\s*\d|"custo"\s*:\s*\d/.test(JSON.stringify(m)));
  assert.equal(m.mutantes.identificadosAutonomamentePeloPrumo, 0, 'o Prumo não identificou o defeito sozinho em nenhum mutante');
  assert.equal(m.mutantes.sobreviventesDetectadosPorTesteNovo, m.mutantes.sobreviventesDaSuiteOriginal, 'os testes novos detectam todos os sobreviventes');
});

test('detecção dos mutantes: teste novo passa na aplicação correta e falha no mutante; suíte original preservada', () => {
  const sobreviventes = mutantes.filter((m) => m.esperado === 'sobrevive');
  assert.equal(sobreviventes.length, 4);
  for (const m of sobreviventes) { const r = avaliarMutante(m); assert.equal(r.existentesDetectam, false, m.id); assert.equal(r.novosPassamNoOriginal, true, m.id); assert.equal(r.novosDetectamMutante, true, m.id); assert.equal(r.diferenciaOsComportamentos, true, m.id); assert.equal(r.prumo.identificouODefeito === true, false, `${m.id}: detecção por teste novo não é identificação pelo Prumo`); }
  for (const m of mutantes.filter((x) => x.esperado === 'morto')) assert.equal(avaliarMutante(m).existentesDetectam, true, m.id);
  const originais = fs.readdirSync('aplicacao/testes').filter((n) => n.endsWith('.test.mjs')).sort();
  assert.deepEqual(originais, ['acesso.test.mjs', 'elegibilidade.test.mjs', 'frete.test.mjs', 'pedidos.test.mjs', 'superficial.test.mjs'], 'a suíte original não foi alterada nem ampliada');
});

test('os testes de detecção ficam fora do contexto autorizado (não viram gabarito para a IA)', () => {
  const m = JSON.parse(fs.readFileSync('qa.project.json', 'utf8'));
  for (const d of [...m.context.documentation, ...m.context.tests, ...m.context.code]) assert.ok(!d.includes('deteccao') && !d.includes('avaliacoes'), d);
});
