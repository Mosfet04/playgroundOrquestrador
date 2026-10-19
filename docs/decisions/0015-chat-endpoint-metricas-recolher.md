# 0015 — Chat no visual do DS: Endpoint, métricas, recolher e LIM-P1-03-1

Data: 2026-10-18 · Item: P1-06 · Status: aceita

## D-P1-06-1 — Bloco Endpoint no painel de sessões

Contexto: o painel do V14 (P1-01) não tem o bloco Endpoint (URL do orquestrador, editar/recarregar); ele sai de vez na P2-03, quando o endpoint fica só no servidor.

Opções: **A) manter no rodapé do painel até a P2-03**; B) remover agora (perde editar/recarregar e o estado V-P1-05-10); C) manter no topo, como hoje.

Escolha: **A**.

## D-P1-06-2 — Tempo da tool e métricas da resposta

Contexto: V14/V15 pedem o tempo da tool call e a linha de métricas da resposta. O agno 2.5 envia `tool.metrics.duration` e, no `RunCompleted`/`TeamRunCompleted`, `metrics.{duration,input_tokens,output_tokens}`; o handler do stream descarta esses campos (o P1-01 citava `metrics.time`, campo errado).

Opções: **A) ler os campos opcionais do stream, guardar as métricas na mensagem, ignorar o `RunCompleted` de membro (como na [0007](0007-membro-de-team-no-stream.md)) e estender o fake orchestrator**; sem mudança de contrato; B) adiar para a P2-03 (V14/V15 parciais).

Escolha: **A**.

## D-P1-06-3 — Botão de recolher o painel

Opções: **A) no topo do próprio painel** (sem estado compartilhado novo); B) no cabeçalho do app, como no artboard do P1-01 (estado de UI compartilhado entre `AppHeader` e a página).

Escolha: **A**.

## D-P1-06-4 — LIM-P1-03-1

Contexto: com o orquestrador fora ao abrir `/playground?agent=&session=`, `initializePlayground` zera `?agent=` e a sessão não recarrega após o refresh (`tests/components/PlaygroundSessionUrl.test.tsx`, `it.fails`).

Opções: **A) corrigir no P1-06 e trocar o `it.fails` por `it`**; B) deixar para a P2-03.

Escolha: **A**.

## D-P1-06-5 — Remover `dayjs`

Contexto: depois do P1-06, `dayjs` não tem mais import em `src`, `tests` nem `e2e`; o único uso (data das sessões em `Sessions.tsx`) passou para o `useFormatter` do next-intl.

Opções: **A) remover a dependência no P1-06**; B) manter até uma limpeza geral de dependências.

Escolha: **A**.
