# Relatório de engenharia — validação final do Prumo QA 2.3

> Gerado por `node avaliacoes/relatorio.mjs` a partir dos resultados reais em `avaliacoes/resultados/`. Fórmulas em [METRICAS.md](METRICAS.md). Nada aqui foi estimado.

## Resumo

- **Núcleo determinístico (MCP real):** 2.2.0@fc7cb07: 7/8 casos, 99% · 2.3.0@18a5803: 8/8 casos, 100% · 2.3.0@5c26ff1: 7/8 casos, 99%.
- **Defeitos do laboratório (mutantes):** 4 lacunas confirmadas (a suíte original não detecta), todas detectadas por teste novo (4/4); **o Prumo não identificou nenhum dos defeitos sozinho** (0/4; 1 parcial).
- **Avaliação semântica com IA:** NAO_EXECUTADA em 8/8 casos — motivo informado pelo cliente: "You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 4:12 PM".
- **Comparação com e sem Prumo:** não executada (nenhum resultado gravado).

## O que o Prumo faz e não faz (conclusão desta validação)

O Prumo acerta, de forma reproduzível, o que é **estrutural**: lacunas de oráculo, limite sem valor, condições ausentes, redundância candidata por assinatura, teste ignorado, contradição informada, bloqueio e a recusa de qualquer PASS sem execução. Ele **não** enxerga, sozinho, que um teste existente é superficial ou não exercita um limite: nos quatro defeitos plantados, quem os pegou foi um teste novo, não o Prumo. Esse julgamento depende da IA hospedeira (e da Skill); sem avaliação com IA não é possível afirmar quanto o Prumo a ajuda.

## Métricas objetivas

| Prumo (versão@commit) | Casos aprovados | Critérios atendidos | Não atendidos | Não avaliados | Taxa | Falsos positivos | Cenários necessários omitidos |
|---|---|---|---|---|---|---|---|
| 2.2.0@fc7cb07 | 7/8 | 101 | 1 | 0 | 99% | 0 | 0 |
| 2.3.0@18a5803 | 8/8 | 102 | 0 | 0 | 100% | 0 | 0 |
| 2.3.0@5c26ff1 | 7/8 | 101 | 1 | 0 | 99% | 0 | 0 |

Mutantes: 6 no total; suíte original detecta 2 (controles); sobrevivem 4; teste novo detecta 4/4; identificação autônoma pelo Prumo 0/4.

Avaliação com IA: taxa **n/a** (nenhuma execução); não é 0% nem 100%.

Não calculados por falta de dado verificável: tokens, custo, cobertura funcional, bugs corrigidos.

## Versões 2.2.0 → release 2.3.0 → principal (correção pós-2.3.0)

| Versão | Critérios | Casos aprovados |
|---|---|---|
| 2.2.0 @fc7cb07 | 101/102 | 7/8 |
| 2.3.0 (release) @5c26ff1 | 101/102 | 7/8 |
| 2.3.0 + correção @18a5803 | 102/102 | 8/8 |

A única diferença é no caso 7: a 2.2.0 e a release 2.3.0 marcam o teste válido T2 com a mesma severidade do teste ignorado T1 (atribuição por arquivo); a correção distingue as duas. Atenção: o critério de severidade foi **acrescentado depois** de o defeito ser identificado nesta validação; as versões anteriores o reprovam por construção, e os critérios originais permanecem inalterados.

## Resultados por cenário

### Caso 1 — Valores-limite

- **Requisito (RQ-01):** O cliente é elegível ao plano somente se a idade for um inteiro de 18 a 65 anos, inclusive.
- **Problema preparado:** Intervalo 18–65 com um único teste usando 30; nenhum limite exercitado. Mutante: `idade >= 18` → `idade > 18`.
- **O que os testes anteriores verificavam:** Só `elegivel(30) === true`.
- **Cobertura que faltava:** Os quatro valores de fronteira (17, 18, 65, 66).
- **O que o Prumo identificou (núcleo, commit 18a5803):** MISSING_BOUNDARY (c5, medium). Critérios: 17/17 (aprovado). 2.2.0: 17/17; release 2.3.0: 17/17.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c1, c2, c3, c4, c5, c6.
- **Era realmente necessária?** Sim. Cada fronteira detecta um tipo diferente de erro de limite; o mutante só é pego com o 18. Mantê-las não é redundância: 17 e 18 estão em partições diferentes.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `elegibilidade-limite-inferior`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **não identificou** o defeito sozinho — MISSING_BOUNDARY apenas no cenário c5 do plano recebido (limite sem valor); não percebeu que o teste existente não exercita 18.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 2 — Classes de equivalência

