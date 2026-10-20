# Prumo QA Lab

## Evolução avaliada na 2.6

Veja [docs/AVALIACAO-2.6.md](docs/AVALIACAO-2.6.md): 14 casos determinísticos, avaliação real em três braços A/B/C e cenário RQ-015 de engenharia/controles legítimos. O braço C fornece explicitamente as especializações; isso não comprova carregamento automático no cliente. `avaliacoes/engenharia.mjs` avalia o novo cenário estático sem executar seu código ou seus testes. Critérios em `rubrica-engenharia.mjs`, fora do contexto MCP.

Laboratório **independente** para avaliar a qualidade do [Prumo QA](https://github.com/AnaPLysyk/Prumo-Qa). É um sistema fictício e controlado, com defeitos e lacunas de teste conhecidos, usado para repetir a mesma avaliação a cada versão do Prumo e responder, com evidência, **onde o Prumo acerta, onde falha e o que realmente o melhora**.

Não é um agente, não é um modelo de IA, não treina nada e usa somente dados sintéticos. As avaliações com IA apenas **observam** um agente usando a Skill e as ferramentas MCP reais do Prumo; elas não alteram pesos de nenhum modelo. Este repositório **não faz parte** da distribuição do aplicativo Prumo QA.

## Relação com o Prumo

O laboratório é um projeto como qualquer outro que o Prumo analisa: tem `qa.project.json` (contrato v2) e o Prumo o lê pelo MCP. O contexto autorizado é só `requisitos/`, `aplicacao/src` e `aplicacao/testes`; **cenários, critérios, testes de detecção e resultados ficam fora dele**, então o agente avaliado analisa requisitos e código em vez de ler um gabarito.

## Estrutura

| Pasta/arquivo | Papel |
|---|---|
| `aplicacao/src` | Código fictício (elegibilidade, frete, acesso, pedidos, cupom) |
| `aplicacao/testes` | Suíte **original**, com lacunas e fraquezas intencionais (não é alterada para não perder a comparação) |
| `requisitos/` | RQ-01 a RQ-08 (única documentação que o Prumo lê) |
| `cenarios/caso-N` | `plano.json` (entrada de `revisar_cobertura`) e `esperado.json` (critérios do núcleo) |
| `avaliacoes/avaliar.mjs` | Avaliação determinística do núcleo pelo MCP real (sem IA) |
| `avaliacoes/mutantes.mjs` | Análise de mutantes: a suíte original detecta o defeito? |
| `avaliacoes/deteccao/` + `deteccao.mjs` | **Testes novos** (fora do contexto) que diferenciam o comportamento correto do mutante |
| `avaliacoes/rubrica.mjs` | Rubrica objetiva da comparação com/sem Prumo (fixada por hash) |
| `avaliacoes/comparacao.mjs` | Mesma IA sem Prumo (A) e com Skill + MCP (B) |
| `avaliacoes/semantica.mjs` | Conduta de um agente usando as ferramentas do Prumo |
| `avaliacoes/metricas.mjs`, `relatorio.mjs` | Métricas ([fórmulas](docs/METRICAS.md)) e [relatório de engenharia](docs/RELATORIO-ENGENHARIA.md) gerados dos resultados |
| `avaliacoes/comparar.mjs` | Compara duas avaliações reais (versões diferentes) |
| `avaliacoes/resultados/` | Resultados reais gravados (JSON) |

## Os oito casos

| # | Situação | Problema intencional | O que o núcleo deve apontar |
|---|---|---|---|
| 1 | Valores-limite (idade 18–65) | Único teste usa 30 | `MISSING_BOUNDARY`; manter 17, 18, 65, 66 |
| 2 | Classes de equivalência (frete) | SUL e SUDESTE equivalentes | `POTENTIAL_REDUNDANCY` só no segundo |
| 3 | Permissões por perfil | GERENTE e OPERADOR sem teste | `MISSING_CONDITIONS`; sem achados falsos |
| 4 | Persistência após recusa | O teste só confere que lança erro | `MISSING_ORACLE` |
| 5 | Redundância sem perder cobertura | Duplicado vs. diferença por condição | `POTENTIAL_REDUNDANCY` só no duplicado |
| 6 | Falta de oráculo | Cenário sem resultado esperado | `MISSING_ORACLE` |
| 7 | Falso positivo | Teste ignorado e teste que só confere o tipo | `WEAK_TEST` (T1 associado = medium; T2 no mesmo arquivo = low) |
| 8 | Contradição / ambiente bloqueado | Duas regras de frete; sem banco de testes | `CONTRADICTORY_REQUIREMENT`, `BLOCKING_CONDITION`; `integracao` BLOCKED |

## Como executar (PowerShell)

Requer Node 22+ e o Prumo compilado em `..\Prumo-Qa\dist\mcp.js` (ou `PRUMO_MCP` com outro `mcp.js`). Se a variável `ELECTRON_RUN_AS_NODE` estiver definida no terminal, remova-a.

```powershell
npm.cmd ci
npm.cmd test                 # suíte original da aplicação fictícia (1 ignorado de propósito)
npm.cmd run check            # testes do próprio laboratório (19)
npm.cmd run avaliar          # determinística, via MCP real -> avaliacoes\resultados\
npm.cmd run mutantes         # a suíte original detecta cada defeito?
npm.cmd run deteccao         # testes novos diferenciam correto x mutante?
npm.cmd run comparacao       # IA sem Prumo (A) x com Prumo (B); exige Codex com cota
npm.cmd run semantica        # conduta com as ferramentas; NAO_EXECUTADA sem cliente/cota
npm.cmd run metricas         # métricas dos resultados reais
node avaliacoes\relatorio.mjs   # regenera docs\RELATORIO-ENGENHARIA.md
```

Para avaliar o aplicativo instalado: `$env:PRUMO_MCP_COMMAND='C:\...\Prumo QA.exe'; $env:PRUMO_MCP_ELECTRON='1'; $env:PRUMO_MCP='C:\...\resources\app\dist\mcp.js'`. Caminhos com espaços funcionam.

## Como interpretar os resultados

- **Determinística**: aprova quando a análise **estrutural** atende a todos os critérios (achados exigidos presentes, indevidos ausentes, seleção coerente, nenhum PASS inventado, requisito literal na fonte). Não mede julgamento semântico.
- **Mutantes**: `sobrevive` = a suíte original não detecta o defeito (lacuna real); `morto` = detecta. Os controles `frete-*` devem morrer.
- **Detecção**: só prova a lacuna quando o teste novo **passa no código correto e falha no mutante**. Um mutante detectado por teste novo **não** é um defeito identificado pelo Prumo; o campo `prumo` registra à parte o que o Prumo apontou sozinho.
- **IA (semântica/comparação)**: `ATENDEU`, `NAO_ATENDEU` ou `NAO_EXECUTADA`.
- **Execuções não executadas** têm `estado: "NAO_EXECUTADA"` e `motivo` (o texto do próprio cliente). Elas não entram em nenhuma taxa: a taxa vira `n/a`, nunca 0% nem 100%. `npm run metricas` mostra a contagem.

## Comparar versões

```powershell
npm.cmd run avaliar -- --prumo C:\caminho\antigo\dist\mcp.js     # grava ...-prumo-<versão>-<commit>-deterministico.json
npm.cmd run avaliar                                                # versão atual
npm.cmd run comparar -- avaliacoes\resultados\<antigo>.json avaliacoes\resultados\<novo>.json
```

Cada resultado traz `versao` e `commit` do código avaliado (`-dirty` se houver alterações locais). `comparar` recusa tipos diferentes e nunca preenche lacunas.

## Adicionar um cenário novo

1. Escreva `requisitos/RQ-0N.md` com uma frase de requisito (o plano precisa citá-la **literalmente**).
2. Acrescente código em `aplicacao/src` e o teste existente em `aplicacao/testes` (sem comentários que revelem a lacuna: o Prumo lê esses arquivos).
3. Crie `cenarios/caso-N/plano.json` e `esperado.json` (obrigatórios, proibidos, seleção, limites conhecidos).
4. Se houver defeito a plantar, inclua um mutante em `avaliacoes/mutantes.mjs` e o teste de detecção em `avaliacoes/deteccao/`.
5. Defina os critérios da IA em `avaliacoes/rubrica.mjs` **antes** de executar com IA e rode `npm run check`.

## Como evitar falsos positivos na avaliação

- Critérios olham tipos, números e listas, não frases idênticas; critérios textuais ficam rotulados e à parte.
- Nunca ajuste um critério depois de ver o resultado para favorecer o Prumo; se precisar acrescentar um critério, registre isso (como no caso 7) e mantenha os antigos.
- A rubrica e seus testes usam respostas **sintéticas rotuladas** só para provar que ela é satisfazível e reprova respostas ruins; elas jamais entram em resultados.
- Não aceite PASS sem execução: o laboratório reprova qualquer resposta que afirme execução e verifica que `executar_validacao` fica `BLOCKED` sem aprovação humana.

## Estado e limites

O estado dos resultados reais está em [docs/RELATORIO-ENGENHARIA.md](docs/RELATORIO-ENGENHARIA.md) (gerado). Oito situações sintéticas não provam que o Prumo encontra bugs em projetos reais. Licença: `UNLICENSED` até decisão da titular.


## Automacao externa do Prumo QA

A pasta `automacao/prumo-qa/testes/` guarda **81 arquivos de testes** do aplicativo: 2 smoke e 79 regressao (incluindo o pré-voo de homologação transferido). Nao altera a aplicacao ficticia nem suas avaliacoes controladas.

O Lab executa esses testes no codigo **compilado** do Prumo QA. Seu executor valida os arquivos, copia temporariamente os testes e os auxiliares exclusivos para a arvore `testes/` do checkout do Prumo QA, executa Node Test Runner e limpa as copias em `finally`. O Lab nao altera arquivos de producao, contas ou instalacoes reais. Se o destino ja contiver os testes, a execucao e recusada (sem sobrescrever nada).

Com os repositorios em pastas irmas e apos `npm ci` e `npm run build` no Prumo QA:

- `npm run test:prumo:smoke`: smoke da API/MCP e da janela Electron
- `npm run test:prumo:regressao`: regressao de backend, integracoes simuladas e interfaces
- `node automacao/prumo-qa/executar.mjs --qa <caminho> --tipo smoke --arquivo frontend/aplicativo/todas-as-telas.test.mjs --empacotado`: smoke do aplicativo empacotado com `PRUMO_APP_EXE` explicitamente definido pelo CI

O workflow `.github/workflows/prumo-qa-automacao.yml` valida o Lab nos pushes e permite executar as duas suites sob demanda contra uma branch, tag ou SHA do Prumo QA em runner Windows. O CI de release do Prumo QA tambem consulta este projeto em um commit fixado antes de publicar instaladores.

Os testes usam fixtures e dados sinteticos. Homologacao com contas externas reais e uma etapa separada.
