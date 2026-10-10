# Avaliação Prumo 2.6

Dados sintéticos; nenhuma autenticação humana fabricada, banco externo ou execução de produto real. Critérios fora do contexto MCP. O produto foi avaliado em cópia isolada do Lab, preservando o diretório original.

Na exportação pública da avaliação de engenharia, somente o caminho absoluto pessoal da raiz foi substituído por `<LAB_SINTETICO>`. Critérios, respostas, identificadores e status permanecem os observados; o JSON original está no diretório local ignorado do produto.

- Determinística pelo MCP: 14/14 casos e 150/150 verificações. Resultado `avaliacoes/resultados/2026-10-10-prumo-2.6.0-ddc8e24-dirty-deterministico.json` identifica a versão e que o código tinha alterações locais.
- Suíte do Lab: 28/28 testes, sem falhas ou ignorados após corrigir uma fixture CRLF que selecionava linha vazia como requisito. A rubrica de comparação não mudou.
- Mutantes: seis avaliados, quatro sobreviventes e dois controles detectados pela suíte original. Os testes novos diferenciam os quatro sobreviventes; não são bugs descobertos autonomamente pelo Prumo. Novos arquivos com sufixo 2.6 preservam os resultados anteriores.
- Comparação real no Codex: casos 1 e 14, uma repetição. A sem Prumo 15/20; B com Skill QA/MCP 19/20; C com QA/MCP/especializações 18/20. Modelo não informado pelo JSONL, não presumido. As Skills foram fornecidas explicitamente, não carregadas por instalação automática.
- A errata de C preserva o resultado original: o avaliador registrou chamadas completed, mas omitiu o campo prumoUtilizado. A errata deriva esse campo das chamadas reais existentes, sem alterar resposta ou critério. A amostra pequena não prova superioridade; C não melhorou B.
- RQ-015 acrescenta manutenção, código repetido, documentação divergente, responsabilidade misturada, testes frágeis e controles legítimos com import dinâmico/assertion relevante. Critérios definidos antes da IA. Avaliação real: NAO_ATENDEU, 8/11 critérios automáticos. A resposta preservou os controles em frases, mas a rubrica exigia identificadores exatos; a duplicação foi confirmada pelos corpos e consumidores em vez de classificada como suspeita. Esses limites da medida não comprovam três erros semânticos. Resultado e rubrica preservados.

O núcleo não tem um detector semântico autônomo de arquitetura. A Skill orienta a IA hospedeira, que precisa ler consumidores e requisitos antes de recomendar. Análise de regex e presença de elementos não substituem evidência funcional.

```powershell
$env:PRUMO_MCP='<caminho absoluto do Prumo>\dist\mcp.js'
npm.cmd run check
node avaliacoes/avaliar.mjs --prumo $env:PRUMO_MCP
node avaliacoes/comparacao.mjs --casos 1,14 --bracos A,B,C --repeticoes 1 --prumo $env:PRUMO_MCP
node avaliacoes/errata-comparacao-26.mjs
node avaliacoes/engenharia.mjs
```

O cenário de engenharia é referência estática; seus testes Playwright e a função de gravação não foram executados. Não remova controles ou reduza assertions para melhorar a pontuação. Uma revisão futura da rubrica precisa de versão própria e comparação declarada.
