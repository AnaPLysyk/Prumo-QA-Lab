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
const rotulo = (r) => `${r.prumo.versao}@${r.prumo.commit}`;
const builds = arquivos.filter((n) => /-prumo-.*-[0-9a-f]{7}.*-deterministico\.json$/.test(n)).map((n) => ({ n, r: ler(n) }))
  .filter((b) => !String(b.r.prumo.commit).endsWith('dirty')).sort((a, b) => a.r.geradoEm.localeCompare(b.r.geradoEm));
const ordemVersao = (v) => v.split('.').map(Number).reduce((s, x) => s * 1000 + x, 0);
builds.sort((a, b) => ordemVersao(a.r.prumo.versao) - ordemVersao(b.r.prumo.versao) || a.r.geradoEm.localeCompare(b.r.geradoEm));
const principal = builds.at(-1);
const mut = ler(arquivos.filter((n) => n.endsWith('-deteccao.json')).at(-1));
const sem = ler(arquivos.filter((n) => n.endsWith('-semantica.json')).at(-1));
const cmpArq = arquivos.filter((n) => /-comparacao-/.test(n)).at(-1); const cmp = cmpArq ? ler(cmpArq) : null;
const m = calcular();
const req = (n) => { const f = path.join(lab, 'requisitos', `RQ-0${n}.md`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).join(' ') : null; };
const esperadoDe = (n) => JSON.parse(fs.readFileSync(path.join(lab, 'cenarios', `caso-${n}`, 'esperado.json'), 'utf8'));
const planoDe = (n) => JSON.parse(fs.readFileSync(path.join(lab, 'cenarios', `caso-${n}`, 'plano.json'), 'utf8'));

