# Relatório de engenharia — validação do Prumo QA

> Gerado por `node avaliacoes/relatorio.mjs` a partir dos resultados reais em `avaliacoes/resultados/`. Fórmulas em [METRICAS.md](METRICAS.md). Nada aqui foi estimado.

## Resumo

- **Núcleo determinístico (MCP real):** 2.2.0@fc7cb07: 7/8 casos, 99% · 2.3.0@18a5803: 8/8 casos, 100% · 2.3.0@5c26ff1: 7/8 casos, 99% · 2.3.1@4c7ee75: 8/8 casos, 100% · 2.4.0@9d1939c: 14/14 casos, 100%. "N/A" = o recurso não existia nessa versão (não conta como aprovado nem como falha).
- **Defeitos do laboratório (mutantes):** 4 lacunas confirmadas (a suíte original não detecta), todas detectadas por teste novo (4/4); **o Prumo não identificou nenhum dos defeitos sozinho** (0/4; 1 parcial).
- **Avaliação semântica com IA:** 8 atendeu / 0 não atendeu / 0 não executada.
- **Comparação com e sem Prumo:** Diferença observada em amostra pequena e sem teste estatístico; não é prova de superioridade.

## O que o Prumo faz e não faz (conclusão desta validação)

O Prumo acerta, de forma reproduzível, o que é **estrutural**: lacunas de oráculo, limite sem valor, condições ausentes, redundância candidata por assinatura, teste ignorado, contradição informada, bloqueio e a recusa de qualquer PASS sem execução; a partir da 2.4, também o estado de confiança dos contextos (rascunho, aprovado, desatualizado, conflitante, sem origem), o isolamento entre projetos e antipadrões de testes Playwright com fonte oficial. Ele **não** enxerga, sozinho, que um teste existente é superficial ou não exercita um limite: nos quatro defeitos plantados, quem os pegou foi um teste novo, não o Prumo. Esse julgamento depende da IA hospedeira (e da Skill); sem avaliação com IA não é possível afirmar quanto o Prumo a ajuda.

## Métricas objetivas

| Prumo (versão@commit) | Casos aprovados | Critérios atendidos | Não atendidos | Não avaliados | Taxa | Falsos positivos | Cenários necessários omitidos |
|---|---|---|---|---|---|---|---|
| 2.2.0@fc7cb07 | 7/8 | 101 | 1 | 0 | 99% | 0 | 0 |
| 2.3.0@18a5803 | 8/8 | 102 | 0 | 0 | 100% | 0 | 0 |
| 2.3.0@5c26ff1 | 7/8 | 101 | 1 | 0 | 99% | 0 | 0 |
| 2.3.1@4c7ee75 | 8/8 | 102 | 0 | 0 | 100% | 0 | 0 |
| 2.4.0@9d1939c | 14/14 | 150 | 0 | 0 | 100% | 0 | 0 |

Mutantes: 6 no total; suíte original detecta 2 (controles); sobrevivem 4; teste novo detecta 4/4; identificação autônoma pelo Prumo 0/4.

Avaliação com IA: 100% dos casos executados.

Comparação (codex, modelo: padrão do cliente (não informado), repetições: 1, rubrica 4cd5f2cbbf04…):

| Braço | Execuções | Executadas | Não executadas | Critérios atendidos/avaliados | Taxa | Cenários (média) | Tempo médio (ms) |
|---|---|---|---|---|---|---|---|
| A sem Prumo | 9 | 9 | 0 | 65/73 | 89% | 3 | 32219 |
| B com Prumo | 9 | 9 | 0 | 69/73 | 94.5% | 2.3 | 49740 |

Não calculados por falta de dado verificável: tokens, custo, cobertura funcional, bugs corrigidos.

## Evolução entre versões do Prumo

| Versão @ commit | Critérios | Casos aprovados (aplicáveis) | Casos N/A |
|---|---|---|---|
| 2.2.0@fc7cb07 | 101/102 | 7/8 | 6 |
| 2.3.0@18a5803 | 102/102 | 8/8 | 0 |
| 2.3.0@5c26ff1 | 101/102 | 7/8 | 6 |
| 2.3.1@4c7ee75 | 102/102 | 8/8 | 6 |
| 2.4.0@9d1939c | 150/150 | 14/14 | 0 |

