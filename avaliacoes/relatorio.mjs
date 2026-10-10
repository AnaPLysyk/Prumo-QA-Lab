// Gera docs/RELATORIO-ENGENHARIA.md a partir dos resultados REAIS em avaliacoes/resultados/ e da narrativa fixa por caso abaixo.
// Os números e achados vêm dos arquivos de resultado; a narrativa descreve o que cada caso foi preparado para provar.
// Uso: node avaliacoes/relatorio.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcular } from './metricas.mjs';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(lab, 'avaliacoes', 'resultados');
const ler = (n) => JSON.parse(fs.readFileSync(path.join(pasta, n), 'utf8'));
const arquivos = fs.readdirSync(pasta).sort();
const det = arquivos.filter((n) => /-prumo-.*-[0-9a-f]{7}.*-deterministico\.json$/.test(n)).map((n) => ({ n, r: ler(n) }));
const porCommit = (c) => det.find((d) => d.r.prumo.commit?.startsWith(c));
const v22 = det.find((d) => d.r.prumo.versao === '2.2.0'), v230 = det.find((d) => d.r.prumo.versao === '2.3.0' && !d.r.prumo.commit.endsWith('dirty') && d.r.prumo.commit.startsWith('5c26ff1')), principal = det.filter((d) => d.r.prumo.versao === '2.3.0' && !d.r.prumo.commit.startsWith('5c26ff1')).at(-1);
const mut = ler(arquivos.filter((n) => n.endsWith('-deteccao.json')).at(-1));
const sem = ler(arquivos.filter((n) => n.endsWith('-semantica.json')).at(-1));
const cmpArq = arquivos.filter((n) => /-comparacao-/.test(n)).at(-1); const cmp = cmpArq ? ler(cmpArq) : null;
const m = calcular();
const req = (n) => fs.readFileSync(path.join(lab, 'requisitos', `RQ-0${n}.md`), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).join(' ');

