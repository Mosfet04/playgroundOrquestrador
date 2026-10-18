# 0014 — Escopo do P1-05 e contadores da lista

Data: 2026-10-18 · Item: P1-05 · Status: aceita

## D-P1-05-2 — Dividir o P1-05

Contexto: além dos estados, do `error.tsx`, do 404, do painel de sessões e das docs, a decisão [0010](0010-rotas-criacao-lista-e-conexao.md) (D-P1-03-2 = B) trouxe para o P1-05 a tabela da lista (V11/V12) e o excluir no editor. O diff passaria bem do limite de 600 linhas.

Opções:
- **A) Dividir em 2**: P1-05 com estados vazio/carregando/erro, `error.tsx`, 404, painel de sessões e docs; P1-05b (novo) com tabela V11/V12, excluir no editor e contadores.
- B) Tudo no P1-05.
- C) Dividir em 3 (docs num P1-05c).

Escolha: **A**. Na spec `docs/design/P1-05.md`, V6, V7 e os chips de contagem ficam para o P1-05b; os estados do P1-05 seguem o layout atual da lista até lá.

## D-P1-05-1 — Contadores da lista

Contexto: V11 pede chip de total e contagem por status. O BFF devolve uma página (`limit=10` por padrão) e o `total` do filtro, sem contagem por status; hoje o 11º agente não aparece em lugar nenhum.

Opções:
- **A') `limit=100` e contar no cliente**: 1 request, sem mudar contrato; chips por status quando tudo carregou, senão total e "Mostrando 100 de N". Teto arbitrário.
- B') Só total e "Mostrando 10 de N"; status e paginação na P3.
- C') Total e mais 2 requests por status, com paginação.

Escolha: **A'** (aplicada no P1-05b).

## D-P1-05-3 — README_EN.md, README_AGNO_MANAGER.md e INTEGRATION.md

Contexto: o conteúdo verdadeiro dos três já está no README reescrito. O que sobra é falso ou fictício (variáveis que nada lê, Docker sem Dockerfile, código Python inventado, `MONGODB_URI`), roadmap-desejo fora de `docs/roadmap`, marketing, setup do orquestrador (o README aponta para o dele) e o passo a passo campo a campo dos formulários, que muda na P3.

Opções:
- **A) Apagar os três**: uma fonte só, nada enganoso; o git guarda o histórico.
- B) Apagar e levar o passo a passo dos formulários (~40 linhas) ao README.
- C) Manter os três com aviso de "histórico".

Escolha: **A**.

## D-P1-05-4 — Screenshots do design QA no repositório

Contexto: o design QA do P1-05 gerou 109 screenshots (5,2 MB); os itens anteriores versionaram cerca de 22 (~1 MB).

Opções:
- **A) Subconjunto**: uma ou duas capturas por critério, alternando tema e largura (29 arquivos, 1,8 MB); o resto fica só local, fora do git.
- B) Todas as 109.
- C) Nenhuma.

Escolha: **A**.