- **Requisito (RQ-02):** O frete é 10 para SUL e SUDESTE, 20 para NORDESTE e NORTE e 15 para CENTRO_OESTE. Região desconhecida é recusada.
- **Problema preparado:** SUL e SUDESTE pertencem à mesma faixa de frete; testar as cinco regiões separadamente repete verificação.
- **O que os testes anteriores verificavam:** Testes de SUL, SUDESTE e NORDESTE e de região desconhecida.
- **Cobertura que faltava:** Nada essencial: faltava só selecionar um representante por faixa (e CENTRO_OESTE, que não tem teste).
- **O que o Prumo identificou (núcleo, commit 18a5803):** POTENTIAL_REDUNDANCY (c-sudeste, medium). Critérios: 14/14 (aprovado). 2.2.0: 14/14; release 2.3.0: 14/14.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c-sul, c-nordeste, c-centro-oeste, c-invalida.
- **Era realmente necessária?** Sim para marcar SUDESTE como redundância candidata; a decisão final de que são equivalentes é semântica (fica com a IA).
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`.

### Caso 3 — Permissões

- **Requisito (RQ-03):** Somente ADMIN pode excluir qualquer pedido; GERENTE pode excluir somente pedido com status ABERTO; OPERADOR e visitante não podem excluir.
- **Problema preparado:** Tabela de decisão por perfil e status; GERENTE (aberto e fechado) e OPERADOR sem teste. Mutante: GERENTE exclui qualquer pedido.
- **O que os testes anteriores verificavam:** ADMIN pode excluir e visitante não pode.
- **Cobertura que faltava:** GERENTE em pedido aberto e fechado, e OPERADOR (cenários negativos).
- **O que o Prumo identificou (núcleo, commit 18a5803):** MISSING_CONDITIONS (c6, medium). Critérios: 16/16 (aprovado). 2.2.0: 16/16; release 2.3.0: 16/16.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c1, c2, c3, c4, c5, c6.
- **Era realmente necessária?** Sim. O cenário GERENTE × FECHADO é o único que diferencia o comportamento correto do mutante.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `acesso-gerente-fechado`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **não identificou** o defeito sozinho — MISSING_CONDITIONS apenas no cenário c6 do plano recebido; não percebeu que GERENTE e OPERADOR não têm teste existente.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 4 — Persistência após operação recusada

- **Requisito (RQ-04):** Quando a exclusão de um pedido é recusada por falta de autorização, o pedido permanece existente e inalterado.
- **Problema preparado:** A recusa não pode alterar dados, mas o teste só confere que lança erro. Mutante: a recusa muda o status do pedido antes de lançar.
- **O que os testes anteriores verificavam:** Operador não consegue excluir (apenas `assert.throws`).
- **Cobertura que faltava:** Oráculo de ESTADO: o pedido continua existente e inalterado depois da recusa.
- **O que o Prumo identificou (núcleo, commit 18a5803):** MISSING_ORACLE (c2, medium); MISSING_ORACLE (c2, medium). Critérios: 8/8 (aprovado). 2.2.0: 8/8; release 2.3.0: 8/8.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c1, c2.
- **Era realmente necessária?** Sim. Sem verificar o estado, o defeito passa despercebido (comprovado pelo mutante sobrevivente).
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `pedidos-recusa-altera-dado`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **não identificou** o defeito sozinho — MISSING_ORACLE apenas no cenário c2 do plano recebido; não percebeu que "lança erro" não prova persistência no teste existente.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 5 — Redundância

- **Requisito (RQ-05):** Regiões da mesma faixa de frete (SUL e SUDESTE) se comportam de forma equivalente e não exigem testes independentes.
- **Problema preparado:** Candidato repete um teste existente (SUL); outro difere só por condição; um terceiro é de outra faixa.
- **O que os testes anteriores verificavam:** Teste de SUL com a mesma assinatura do candidato c1.
- **Cobertura que faltava:** Nada: o desafio é reconhecer a duplicação sem eliminar o cenário que difere por condição.
- **O que o Prumo identificou (núcleo, commit 18a5803):** POTENTIAL_REDUNDANCY (c1, medium). Critérios: 10/10 (aprovado). 2.2.0: 10/10; release 2.3.0: 10/10.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c2, c3.
- **Era realmente necessária?** Sim para sinalizar c1; não eliminar c2 e c3 é o comportamento correto.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`.

