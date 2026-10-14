# 0004 — Stream de RunContent e fontes externas (achados do P0-03)

Data: 2026-10-14 · Decidido por: usuário (Mateus) · Item: P0-03 (D-P0-03-2, D-P0-03-3)

## D-P0-03-2 — chat sem stream com o agno 2.5

Contexto: o agno 2.5.8 emite `RunContent`/`TeamRunContent` (deltas); `useAIStreamHandler` só trata `RunResponseContent`/`TeamRunResponseContent` e supõe conteúdo acumulado (`replace(lastContent, '')`). Com o orquestrador real o texto só aparece no `RunCompleted`.

Opções: A) aceitar o P0-03 com o smoke conferindo a resposta final, registrar BUG-P0-03-1 com `test.fail` no e2e e corrigir num item curto antes da P1; B) corrigir já no P0-03 (fora do escopo); C) fake emitir `RunResponseContent` (esconde o defeito).

Decisão: **A**. Correção no item P0-06.

## D-P0-03-3 — `next/font/google` acessa rede externa

Contexto: `src/app/layout.tsx` usa `next/font/google`; `next dev`/`build` baixam as fontes do Google, então e2e e build tocam rede externa pelo servidor (o teste não quebra sem rede).

Opções: A) limitação conhecida, resolver no P1-01 com fontes self-hosted do design system; B) self-host já no P0.

Decisão: **A**.