Diferenças relevantes: (1) caso 7 — a 2.2.0 e a release 2.3.0 marcam o teste válido T2 com a mesma severidade do teste ignorado T1; a correção pós-2.3.0 (presente na 2.3.1 e na 2.4.0) distingue as duas. O critério de severidade foi **acrescentado depois** de o defeito ser identificado; os critérios originais permanecem inalterados. (2) casos 9–14 — recursos novos da 2.4.0: nas versões anteriores ficam N/A, nunca reprovados.

## Resultados por cenário

### Caso 1 — Valores-limite

- **Requisito:** O cliente é elegível ao plano somente se a idade for um inteiro de 18 a 65 anos, inclusive.
- **Problema preparado:** Intervalo 18–65 com um único teste usando 30; nenhum limite exercitado. Mutante: `idade >= 18` → `idade > 18`.
- **O que os testes anteriores verificavam:** Só `elegivel(30) === true`.
- **Cobertura que faltava:** Os quatro valores de fronteira (17, 18, 65, 66).
- **O que o Prumo identificou (2.4.0@9d1939c):** MISSING_BOUNDARY (c5, medium). Critérios: 17/17 (aprovado). Por versão: 2.2.0@fc7cb07 17/17 · 2.3.0@18a5803 17/17 · 2.3.0@5c26ff1 17/17 · 2.3.1@4c7ee75 17/17 · 2.4.0@9d1939c 17/17.
- **Recomendação:** conforme os achados acima; seleção sugerida: c1, c2, c3, c4, c5, c6.
- **Era realmente necessária?** Sim. Cada fronteira detecta um tipo diferente de erro de limite; o mutante só é pego com o 18. Mantê-las não é redundância: 17 e 18 estão em partições diferentes.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `elegibilidade-limite-inferior`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **não identificou** o defeito sozinho — MISSING_BOUNDARY apenas no cenário c5 do plano recebido (limite sem valor); não percebeu que o teste existente não exercita 18.
- **Limites conhecidos:** O Prumo confere que o limite foi declarado; não decide se 17, 18, 65 e 66 são os valores certos nem se o conjunto basta (julgamento semântico da IA).
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 2 — Classes de equivalência

- **Requisito:** O frete é 10 para SUL e SUDESTE, 20 para NORDESTE e NORTE e 15 para CENTRO_OESTE. Região desconhecida é recusada.
- **Problema preparado:** SUL e SUDESTE pertencem à mesma faixa de frete; testar as cinco regiões separadamente repete verificação.
- **O que os testes anteriores verificavam:** Testes de SUL, SUDESTE e NORDESTE e de região desconhecida.
- **Cobertura que faltava:** Nada essencial: faltava só selecionar um representante por faixa (e CENTRO_OESTE, que não tem teste).
- **O que o Prumo identificou (2.4.0@9d1939c):** POTENTIAL_REDUNDANCY (c-sudeste, medium). Critérios: 14/14 (aprovado). Por versão: 2.2.0@fc7cb07 14/14 · 2.3.0@18a5803 14/14 · 2.3.0@5c26ff1 14/14 · 2.3.1@4c7ee75 14/14 · 2.4.0@9d1939c 14/14.
- **Recomendação:** conforme os achados acima; seleção sugerida: c-sul, c-nordeste, c-centro-oeste, c-invalida.
- **Era realmente necessária?** Sim para marcar SUDESTE como redundância candidata; a decisão final de que são equivalentes é semântica (fica com a IA).
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Limites conhecidos:** Equivalência semântica entre SUL e SUDESTE é decisão da IA; o Prumo só aponta assinatura estrutural idêntica como candidata.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 3 — Permissões

