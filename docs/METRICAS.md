# Métricas do laboratório e suas fórmulas

Todas as métricas saem de `avaliacoes/metricas.mjs`, lendo apenas resultados **reais** gravados em `avaliacoes/resultados/`. Nada é estimado, extrapolado ou preenchido.

## Regras gerais

1. **Não executado ≠ aprovado ≠ zero.** Uma avaliação `NAO_EXECUTADA` fica fora de todo numerador **e** denominador e aparece como contagem própria e taxa `n/a`.
2. Uma **chamada MCP bem-sucedida não é uma análise correta**: o que conta são os critérios atendidos sobre a resposta.
3. **PASS do executor** (`executar_validacao`) não comprova a qualidade da estratégia de testes; o laboratório até exige que ele **não** apareça sem aprovação humana.
4. **Tokens, custo, cobertura funcional e bugs corrigidos não são calculados** (não há dado verificável).
5. Detectar um mutante com um **teste novo** não é o Prumo identificar o defeito: as duas coisas são contadas separadamente.

## Determinística (núcleo do Prumo pelo MCP real)

Por versão/commit do Prumo, sobre os 8 casos mais as verificações gerais:

| Métrica | Fórmula |
|---|---|
| Critérios atendidos / não atendidos | contagem de verificações `ok` / `!ok` |
| Taxa de critérios | atendidos ÷ (atendidos + não atendidos) × 100 |
| Critérios não avaliados | 0 (a avaliação determinística sempre avalia tudo; se um critério não puder ser avaliado, a execução falha) |
| Achados obrigatórios apontados | verificações `aponta …` atendidas ÷ total de verificações `aponta …` |
| Falsos positivos | verificações `não aponta …` **não** atendidas (achado indevido presente) |
| Cenários necessários omitidos | verificações `mantém … na seleção sugerida` não atendidas |
| Recomendações redundantes indevidas | verificações de redundância candidata que marcaram o que não devia |
| Casos aprovados | casos com 100% dos critérios ÷ 8 |

## Mutantes e detecção

| Métrica | Fórmula |
|---|---|
| Detecção pela suíte original | mutantes em que a suíte original falha ÷ total de mutantes |
| Lacunas confirmadas | mutantes que **sobrevivem** à suíte original (contagem) |
| Detecção por teste novo | sobreviventes em que o teste novo passa na aplicação correta **e** falha no mutante ÷ sobreviventes |
| Identificação autônoma pelo Prumo | sobreviventes em que o Prumo, sem receber o cenário que detecta o defeito, apontou o defeito ÷ sobreviventes (`parcial` é contado à parte) |

## Avaliação com IA (semântica e comparação com/sem Prumo)

Para cada braço (A sem Prumo, B com Prumo), sobre as **execuções realizadas**:

| Métrica | Fórmula |
|---|---|
| Critérios atendidos | soma dos critérios da rubrica atendidos |
| Taxa | atendidos ÷ avaliados × 100, ou `n/a` se nenhuma execução ocorreu |
| Execuções não executadas | contagem de `NAO_EXECUTADA` (com o motivo informado pelo cliente) |
| Cenários propostos | média de `cenarios.length` (parcimônia: quanto menor, com a rubrica atendida, melhor) |
| Tempo | média de `duracaoMs` das execuções realizadas |

A comparação só é **comparável** quando ambos os braços executaram todos os casos e o braço B realmente chamou `contexto_projeto` e `revisar_cobertura`. Mesmo assim, a amostra é pequena e **não há teste estatístico**: o resultado descreve diferença observada, não superioridade comprovada. O hash da rubrica (`rubricaSha256`) vai em cada resultado; mudar a rubrica depois invalida a comparação.

## Rubrica

`avaliacoes/rubrica.mjs` define, **antes** das execuções, os critérios objetivos por caso. Critérios `estrutural` olham números e listas do JSON de resposta; critérios `textual` procuram palavras-chave em textos livres (mais frágeis) e são reportados à parte. Regras comuns: JSON válido, requisito citado literalmente da documentação autorizada, nenhuma execução afirmada, todo cenário com resultado esperado e oráculo, e parcimônia (limite máximo de cenários por caso).