const narrativa = {
  1: { titulo: 'Valores-limite', problema: 'Intervalo 18–65 com um único teste usando 30; nenhum limite exercitado. Mutante: `idade >= 18` → `idade > 18`.', anteriores: 'Só `elegivel(30) === true`.', faltava: 'Os quatro valores de fronteira (17, 18, 65, 66).', mutante: 'elegibilidade-limite-inferior', necessaria: 'Sim. Cada fronteira detecta um tipo diferente de erro de limite; o mutante só é pego com o 18. Mantê-las não é redundância: 17 e 18 estão em partições diferentes.' },
  2: { titulo: 'Classes de equivalência', problema: 'SUL e SUDESTE pertencem à mesma faixa de frete; testar as cinco regiões separadamente repete verificação.', anteriores: 'Testes de SUL, SUDESTE e NORDESTE e de região desconhecida.', faltava: 'Nada essencial: faltava só selecionar um representante por faixa (e CENTRO_OESTE, que não tem teste).', mutante: null, necessaria: 'Sim para marcar SUDESTE como redundância candidata; a decisão final de que são equivalentes é semântica (fica com a IA).' },
  3: { titulo: 'Permissões', problema: 'Tabela de decisão por perfil e status; GERENTE (aberto e fechado) e OPERADOR sem teste. Mutante: GERENTE exclui qualquer pedido.', anteriores: 'ADMIN pode excluir e visitante não pode.', faltava: 'GERENTE em pedido aberto e fechado, e OPERADOR (cenários negativos).', mutante: 'acesso-gerente-fechado', necessaria: 'Sim. O cenário GERENTE × FECHADO é o único que diferencia o comportamento correto do mutante.' },
  4: { titulo: 'Persistência após operação recusada', problema: 'A recusa não pode alterar dados, mas o teste só confere que lança erro. Mutante: a recusa muda o status do pedido antes de lançar.', anteriores: 'Operador não consegue excluir (apenas `assert.throws`).', faltava: 'Oráculo de ESTADO: o pedido continua existente e inalterado depois da recusa.', mutante: 'pedidos-recusa-altera-dado', necessaria: 'Sim. Sem verificar o estado, o defeito passa despercebido (comprovado pelo mutante sobrevivente).' },
  5: { titulo: 'Redundância', problema: 'Candidato repete um teste existente (SUL); outro difere só por condição; um terceiro é de outra faixa.', anteriores: 'Teste de SUL com a mesma assinatura do candidato c1.', faltava: 'Nada: o desafio é reconhecer a duplicação sem eliminar o cenário que difere por condição.', mutante: null, necessaria: 'Sim para sinalizar c1; não eliminar c2 e c3 é o comportamento correto.' },
  6: { titulo: 'Falta de oráculo', problema: 'Cenário de cupom sem resultado esperado nem oráculo.', anteriores: 'Nenhum teste existente informado.', faltava: 'Resultado esperado e oráculo do cenário c2 (outro código não altera o total).', mutante: null, necessaria: 'Sim. Um cenário sem oráculo não é verificável.' },
  7: { titulo: 'Falso positivo', problema: 'Um teste ignorado (`test.skip`) e outro que só confere o tipo do retorno; ambos "passam" sem validar o desconto. Mutante: 10% → 5%.', anteriores: 'Teste ignorado do desconto e teste de tipo `number`.', faltava: 'Comparar o total final com o valor esperado (200 → 180).', mutante: 'cupom-desconto-errado', necessaria: 'Sim. O PASS da suíte é falso positivo: o mutante sobrevive.' },
  8: { titulo: 'Requisito contraditório e ambiente bloqueado', problema: 'Duas regras incompatíveis de frete grátis; integração depende de um banco de testes inexistente.', anteriores: 'Nenhum.', faltava: 'Esclarecer o requisito; registrar o bloqueio da integração.', mutante: null, necessaria: 'Sim: não existe teste correto a escrever enquanto o conflito persistir; a capacidade `integracao` fica BLOCKED por contrato.' },
  9: { titulo: 'Contexto aprovado', problema: 'Um requisito cadastrado e APROVADO por uma pessoa precisa ser usado na revisão com origem, versão e hash, sem alarmes indevidos.', anteriores: 'Não se aplica (sem teste existente).', faltava: 'Nada: o desafio é usar o requisito aprovado e rastreável sem produzir achados de contexto.', mutante: null, necessaria: 'Não há recomendação a fazer: o comportamento correto é a ausência de achados `CONTEXT_*`.' },
  10: { titulo: 'Contextos contraditórios', problema: 'Dois contextos da mesma chave com regras incompatíveis (um aprovado, outro rascunho).', anteriores: 'Não se aplica.', faltava: 'Esclarecimento humano do conflito; nenhum teste pode ser escrito com segurança antes.', mutante: null, necessaria: 'Sim: o Prumo deve apontar o conflito (alta severidade) sem escolher um lado, e marcar ambos como CONFLITANTE.' },
  11: { titulo: 'Contexto desatualizado', problema: 'O contexto referenciado foi aprovado mas depois marcado como desatualizado.', anteriores: 'Não se aplica.', faltava: 'Usar a versão que o substituiu.', mutante: null, necessaria: 'Sim: testar contra regra que não vale mais produz testes errados.' },
  12: { titulo: 'Origem documental ausente', problema: 'Contexto sem origem verificável: não pode ser aprovado e não prova de onde veio a regra.', anteriores: 'Não se aplica.', faltava: 'Informar a origem e só então obter aprovação humana.', mutante: null, necessaria: 'Sim: o Prumo registra a lacuna (e o estado de rascunho) em vez de a preencher.' },
  13: { titulo: 'Isolamento entre projetos', problema: 'Um contexto aprovado existe em OUTRO projeto no mesmo armazenamento local.', anteriores: 'Não se aplica.', faltava: 'Nada: o contexto alheio não pode ser visto nem lido por id.', mutante: null, necessaria: 'O correto é `CONTEXT_UNAVAILABLE` e nenhuma referência vazada em `contexto_projeto`.' },
  14: { titulo: 'Testes Playwright com antipadrões', problema: 'Arquivo de testes Playwright (estático) com espera fixa, seletor frágil, teste sem assertion, ignorado, duplicado, assertion fraca e teste de API só com status — além de testes bons que não podem ser acusados.', anteriores: 'Os próprios testes do arquivo.', faltava: 'Não decidível pelo texto: validação de persistência e cobertura negativa de permissões (julgamento da IA com o requisito aprovado).', mutante: null, necessaria: 'Sim para cada antipadrão apontado (com linha e fonte oficial); os testes bons (locators por papel/rótulo, assertions que repetem) não devem ser acusados.' }
};
const resumoCaso = (b, n) => { const c = b.r.casos.find((x) => x.caso === n); return !c ? 'n/d' : c.estado === 'NAO_APLICAVEL' ? 'N/A' : `${c.ok}/${c.total}`; };
const secaoCaso = (n) => {
  const x = narrativa[n]; const r = principal.r.casos.find((c) => c.caso === n); const e = esperadoDe(n);
  const achados = r.achados.length ? r.achados.map((a) => `${a.type}${a.scenario ? ' (' + a.scenario + ', ' + a.severity + ')' : ''}`).join('; ') : 'nenhum';
  const mm = x.mutante ? mut.resultados.find((q) => q.id === x.mutante) : null; const doc = req(n);
  return `### Caso ${n} — ${x.titulo}

- **Requisito:** ${doc ?? (planoDe(n).requirement + ' (cadastrado como contexto no armazenamento isolado da avaliação)')}
- **Problema preparado:** ${x.problema}
- **O que os testes anteriores verificavam:** ${x.anteriores}
- **Cobertura que faltava:** ${x.faltava}
- **O que o Prumo identificou (${rotulo(principal.r)}):** ${achados}. Critérios: ${r.ok}/${r.total} (${r.aprovado ? 'aprovado' : 'reprovado'}). Por versão: ${builds.map((b) => `${rotulo(b.r)} ${resumoCaso(b, n)}`).join(' · ')}.
- **Recomendação:** ${r.achados.length ? 'conforme os achados acima' : 'nenhuma: ausência de achados é o resultado correto'}; seleção sugerida: ${r.seleçãoSugerida.join(', ') || '(vazia)'}.
- **Era realmente necessária?** ${x.necessaria}
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. ${n <= 8 ? 'Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.' : n === 14 ? 'Os testes Playwright do laboratório são **fixtures estáticas**: nunca foram executados (o Playwright não é instalado aqui).' : 'Os contextos foram semeados no armazenamento isolado e lidos pelo MCP real; nada foi executado.'}${mm ? `
- **Defeito (mutante \`${mm.id}\`):** suíte original ${mm.existentesDetectam ? 'detecta' : '**não detecta**'}; teste novo ${mm.diferenciaOsComportamentos ? '**diferencia** correto e mutante' : 'n/a'}; o Prumo **${mm.prumo.identificouODefeito === true ? 'identificou' : mm.prumo.identificouODefeito === 'parcial' ? 'identificou parcialmente' : 'não identificou'}** o defeito sozinho — ${mm.prumo.apontou}.` : ''}
- **Limites conhecidos:** ${e.limitesConhecidos.join(' ')}
- **Evidência:** \`avaliacoes/resultados/${principal.n}\`${mm ? `, \`avaliacoes/resultados/${arquivos.filter((a) => a.endsWith('-deteccao.json')).at(-1)}\`` : ''}.
`;
};
const f = (v) => (v === null || v === undefined ? 'n/a' : v);
const linhaDet = (d) => `| ${d.prumo} | ${d.casosAprovados} | ${d.criteriosAtendidos} | ${d.criteriosNaoAtendidos} | ${d.criteriosNaoAvaliados} | ${d.taxaCriterios}% | ${d.falsosPositivos} | ${d.cenariosNecessariosOmitidos} |`;
const dets = m.deterministica.filter((d) => /@/.test(d.prumo) && !/dirty/.test(d.prumo));
const casosTodos = principal.r.casos.map((c) => c.caso);
let rel = `# Relatório de engenharia — validação do Prumo QA