- **Requisito:** Somente ADMIN pode excluir qualquer pedido; GERENTE pode excluir somente pedido com status ABERTO; OPERADOR e visitante não podem excluir.
- **Problema preparado:** Tabela de decisão por perfil e status; GERENTE (aberto e fechado) e OPERADOR sem teste. Mutante: GERENTE exclui qualquer pedido.
- **O que os testes anteriores verificavam:** ADMIN pode excluir e visitante não pode.
- **Cobertura que faltava:** GERENTE em pedido aberto e fechado, e OPERADOR (cenários negativos).
- **O que o Prumo identificou (2.4.0@9d1939c):** MISSING_CONDITIONS (c6, medium). Critérios: 16/16 (aprovado). Por versão: 2.2.0@fc7cb07 16/16 · 2.3.0@18a5803 16/16 · 2.3.0@5c26ff1 16/16 · 2.3.1@4c7ee75 16/16 · 2.4.0@9d1939c 16/16.
- **Recomendação:** conforme os achados acima; seleção sugerida: c1, c2, c3, c4, c5, c6.
- **Era realmente necessária?** Sim. O cenário GERENTE × FECHADO é o único que diferencia o comportamento correto do mutante.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `acesso-gerente-fechado`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **não identificou** o defeito sozinho — MISSING_CONDITIONS apenas no cenário c6 do plano recebido; não percebeu que GERENTE e OPERADOR não têm teste existente.
- **Limites conhecidos:** O Prumo não sabe que GERENTE e OPERADOR não têm teste existente; só a leitura semântica da IA compara a tabela de decisão com o que já existe.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 4 — Persistência após operação recusada

- **Requisito:** Quando a exclusão de um pedido é recusada por falta de autorização, o pedido permanece existente e inalterado.
- **Problema preparado:** A recusa não pode alterar dados, mas o teste só confere que lança erro. Mutante: a recusa muda o status do pedido antes de lançar.
- **O que os testes anteriores verificavam:** Operador não consegue excluir (apenas `assert.throws`).
- **Cobertura que faltava:** Oráculo de ESTADO: o pedido continua existente e inalterado depois da recusa.
- **O que o Prumo identificou (2.4.0@9d1939c):** MISSING_ORACLE (c2, medium); MISSING_ORACLE (c2, medium). Critérios: 8/8 (aprovado). Por versão: 2.2.0@fc7cb07 8/8 · 2.3.0@18a5803 8/8 · 2.3.0@5c26ff1 8/8 · 2.3.1@4c7ee75 8/8 · 2.4.0@9d1939c 8/8.
- **Recomendação:** conforme os achados acima; seleção sugerida: c1, c2.
- **Era realmente necessária?** Sim. Sem verificar o estado, o defeito passa despercebido (comprovado pelo mutante sobrevivente).
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `pedidos-recusa-altera-dado`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **não identificou** o defeito sozinho — MISSING_ORACLE apenas no cenário c2 do plano recebido; não percebeu que "lança erro" não prova persistência no teste existente.
- **Limites conhecidos:** O Prumo não consegue dizer que "lançar erro" não prova persistência no teste existente T1; isso é demonstrado pela análise de mutantes do laboratório e pelo julgamento da IA.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 5 — Redundância

- **Requisito:** Regiões da mesma faixa de frete (SUL e SUDESTE) se comportam de forma equivalente e não exigem testes independentes.
- **Problema preparado:** Candidato repete um teste existente (SUL); outro difere só por condição; um terceiro é de outra faixa.
- **O que os testes anteriores verificavam:** Teste de SUL com a mesma assinatura do candidato c1.
- **Cobertura que faltava:** Nada: o desafio é reconhecer a duplicação sem eliminar o cenário que difere por condição.
- **O que o Prumo identificou (2.4.0@9d1939c):** POTENTIAL_REDUNDANCY (c1, medium). Critérios: 10/10 (aprovado). Por versão: 2.2.0@fc7cb07 10/10 · 2.3.0@18a5803 10/10 · 2.3.0@5c26ff1 10/10 · 2.3.1@4c7ee75 10/10 · 2.4.0@9d1939c 10/10.
- **Recomendação:** conforme os achados acima; seleção sugerida: c2, c3.
- **Era realmente necessária?** Sim para sinalizar c1; não eliminar c2 e c3 é o comportamento correto.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Limites conhecidos:** c3 só difere por condição; o Prumo não elimina cobertura necessária e deixa a decisão final à IA.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 6 — Falta de oráculo

