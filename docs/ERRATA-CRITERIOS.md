# Errata de critérios

Registro de todo critério do laboratório que foi corrigido **depois** de ver um resultado real. Regra: o resultado original é preservado como evidência; a correção é descrita com o motivo; nunca se altera um critério para favorecer o Prumo.

## 2026-10-10 — caso 8, critério "não inventou a regra de frete grátis" (defeito do laboratório)

- **O que aconteceu:** na primeira avaliação semântica real (Codex, Prumo 2.4.0), o agente respondeu corretamente: registrou a contradição, não inventou a regra e deixou sem resultado os cenários bloqueados. O critério reprovou porque tratava como "resultado definitivo inventado" qualquer cenário de frete com resultado afirmado, inclusive "cliente premium acima de R$ 500 → frete zero", que **está determinado** pelas duas regras do requisito (ambas concordam).
- **Classificação:** defeito do laboratório (critério amplo demais). Não foi falha do Prumo nem do agente.
- **Correção (v2):** só o cenário realmente contraditório — cliente **não** premium, pedido acima de 500 — não pode ter resultado definitivo sem condicionar ao esclarecimento. Cenários determinados pelas duas regras são livres. A mesma correção foi aplicada à rubrica da comparação com/sem Prumo (`nao-escolhe-regra`), que ainda **não** tinha nenhum resultado de IA gravado.
- **Evidência preservada:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-semantica-criterio-v1.json` (resultado original, critério v1).
- **Efeito:** o resultado do caso 8 na avaliação semântica seguinte usa o critério v2; a diferença entre as duas execuções reais também mostra a variabilidade do agente.

## 2026-10-10 — rubrica da comparação A/B, caso 8: exige cenário mesmo quando o requisito é contraditório (defeito do laboratório, **ainda não corrigido nos resultados**)

- **O que aconteceu:** na primeira comparação com/sem Prumo (Codex, Prumo 2.4.0, 1 repetição), o braço B respondeu ao caso 8 com `cenarios: []`, registrou a contradição e deixou o pedido de esclarecimento. Os critérios `todo-cenario-tem-oraculo` e `parcimonia` exigem pelo menos um cenário e por isso reprovaram essa resposta.
- **Classificação:** defeito da rubrica. Recusar-se a propor cenários até esclarecer uma contradição é uma decisão de engenharia defensável; a rubrica não deveria punir lista vazia nesse caso. Não é falha comprovada do Prumo.
- **Tratamento:** o resultado original está preservado em `avaliacoes/resultados/2026-10-10-comparacao-prumo-2.4.0.json` e **não foi reavaliado**. Qualquer correção da rubrica altera o hash fixado e deve valer para os dois braços ao mesmo tempo, antes de uma nova rodada.
- **Efeito na leitura da comparação:** sem o caso 8, B teria 2 critérios a mais atendidos. Isso não é usado para concluir nada: a amostra é de 9 casos x 1 repetição por braço.
- **Outras reprovações (não são defeito de rubrica):** casos 2 e 14 (ambos os braços) e caso 3 (braço A) são omissões do modelo; o caso 14 do braço A não usou o Prumo e não apontou espera fixa, assertion ausente nem persistência, que o braço B apontou com o analisador Playwright.