> Gerado por \`node avaliacoes/relatorio.mjs\` a partir dos resultados reais em \`avaliacoes/resultados/\`. Fórmulas em [METRICAS.md](METRICAS.md). Nada aqui foi estimado.

## Resumo

- **Núcleo determinístico (MCP real):** ${dets.map((d) => `${d.prumo}: ${d.casosAprovados} casos, ${d.taxaCriterios}%`).join(' · ')}. "N/A" = o recurso não existia nessa versão (não conta como aprovado nem como falha).
- **Defeitos do laboratório (mutantes):** ${mut.resumo.sobreviventesDaSuiteOriginal} lacunas confirmadas (a suíte original não detecta), todas detectadas por teste novo (${mut.resumo.sobreviventesDetectadosPorTesteNovo}/${mut.resumo.sobreviventesDaSuiteOriginal}); **o Prumo não identificou nenhum dos defeitos sozinho** (${mut.resumo.identificadosAutonomamentePeloPrumo}/${mut.resumo.sobreviventesDaSuiteOriginal}; ${m.mutantes.identificadosParcialmentePeloPrumo} parcial).
- **Avaliação semântica com IA:** ${sem.resumo.naoExecutada === sem.casos.length ? `NAO_EXECUTADA em ${sem.casos.length}/${sem.casos.length} casos — motivo informado pelo cliente: "${sem.casos[0].motivo.replace(/\.$/, '')}"` : `${sem.resumo.atendeu} atendeu / ${sem.resumo.naoAtendeu} não atendeu / ${sem.resumo.naoExecutada} não executada`}.
- **Comparação com e sem Prumo:** ${cmp ? cmp.resumo.observacao : 'não executada (nenhum resultado gravado).'}

## O que o Prumo faz e não faz (conclusão desta validação)

O Prumo acerta, de forma reproduzível, o que é **estrutural**: lacunas de oráculo, limite sem valor, condições ausentes, redundância candidata por assinatura, teste ignorado, contradição informada, bloqueio e a recusa de qualquer PASS sem execução; a partir da 2.4, também o estado de confiança dos contextos (rascunho, aprovado, desatualizado, conflitante, sem origem), o isolamento entre projetos e antipadrões de testes Playwright com fonte oficial. Ele **não** enxerga, sozinho, que um teste existente é superficial ou não exercita um limite: nos quatro defeitos plantados, quem os pegou foi um teste novo, não o Prumo. Esse julgamento depende da IA hospedeira (e da Skill); sem avaliação com IA não é possível afirmar quanto o Prumo a ajuda.

## Métricas objetivas

| Prumo (versão@commit) | Casos aprovados | Critérios atendidos | Não atendidos | Não avaliados | Taxa | Falsos positivos | Cenários necessários omitidos |
|---|---|---|---|---|---|---|---|
${dets.map(linhaDet).join('\n')}

Mutantes: ${mut.resumo.mutantes} no total; suíte original detecta ${mut.resumo.detectadosPelaSuiteOriginal} (controles); sobrevivem ${mut.resumo.sobreviventesDaSuiteOriginal}; teste novo detecta ${mut.resumo.sobreviventesDetectadosPorTesteNovo}/${mut.resumo.sobreviventesDaSuiteOriginal}; identificação autônoma pelo Prumo ${mut.resumo.identificadosAutonomamentePeloPrumo}/${mut.resumo.sobreviventesDaSuiteOriginal}.

Avaliação com IA: ${sem.resumo.naoExecutada === sem.casos.length ? 'taxa **n/a** (nenhuma execução); não é 0% nem 100%.' : `${m.semantica.taxaAtendeuSobreExecutados}% dos casos executados.`}${cmp ? `\n\nComparação (${cmp.cliente.nome}, modelo: ${cmp.cliente.modelo}, repetições: ${cmp.repeticoes}, rubrica ${cmp.rubricaSha256.slice(0, 12)}…):\n\n| Braço | Execuções | Executadas | Não executadas | Critérios atendidos/avaliados | Taxa | Cenários (média) | Tempo médio (ms) |\n|---|---|---|---|---|---|---|---|\n| A sem Prumo | ${m.comparacao.A_semPrumo.execucoes} | ${m.comparacao.A_semPrumo.executadas} | ${m.comparacao.A_semPrumo.naoExecutadas} | ${m.comparacao.A_semPrumo.criteriosAtendidos}/${m.comparacao.A_semPrumo.criteriosAvaliados} | ${f(m.comparacao.A_semPrumo.taxa)}% | ${m.comparacao.A_semPrumo.cenariosPropostos} | ${m.comparacao.A_semPrumo.duracaoMediaMs} |\n| B com Prumo | ${m.comparacao.B_comPrumo.execucoes} | ${m.comparacao.B_comPrumo.executadas} | ${m.comparacao.B_comPrumo.naoExecutadas} | ${m.comparacao.B_comPrumo.criteriosAtendidos}/${m.comparacao.B_comPrumo.criteriosAvaliados} | ${f(m.comparacao.B_comPrumo.taxa)}% | ${m.comparacao.B_comPrumo.cenariosPropostos} | ${m.comparacao.B_comPrumo.duracaoMediaMs} |` : ''}

Não calculados por falta de dado verificável: tokens, custo, cobertura funcional, bugs corrigidos.

## Evolução entre versões do Prumo

| Versão @ commit | Critérios | Casos aprovados (aplicáveis) | Casos N/A |
|---|---|---|---|
${builds.map((b) => `| ${rotulo(b.r)} | ${b.r.resumo.verificacoesOk}/${b.r.resumo.verificacoes} | ${b.r.resumo.casosAprovados}/${b.r.resumo.casos} | ${b.r.resumo.naoAplicaveis ?? 0} |`).join('\n')}

Diferenças relevantes: (1) caso 7 — a 2.2.0 e a release 2.3.0 marcam o teste válido T2 com a mesma severidade do teste ignorado T1; a correção pós-2.3.0 (presente na 2.3.1 e na 2.4.0) distingue as duas. O critério de severidade foi **acrescentado depois** de o defeito ser identificado; os critérios originais permanecem inalterados. (2) casos 9–14 — recursos novos da 2.4.0: nas versões anteriores ficam N/A, nunca reprovados.

## Resultados por cenário

${casosTodos.map(secaoCaso).join('\n')}
## Honestidade sobre o que não foi provado

- O laboratório tem ${casosTodos.length} situações sintéticas: não prova que o Prumo encontra bugs em projetos reais.
- Sem avaliação com IA concluída não há conclusão sobre "o Prumo melhora as decisões de uma IA".
- O leitor do JSONL do cliente e a rubrica foram validados com fixtures sintéticas rotuladas (testes do laboratório), não com respostas de IA.
- Os testes Playwright do caso 14 nunca foram executados; a análise é textual.
`;
fs.mkdirSync(path.join(lab, 'docs'), { recursive: true });
fs.writeFileSync(path.join(lab, 'docs', 'RELATORIO-ENGENHARIA.md'), rel);
console.log('docs/RELATORIO-ENGENHARIA.md gerado.');