- **Requisito:** O cupom PRUMO10 concede 10 por cento de desconto sobre o total do pedido; qualquer outro código não altera o total.
- **Problema preparado:** Cenário de cupom sem resultado esperado nem oráculo.
- **O que os testes anteriores verificavam:** Nenhum teste existente informado.
- **Cobertura que faltava:** Resultado esperado e oráculo do cenário c2 (outro código não altera o total).
- **O que o Prumo identificou (2.4.0@9d1939c):** MISSING_ORACLE (c2, medium); MISSING_ORACLE (c2, medium). Critérios: 8/8 (aprovado). Por versão: 2.2.0@fc7cb07 8/8 · 2.3.0@18a5803 8/8 · 2.3.0@5c26ff1 8/8 · 2.3.1@4c7ee75 8/8 · 2.4.0@9d1939c 8/8.
- **Recomendação:** conforme os achados acima; seleção sugerida: c1, c2.
- **Era realmente necessária?** Sim. Um cenário sem oráculo não é verificável.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Limites conhecidos:** O Prumo aponta a ausência de oráculo; escolher o resultado esperado correto depende de requisito, não de inferência.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 7 — Falso positivo

- **Requisito:** O desconto do cupom PRUMO10 precisa ser verificado por um teste que compare o total final com o valor esperado.
- **Problema preparado:** Um teste ignorado (`test.skip`) e outro que só confere o tipo do retorno; ambos "passam" sem validar o desconto. Mutante: 10% → 5%.
- **O que os testes anteriores verificavam:** Teste ignorado do desconto e teste de tipo `number`.
- **Cobertura que faltava:** Comparar o total final com o valor esperado (200 → 180).
- **O que o Prumo identificou (2.4.0@9d1939c):** WEAK_TEST (T1, medium); WEAK_TEST (T2, low). Critérios: 10/10 (aprovado). Por versão: 2.2.0@fc7cb07 9/10 · 2.3.0@18a5803 10/10 · 2.3.0@5c26ff1 9/10 · 2.3.1@4c7ee75 10/10 · 2.4.0@9d1939c 10/10.
- **Recomendação:** conforme os achados acima; seleção sugerida: c1.
- **Era realmente necessária?** Sim. O PASS da suíte é falso positivo: o mutante sobrevive.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `cupom-desconto-errado`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **identificou parcialmente** o defeito sozinho — WEAK_TEST no arquivo com teste ignorado (por arquivo, também sinaliza o teste válido do mesmo arquivo); não avaliou o conteúdo da assertion superficial.
- **Limites conhecidos:** A detecção de teste ignorado é por arquivo. Critérios de severidade (T1 associado = medium; T2 apenas no mesmo arquivo = low) foram ACRESCENTADOS depois que o defeito de atribuição foi identificado na validação final; versões anteriores (2.2.0 e a release 2.3.0) não os atendem por construção. O Prumo não avalia o conteúdo das assertions: "retorna um número" não é reconhecido como superficial; isso é demonstrado pelos mutantes.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 8 — Requisito contraditório e ambiente bloqueado

- **Requisito:** Pedidos acima de 500 reais têm frete grátis para todos os clientes. O frete grátis é exclusivo de clientes premium, independentemente do valor do pedido. A validação de integração depende de um banco de testes isolado ainda não provisionado.
- **Problema preparado:** Duas regras incompatíveis de frete grátis; integração depende de um banco de testes inexistente.
- **O que os testes anteriores verificavam:** Nenhum.
- **Cobertura que faltava:** Esclarecer o requisito; registrar o bloqueio da integração.
- **O que o Prumo identificou (2.4.0@9d1939c):** CONTRADICTORY_REQUIREMENT; BLOCKING_CONDITION (c2, high). Critérios: 9/9 (aprovado). Por versão: 2.2.0@fc7cb07 9/9 · 2.3.0@18a5803 9/9 · 2.3.0@5c26ff1 9/9 · 2.3.1@4c7ee75 9/9 · 2.4.0@9d1939c 9/9.
- **Recomendação:** conforme os achados acima; seleção sugerida: c1, c2.
- **Era realmente necessária?** Sim: não existe teste correto a escrever enquanto o conflito persistir; a capacidade `integracao` fica BLOCKED por contrato.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Limites conhecidos:** O Prumo registra a contradição informada e o bloqueio; não resolve o conflito nem inventa a regra de frete.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 9 — Contexto aprovado

