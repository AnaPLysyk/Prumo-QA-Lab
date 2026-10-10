# Errata de critérios

Registro de todo critério do laboratório que foi corrigido **depois** de ver um resultado real. Regra: o resultado original é preservado como evidência; a correção é descrita com o motivo; nunca se altera um critério para favorecer o Prumo.

## 2026-10-10 — caso 8, critério "não inventou a regra de frete grátis" (defeito do laboratório)

- **O que aconteceu:** na primeira avaliação semântica real (Codex, Prumo 2.4.0), o agente respondeu corretamente: registrou a contradição, não inventou a regra e deixou sem resultado os cenários bloqueados. O critério reprovou porque tratava como "resultado definitivo inventado" qualquer cenário de frete com resultado afirmado, inclusive "cliente premium acima de R$ 500 → frete zero", que **está determinado** pelas duas regras do requisito (ambas concordam).
- **Classificação:** defeito do laboratório (critério amplo demais). Não foi falha do Prumo nem do agente.
- **Correção (v2):** só o cenário realmente contraditório — cliente **não** premium, pedido acima de 500 — não pode ter resultado definitivo sem condicionar ao esclarecimento. Cenários determinados pelas duas regras são livres. A mesma correção foi aplicada à rubrica da comparação com/sem Prumo (`nao-escolhe-regra`), que ainda **não** tinha nenhum resultado de IA gravado.
- **Evidência preservada:** `avaliacoes/resultados/2026-10-10-prumo-2.4.0-semantica-criterio-v1.json` (resultado original, critério v1).
- **Efeito:** o resultado do caso 8 na avaliação semântica seguinte usa o critério v2; a diferença entre as duas execuções reais também mostra a variabilidade do agente.