const narrativa = {
  1: { titulo: 'Valores-limite', problema: 'Intervalo 18–65 com um único teste usando 30; nenhum limite exercitado. Mutante: `idade >= 18` → `idade > 18`.', anteriores: 'Só `elegivel(30) === true`.', faltava: 'Os quatro valores de fronteira (17, 18, 65, 66).', mutante: 'elegibilidade-limite-inferior', necessaria: 'Sim. Cada fronteira detecta um tipo diferente de erro de limite; o mutante só é pego com o 18. Mantê-las não é redundância: 17 e 18 estão em partições diferentes.' },
  2: { titulo: 'Classes de equivalência', problema: 'SUL e SUDESTE pertencem à mesma faixa de frete; testar as cinco regiões separadamente repete verificação.', anteriores: 'Testes de SUL, SUDESTE e NORDESTE e de região desconhecida.', faltava: 'Nada essencial: faltava só selecionar um representante por faixa (e CENTRO_OESTE, que não tem teste).', mutante: null, necessaria: 'Sim para marcar SUDESTE como redundância candidata; a decisão final de que são equivalentes é semântica (fica com a IA).' },
  3: { titulo: 'Permissões', problema: 'Tabela de decisão por perfil e status; GERENTE (aberto e fechado) e OPERADOR sem teste. Mutante: GERENTE exclui qualquer pedido.', anteriores: 'ADMIN pode excluir e visitante não pode.', faltava: 'GERENTE em pedido aberto e fechado, e OPERADOR (cenários negativos).', mutante: 'acesso-gerente-fechado', necessaria: 'Sim. O cenário GERENTE × FECHADO é o único que diferencia o comportamento correto do mutante.' },
  4: { titulo: 'Persistência após operação recusada', problema: 'A recusa não pode alterar dados, mas o teste só confere que lança erro. Mutante: a recusa muda o status do pedido antes de lançar.', anteriores: 'Operador não consegue excluir (apenas `assert.throws`).', faltava: 'Oráculo de ESTADO: o pedido continua existente e inalterado depois da recusa.', mutante: 'pedidos-recusa-altera-dado', necessaria: 'Sim. Sem verificar o estado, o defeito passa despercebido (comprovado pelo mutante sobrevivente).' },
  5: { titulo: 'Redundância', problema: 'Candidato repete um teste existente (SUL); outro difere só por condição; um terceiro é de outra faixa.', anteriores: 'Teste de SUL com a mesma assinatura do candidato c1.', faltava: 'Nada: o desafio é reconhecer a duplicação sem eliminar o cenário que difere por condição.', mutante: null, necessaria: 'Sim para sinalizar c1; não eliminar c2 e c3 é o comportamento correto.' },
  6: { titulo: 'Falta de oráculo', problema: 'Cenário de cupom sem resultado esperado nem oráculo.', anteriores: 'Nenhum teste existente informado.', faltava: 'Resultado esperado e oráculo do cenário c2 (outro código não altera o total).', mutante: null, necessaria: 'Sim. Um cenário sem oráculo não é verificável.' },
  7: { titulo: 'Falso positivo', problema: 'Um teste ignorado (`test.skip`) e outro que só confere o tipo do retorno; ambos "passam" sem validar o desconto. Mutante: 10% → 5%.', anteriores: 'Teste ignorado do desconto e teste de tipo `number`.', faltava: 'Comparar o total final com o valor esperado (200 → 180).', mutante: 'cupom-desconto-errado', necessaria: 'Sim. O PASS da suíte é falso positivo: o mutante sobrevive.' },
  8: { titulo: 'Requisito contraditório e ambiente bloqueado', problema: 'Duas regras incompatíveis de frete grátis; integração depende de um banco de testes inexistente.', anteriores: 'Nenhum.', faltava: 'Esclarecer o requisito; registrar o bloqueio da integração.', mutante: null, necessaria: 'Sim: não existe teste correto a escrever enquanto o conflito persistir; a capacidade `integracao` fica BLOCKED por contrato.' }
};
const secaoCaso = (n) => {
  const x = narrativa[n]; const r = principal.r.casos[n - 1]; const rv = v230.r.casos[n - 1]; const r22 = v22.r.casos[n - 1];
  const achados = r.achados.length ? r.achados.map((a) => `${a.type}${a.scenario ? ' (' + a.scenario + ', ' + a.severity + ')' : ''}`).join('; ') : 'nenhum';
  const mm = x.mutante ? mut.resultados.find((q) => q.id === x.mutante) : null;
  return `### Caso ${n} — ${x.titulo}

- **Requisito (RQ-0${n}):** ${req(n)}
- **Problema preparado:** ${x.problema}
- **O que os testes anteriores verificavam:** ${x.anteriores}
- **Cobertura que faltava:** ${x.faltava}
- **O que o Prumo identificou (núcleo, commit ${principal.r.prumo.commit}):** ${achados}. Critérios: ${r.ok}/${r.total} (${r.aprovado ? 'aprovado' : 'reprovado'}). 2.2.0: ${r22.ok}/${r22.total}; release 2.3.0: ${rv.ok}/${rv.total}.
- **Recomendação:** ${r.achados.length ? 'conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito)' : 'sem achado'}; seleção sugerida: ${r.seleçãoSugerida.join(', ') || '(vazia)'}.
- **Era realmente necessária?** ${x.necessaria}
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (\`npm test\`) e os mutantes também.${mm ? `
- **Defeito (mutante \`${mm.id}\`):** suíte original ${mm.existentesDetectam ? 'detecta' : '**não detecta**'}; teste novo ${mm.diferenciaOsComportamentos ? '**diferencia** correto e mutante' : 'n/a'}; o Prumo **${mm.prumo.identificouODefeito === true ? 'identificou' : mm.prumo.identificouODefeito === 'parcial' ? 'identificou parcialmente' : 'não identificou'}** o defeito sozinho — ${mm.prumo.apontou}.` : ''}
- **Evidência:** \`avaliacoes/resultados/${principal.n}\`${mm ? `, \`avaliacoes/resultados/${arquivos.filter((a) => a.endsWith('-deteccao.json')).at(-1)}\`` : ''}.
`;
};
const f = (v) => (v === null || v === undefined ? 'n/a' : v);
const linhaDet = (d) => `| ${d.prumo} | ${d.casosAprovados} | ${d.criteriosAtendidos} | ${d.criteriosNaoAtendidos} | ${d.criteriosNaoAvaliados} | ${d.taxaCriterios}% | ${d.falsosPositivos} | ${d.cenariosNecessariosOmitidos} |`;
const dets = m.deterministica.filter((d) => /@/.test(d.prumo));
let rel = `# Relatório de engenharia — validação final do Prumo QA 2.3