- **Requisito:** RQ-09: Somente ADMIN cancela pedidos fechados. (cadastrado como contexto no armazenamento isolado da avaliação)
- **Problema preparado:** Um requisito cadastrado e APROVADO por uma pessoa precisa ser usado na revisão com origem, versão e hash, sem alarmes indevidos.
- **O que os testes anteriores verificavam:** Não se aplica (sem teste existente).
- **Cobertura que faltava:** Nada: o desafio é usar o requisito aprovado e rastreável sem produzir achados de contexto.
- **O que o Prumo identificou (2.4.0@9d1939c):** nenhum. Critérios: 5/5 (aprovado). Por versão: 2.2.0@fc7cb07 N/A · 2.3.0@18a5803 n/d · 2.3.0@5c26ff1 N/A · 2.3.1@4c7ee75 N/A · 2.4.0@9d1939c 5/5.
- **Recomendação:** nenhuma: ausência de achados é o resultado correto; seleção sugerida: C1.
- **Era realmente necessária?** Não há recomendação a fazer: o comportamento correto é a ausência de achados `CONTEXT_*`.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os contextos foram semeados no armazenamento isolado e lidos pelo MCP real; nada foi executado.
- **Limites conhecidos:** O Prumo comprova a origem, a versão, o hash e a aprovação humana do contexto; não decide se o requisito está correto nem se os cenários bastam.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 10 — Contextos contraditórios

- **Requisito:** RQ-10: Frete grátis acima de 500 para todos. (cadastrado como contexto no armazenamento isolado da avaliação)
- **Problema preparado:** Dois contextos da mesma chave com regras incompatíveis (um aprovado, outro rascunho).
- **O que os testes anteriores verificavam:** Não se aplica.
- **Cobertura que faltava:** Esclarecimento humano do conflito; nenhum teste pode ser escrito com segurança antes.
- **O que o Prumo identificou (2.4.0@9d1939c):** CONTEXT_CONFLICT. Critérios: 6/6 (aprovado). Por versão: 2.2.0@fc7cb07 N/A · 2.3.0@18a5803 n/d · 2.3.0@5c26ff1 N/A · 2.3.1@4c7ee75 N/A · 2.4.0@9d1939c 6/6.
- **Recomendação:** conforme os achados acima; seleção sugerida: C1.
- **Era realmente necessária?** Sim: o Prumo deve apontar o conflito (alta severidade) sem escolher um lado, e marcar ambos como CONFLITANTE.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os contextos foram semeados no armazenamento isolado e lidos pelo MCP real; nada foi executado.
- **Limites conhecidos:** O Prumo aponta o conflito e os contextos envolvidos; não escolhe um lado nem resolve o conflito.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 11 — Contexto desatualizado

- **Requisito:** RQ-11: O cupom vale 30 dias. (cadastrado como contexto no armazenamento isolado da avaliação)
- **Problema preparado:** O contexto referenciado foi aprovado mas depois marcado como desatualizado.
- **O que os testes anteriores verificavam:** Não se aplica.
- **Cobertura que faltava:** Usar a versão que o substituiu.
- **O que o Prumo identificou (2.4.0@9d1939c):** CONTEXT_OUTDATED. Critérios: 5/5 (aprovado). Por versão: 2.2.0@fc7cb07 N/A · 2.3.0@18a5803 n/d · 2.3.0@5c26ff1 N/A · 2.3.1@4c7ee75 N/A · 2.4.0@9d1939c 5/5.
- **Recomendação:** conforme os achados acima; seleção sugerida: C1.
- **Era realmente necessária?** Sim: testar contra regra que não vale mais produz testes errados.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os contextos foram semeados no armazenamento isolado e lidos pelo MCP real; nada foi executado.
- **Limites conhecidos:** O Prumo informa que a versão não vale mais; localizar a versão substituta é decisão da pessoa.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 12 — Origem documental ausente

- **Requisito:** RQ-12: Pedidos acima de 1000 exigem aprovação. (cadastrado como contexto no armazenamento isolado da avaliação)
- **Problema preparado:** Contexto sem origem verificável: não pode ser aprovado e não prova de onde veio a regra.
- **O que os testes anteriores verificavam:** Não se aplica.
- **Cobertura que faltava:** Informar a origem e só então obter aprovação humana.
- **O que o Prumo identificou (2.4.0@9d1939c):** CONTEXT_NOT_APPROVED; CONTEXT_SOURCE_MISSING. Critérios: 6/6 (aprovado). Por versão: 2.2.0@fc7cb07 N/A · 2.3.0@18a5803 n/d · 2.3.0@5c26ff1 N/A · 2.3.1@4c7ee75 N/A · 2.4.0@9d1939c 6/6.
- **Recomendação:** conforme os achados acima; seleção sugerida: C1.
- **Era realmente necessária?** Sim: o Prumo registra a lacuna (e o estado de rascunho) em vez de a preencher.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os contextos foram semeados no armazenamento isolado e lidos pelo MCP real; nada foi executado.
- **Limites conhecidos:** Sem origem o contexto não pode ser aprovado; o Prumo registra a lacuna e não a preenche.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 13 — Isolamento entre projetos

