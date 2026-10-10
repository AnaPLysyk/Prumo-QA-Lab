# Prumo QA Lab

Laboratório **independente** para avaliar a qualidade do [Prumo QA](https://github.com/AnaPLysyk/Prumo-Qa). É um sistema fictício e controlado, com defeitos e lacunas de teste conhecidos, usado para repetir a mesma avaliação a cada versão do Prumo.

Não é um agente, não é um modelo de IA, não treina nada e não usa dados reais. As avaliações com IA apenas **observam** um agente usando a Skill e as ferramentas MCP reais do Prumo; elas não alteram pesos de nenhum modelo.

Este repositório **não faz parte** da distribuição do aplicativo Prumo QA.

## Estrutura

| Pasta/arquivo | Papel |
|---|---|
| `aplicacao/src` | Código fictício (elegibilidade, frete, acesso, pedidos, cupom) |
| `aplicacao/testes` | Testes existentes, com lacunas e fraquezas intencionais |
| `requisitos/` | RQ-01 a RQ-08: o que o sistema deve fazer (única documentação que o Prumo lê) |
| `cenarios/caso-N` | `plano.json` (entrada de `revisar_cobertura`) e `esperado.json` (critérios) |
| `avaliacoes/avaliar.mjs` | Avaliação determinística pelo MCP real do Prumo (sem IA) |
| `avaliacoes/mutantes.mjs` | Análise de mutantes: oráculo independente da qualidade dos testes |
| `avaliacoes/semantica.mjs` | Avaliação com agente de IA (Codex) usando o MCP real |
| `avaliacoes/comparar.mjs` | Compara duas avaliações reais de versões diferentes |
| `avaliacoes/laboratorio.test.mjs` | Testes do próprio laboratório |
| `avaliacoes/resultados/` | Resultados reais gravados (JSON) |
| `qa.project.json` | Contrato v2: contexto limitado a `requisitos/`, `aplicacao/testes/` e `aplicacao/src/` |

O contexto autorizado **não** inclui `cenarios/` nem `avaliacoes/`, então o agente avaliado não vê as respostas esperadas.

## Os oito casos

| # | Situação | Problema intencional | O que o Prumo deve apontar |
|---|---|---|---|
| 1 | Valores-limite (idade 18–65) | Único teste usa 30; um cenário com limite sem valor | `MISSING_BOUNDARY`; manter 17, 18, 65, 66 |
| 2 | Classes de equivalência (frete) | SUL e SUDESTE são equivalentes | `POTENTIAL_REDUNDANCY` só no segundo; manter um representante por faixa |
| 3 | Permissões por perfil | Tabela de decisão incompleta em um cenário; GERENTE e OPERADOR sem teste | `MISSING_CONDITIONS`; sem achados falsos |
| 4 | Persistência após recusa | O teste só confere que lança erro | `MISSING_ORACLE` no cenário sem oráculo; oráculo de estado aceito |
| 5 | Redundância sem perder cobertura | Candidato repete teste existente; outro difere só por condição | `POTENTIAL_REDUNDANCY` no duplicado, **não** no que difere |
| 6 | Falta de oráculo | Cenário sem resultado esperado | `MISSING_ORACLE` |
| 7 | Falso positivo | Teste ignorado e teste que só confere o tipo | `WEAK_TEST` (por arquivo); o restante é limite conhecido |
| 8 | Requisito contraditório / ambiente bloqueado | Duas regras de frete grátis; banco de testes inexistente | `CONTRADICTORY_REQUIREMENT`, `BLOCKING_CONDITION`; `integracao` = BLOCKED |

Cada `esperado.json` traz também `limitesConhecidos`: o que o Prumo **não** consegue julgar estruturalmente (isso é da IA hospedeira) e que, quando aplicável, é demonstrado pela análise de mutantes.

## Como executar (PowerShell)

Requer Node 22+ e o Prumo compilado em `..\Prumo-Qa\dist\mcp.js` (ou `PRUMO_MCP` apontando para outro `mcp.js`).

```powershell
npm.cmd ci
npm.cmd test                    # testes da aplicação fictícia (1 ignorado de propósito)
npm.cmd run check               # testes do laboratório (9)
npm.cmd run avaliar             # determinística, via MCP real; grava em avaliacoes/resultados/
npm.cmd run mutantes            # qualidade dos testes existentes
npm.cmd run semantica           # com Codex; sem Codex/uso => NAO_EXECUTADA
npm.cmd run comparar -- avaliacoes\resultados\<antigo>.json avaliacoes\resultados\<novo>.json
```

Para usar o aplicativo instalado como servidor: `$env:PRUMO_MCP_COMMAND='C:\...\Prumo QA.exe'; $env:PRUMO_MCP_ELECTRON='1'; $env:PRUMO_MCP='C:\...\resources\app\dist\mcp.js'`.

A execução protegida (`executar_validacao`) fica `BLOCKED` sem autenticação humana; o laboratório verifica justamente que ela **nunca** vira PASS sozinha. `npm test` roda os testes diretamente (execução real, sem passar pelo Prumo).

## Como ler os resultados

- **Determinística**: `aprovado` significa que a análise **estrutural** do Prumo atendeu aos critérios (achados exigidos presentes, indevidos ausentes, seleção coerente, nenhum PASS inventado, requisito literal na fonte autorizada).
- **Mutantes**: `sobrevive` = os testes existentes não detectam o defeito (lacuna real confirmada); `morto` = detectam. Os controles `frete-*` devem morrer.
- **Semântica**: `ATENDEU`, `NAO_ATENDEU` ou `NAO_EXECUTADA`. Os critérios são estruturais, sobre as chamadas MCP que o agente realmente fez; o texto final é apenas registrado e deve ser revisto por uma pessoa. Se o cliente não está disponível, o caso é `NAO_EXECUTADA` com o motivo informado pelo próprio cliente. **Nada é fabricado.**

## Estado atual (2026-10-10)

- Determinística: Prumo 2.2.0 (código da tag `v2.2.0`) e 2.3.0, ambos 8/8 casos e 100/100 verificações. Não houve diferença entre as versões nos critérios avaliados.
- Mutantes: 4 lacunas confirmadas (sobrevivem) e 2 controles detectados (morrem).
- Semântica: **NAO_EXECUTADA** nos 8 casos; o Codex respondeu "usage limit" nesta máquina. O leitor do JSONL do Codex foi testado só com fixtures sintéticas (formato), não com uma sessão real.
- Defeito do próprio laboratório encontrado e corrigido durante a primeira execução: no caso 2 os oráculos citavam a região (`frete('SUL')`), tornando as assinaturas diferentes; o plano foi corrigido, não o critério.

## Limites

O laboratório mede o comportamento determinístico do Prumo e, quando houver IA disponível, a conduta de um agente. Ele não prova que o Prumo encontra bugs em projetos reais, e a cobertura de oito situações é pequena. Licença: `UNLICENSED` até decisão da titular.