### Caso 6 — Falta de oráculo

- **Requisito (RQ-06):** O cupom PRUMO10 concede 10 por cento de desconto sobre o total do pedido; qualquer outro código não altera o total.
- **Problema preparado:** Cenário de cupom sem resultado esperado nem oráculo.
- **O que os testes anteriores verificavam:** Nenhum teste existente informado.
- **Cobertura que faltava:** Resultado esperado e oráculo do cenário c2 (outro código não altera o total).
- **O que o Prumo identificou (núcleo, commit 18a5803):** MISSING_ORACLE (c2, medium); MISSING_ORACLE (c2, medium). Critérios: 8/8 (aprovado). 2.2.0: 8/8; release 2.3.0: 8/8.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c1, c2.
- **Era realmente necessária?** Sim. Um cenário sem oráculo não é verificável.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`.

### Caso 7 — Falso positivo

- **Requisito (RQ-07):** O desconto do cupom PRUMO10 precisa ser verificado por um teste que compare o total final com o valor esperado.
- **Problema preparado:** Um teste ignorado (`test.skip`) e outro que só confere o tipo do retorno; ambos "passam" sem validar o desconto. Mutante: 10% → 5%.
- **O que os testes anteriores verificavam:** Teste ignorado do desconto e teste de tipo `number`.
- **Cobertura que faltava:** Comparar o total final com o valor esperado (200 → 180).
- **O que o Prumo identificou (núcleo, commit 18a5803):** WEAK_TEST (T1, medium); WEAK_TEST (T2, low). Critérios: 10/10 (aprovado). 2.2.0: 9/10; release 2.3.0: 9/10.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c1.
- **Era realmente necessária?** Sim. O PASS da suíte é falso positivo: o mutante sobrevive.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Defeito (mutante `cupom-desconto-errado`):** suíte original **não detecta**; teste novo **diferencia** correto e mutante; o Prumo **identificou parcialmente** o defeito sozinho — WEAK_TEST no arquivo com teste ignorado (por arquivo, também sinaliza o teste válido do mesmo arquivo); não avaliou o conteúdo da assertion superficial.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`, `avaliacoes/resultados/2026-10-10-deteccao.json`.

### Caso 8 — Requisito contraditório e ambiente bloqueado

- **Requisito (RQ-08):** Pedidos acima de 500 reais têm frete grátis para todos os clientes. O frete grátis é exclusivo de clientes premium, independentemente do valor do pedido. A validação de integração depende de um banco de testes isolado ainda não provisionado.
- **Problema preparado:** Duas regras incompatíveis de frete grátis; integração depende de um banco de testes inexistente.
- **O que os testes anteriores verificavam:** Nenhum.
- **Cobertura que faltava:** Esclarecer o requisito; registrar o bloqueio da integração.
- **O que o Prumo identificou (núcleo, commit 18a5803):** CONTRADICTORY_REQUIREMENT; BLOCKING_CONDITION (c2, high). Critérios: 9/9 (aprovado). 2.2.0: 9/9; release 2.3.0: 9/9.
- **Recomendação:** conforme os achados acima (declarar limite/oráculo/condições, tratar redundância candidata, esclarecer conflito); seleção sugerida: c1, c2.
- **Era realmente necessária?** Sim: não existe teste correto a escrever enquanto o conflito persistir; a capacidade `integracao` fica BLOCKED por contrato.
- **Execução real ou análise?** O Prumo fez **análise estrutural** (NOT_VERIFIED, nada executado) pelo MCP real. Os testes da aplicação foram **executados de verdade** (`npm test`) e os mutantes também.
- **Evidência:** `avaliacoes/resultados/2026-10-10-prumo-2.3.0-18a5803-deterministico.json`.

## Honestidade sobre o que não foi provado

- O laboratório tem 8 situações sintéticas: não prova que o Prumo encontra bugs em projetos reais.
- Sem avaliação com IA concluída não há conclusão sobre "o Prumo melhora as decisões de uma IA".
- O leitor do JSONL do cliente e a rubrica foram validados com fixtures sintéticas rotuladas (testes do laboratório), não com respostas de IA.