- **Requisito:** RQ-13: Regra de outro projeto. (cadastrado como contexto no armazenamento isolado da avaliação)
- **Problema preparado:** Um contexto aprovado existe em OUTRO projeto no mesmo armazenamento local.
- **O que os testes anteriores verificavam:** Não se aplica.
- **Cobertura que faltava:** Nada: o contexto alheio não pode ser visto nem lido por id.
- **O que o Prumo identificou (2.4.0@9d1939c):** CONTEXT_UNAVAILABLE. Critérios: 6/6 (aprovado). Por versão: 2.2.0@fc7cb07 N/A · 2.3.0@18a5803 n/d · 2.3.0@5c26ff1 N/A · 2.3.1@4c7ee75 N/A · 2.4.0@9d1939c 6/6.
- **Recomendação:** conforme os achados acima; seleção sugerida: C1.
- **Era realmente necessária?** O correto é `CONTEXT_UNAVAILABLE` e nenhuma referência vazada em `contexto_projeto`.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os contextos foram semeados no armazenamento isolado e lidos pelo MCP real; nada foi executado.
- **Limites conhecidos:** O contexto aprovado de outro projeto não é visível: nem listado, nem lido por id.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

### Caso 14 — Testes Playwright com antipadrões

- **Requisito:** O cancelamento de pedido deve ser verificado pela interface e pela API. (cadastrado como contexto no armazenamento isolado da avaliação)
- **Problema preparado:** Arquivo de testes Playwright (estático) com espera fixa, seletor frágil, teste sem assertion, ignorado, duplicado, assertion fraca e teste de API só com status — além de testes bons que não podem ser acusados.
- **O que os testes anteriores verificavam:** Os próprios testes do arquivo.
- **Cobertura que faltava:** Não decidível pelo texto: validação de persistência e cobertura negativa de permissões (julgamento da IA com o requisito aprovado).
- **O que o Prumo identificou (2.4.0@9d1939c):** PW_SEM_ASSERTION (E2E, medium); PW_SELETOR_FRAGIL (E2E, medium); PW_ESPERA_FIXA (E2E, medium); PW_TESTE_IGNORADO (E2E, medium); PW_TESTE_DUPLICADO (E2E, medium); PW_ASSERTION_FRACA (E2E, medium); PW_API_SO_STATUS (E2E, low); WEAK_TEST (E2E, low); COVERAGE_GAP. Critérios: 18/18 (aprovado). Por versão: 2.2.0@fc7cb07 N/A · 2.3.0@18a5803 n/d · 2.3.0@5c26ff1 N/A · 2.3.1@4c7ee75 N/A · 2.4.0@9d1939c 18/18.
- **Recomendação:** conforme os achados acima; seleção sugerida: (vazia).
- **Era realmente necessária?** Sim para cada antipadrão apontado (com linha e fonte oficial); os testes bons (locators por papel/rótulo, assertions que repetem) não devem ser acusados.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes Playwright do laboratório são **fixtures estáticas**: nunca foram executados (o Playwright não é instalado aqui).
- **Limites conhecidos:** O Prumo não consegue, só pelo texto, saber que "salvar pedido" não verifica a persistência nem que faltam cenários negativos de permissão: isso é julgamento da IA com base no requisito aprovado.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-9d1939c-deterministico.json`.

## Honestidade sobre o que não foi provado

- O laboratório tem 14 situações sintéticas: não prova que o Prumo encontra bugs em projetos reais.
- Sem avaliação com IA concluída não há conclusão sobre "o Prumo melhora as decisões de uma IA".
- O leitor do JSONL do cliente e a rubrica foram validados com fixtures sintéticas rotuladas (testes do laboratório), não com respostas de IA.
- Os testes Playwright do caso 14 nunca foram executados; a análise é textual.