> Gerado por \`node avaliacoes/relatorio.mjs\` a partir dos resultados reais em \`avaliacoes/resultados/\`. Fórmulas em [METRICAS.md](METRICAS.md). Nada aqui foi estimado.

## Resumo

- **Núcleo determinístico (MCP real):** ${dets.map((d) => `${d.prumo}: ${d.casosAprovados} casos, ${d.taxaCriterios}%`).join(' · ')}.
- **Defeitos do laboratório (mutantes):** ${mut.resumo.sobreviventesDaSuiteOriginal} lacunas confirmadas (a suíte original não detecta), todas detectadas por teste novo (${mut.resumo.sobreviventesDetectadosPorTesteNovo}/${mut.resumo.sobreviventesDaSuiteOriginal}); **o Prumo não identificou nenhum dos defeitos sozinho** (${mut.resumo.identificadosAutonomamentePeloPrumo}/${mut.resumo.sobreviventesDaSuiteOriginal}; ${m.mutantes.identificadosParcialmentePeloPrumo} parcial).
- **Avaliação semântica com IA:** ${sem.resumo.naoExecutada === sem.casos.length ? `NAO_EXECUTADA em ${sem.casos.length}/${sem.casos.length} casos — motivo informado pelo cliente: "${sem.casos[0].motivo.replace(/\.$/, '')}"` : `${sem.resumo.atendeu} atendeu / ${sem.resumo.naoAtendeu} não atendeu / ${sem.resumo.naoExecutada} não executada`}.
- **Comparação com e sem Prumo:** ${cmp ? cmp.resumo.observacao : 'não executada (nenhum resultado gravado).'}

## O que o Prumo faz e não faz (conclusão desta validação)

O Prumo acerta, de forma reproduzível, o que é **estrutural**: lacunas de oráculo, limite sem valor, condições ausentes, redundância candidata por assinatura, teste ignorado, contradição informada, bloqueio e a recusa de qualquer PASS sem execução. Ele **não** enxerga, sozinho, que um teste existente é superficial ou não exercita um limite: nos quatro defeitos plantados, quem os pegou foi um teste novo, não o Prumo. Esse julgamento depende da IA hospedeira (e da Skill); sem avaliação com IA não é possível afirmar quanto o Prumo a ajuda.

## Métricas objetivas

| Prumo (versão@commit) | Casos aprovados | Critérios atendidos | Não atendidos | Não avaliados | Taxa | Falsos positivos | Cenários necessários omitidos |
|---|---|---|---|---|---|---|---|
${dets.map(linhaDet).join('\n')}

Mutantes: ${mut.resumo.mutantes} no total; suíte original detecta ${mut.resumo.detectadosPelaSuiteOriginal} (controles); sobrevivem ${mut.resumo.sobreviventesDaSuiteOriginal}; teste novo detecta ${mut.resumo.sobreviventesDetectadosPorTesteNovo}/${mut.resumo.sobreviventesDaSuiteOriginal}; identificação autônoma pelo Prumo ${mut.resumo.identificadosAutonomamentePeloPrumo}/${mut.resumo.sobreviventesDaSuiteOriginal}.

Avaliação com IA: ${sem.resumo.naoExecutada === sem.casos.length ? 'taxa **n/a** (nenhuma execução); não é 0% nem 100%.' : `${m.semantica.taxaAtendeuSobreExecutados}% dos casos executados.`}${cmp ? `\n\nComparação (${cmp.cliente.nome}, modelo: ${cmp.cliente.modelo}, repetições: ${cmp.repeticoes}, rubrica ${cmp.rubricaSha256.slice(0, 12)}…):\n\n| Braço | Execuções | Executadas | Não executadas | Critérios atendidos/avaliados | Taxa | Cenários (média) | Tempo médio (ms) |\n|---|---|---|---|---|---|---|---|\n| A sem Prumo | ${m.comparacao.A_semPrumo.execucoes} | ${m.comparacao.A_semPrumo.executadas} | ${m.comparacao.A_semPrumo.naoExecutadas} | ${m.comparacao.A_semPrumo.criteriosAtendidos}/${m.comparacao.A_semPrumo.criteriosAvaliados} | ${f(m.comparacao.A_semPrumo.taxa)}% | ${m.comparacao.A_semPrumo.cenariosPropostos} | ${m.comparacao.A_semPrumo.duracaoMediaMs} |\n| B com Prumo | ${m.comparacao.B_comPrumo.execucoes} | ${m.comparacao.B_comPrumo.executadas} | ${m.comparacao.B_comPrumo.naoExecutadas} | ${m.comparacao.B_comPrumo.criteriosAtendidos}/${m.comparacao.B_comPrumo.criteriosAvaliados} | ${f(m.comparacao.B_comPrumo.taxa)}% | ${m.comparacao.B_comPrumo.cenariosPropostos} | ${m.comparacao.B_comPrumo.duracaoMediaMs} |` : ''}

Não calculados por falta de dado verificável: tokens, custo, cobertura funcional, bugs corrigidos.

## Versões 2.2.0 → release 2.3.0 → principal (correção pós-2.3.0)

${v22 && v230 && principal ? `| Versão | Critérios | Casos aprovados |\n|---|---|---|\n| 2.2.0 @${v22.r.prumo.commit} | ${v22.r.resumo.verificacoesOk}/${v22.r.resumo.verificacoes} | ${v22.r.resumo.casosAprovados}/8 |\n| 2.3.0 (release) @${v230.r.prumo.commit} | ${v230.r.resumo.verificacoesOk}/${v230.r.resumo.verificacoes} | ${v230.r.resumo.casosAprovados}/8 |\n| 2.3.0 + correção @${principal.r.prumo.commit} | ${principal.r.resumo.verificacoesOk}/${principal.r.resumo.verificacoes} | ${principal.r.resumo.casosAprovados}/8 |\n\nA única diferença é no caso 7: a 2.2.0 e a release 2.3.0 marcam o teste válido T2 com a mesma severidade do teste ignorado T1 (atribuição por arquivo); a correção distingue as duas. Atenção: o critério de severidade foi **acrescentado depois** de o defeito ser identificado nesta validação; as versões anteriores o reprovam por construção, e os critérios originais permanecem inalterados.` : 'Resultados insuficientes.'}

## Resultados por cenário

${[1, 2, 3, 4, 5, 6, 7, 8].map(secaoCaso).join('\n')}
## Honestidade sobre o que não foi provado

- O laboratório tem 8 situações sintéticas: não prova que o Prumo encontra bugs em projetos reais.
- Sem avaliação com IA concluída não há conclusão sobre "o Prumo melhora as decisões de uma IA".
- O leitor do JSONL do cliente e a rubrica foram validados com fixtures sintéticas rotuladas (testes do laboratório), não com respostas de IA.
`;
fs.mkdirSync(path.join(lab, 'docs'), { recursive: true });
fs.writeFileSync(path.join(lab, 'docs', 'RELATORIO-ENGENHARIA.md'), rel);
console.log('docs/RELATORIO-ENGENHARIA.md gerado.');
