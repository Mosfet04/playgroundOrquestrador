# 0007 — Stream do chat: evento de membro de team e barra invertida

Data: 2026-10-14 · Decidido por: usuário (Mateus) · Item: P0-06 (D-P0-06-1, D-P0-06-2)

## D-P0-06-1 — evento de membro no stream do team

Contexto:

O `Team` do agno 2.5.8 repassa os eventos dos membros no SSE (`stream_member_events=True` por padrão), e o `RunCompleted` de um membro chega antes do `TeamRunCompleted`. Antes do P0-06 esse `RunCompleted` sobrescrevia o texto da bolha do team e mesclava as imagens e os vídeos do membro. O `TeamRunCompleted` não traz a mídia dos membros, que fica só em `member_responses`. Hoje nenhum fluxo do orquestrador gera mídia em membro.

## Opções

- **A) O membro só não sobrescreve o texto** — imagens e vídeos seguem mesclados como antes; nenhuma funcionalidade sai; 1-2 linhas e um teste.
- B) Ignorar o evento de membro por inteiro — regra mais simples; a mídia de membro deixa de aparecer.
- C) Ignorar o membro e ler a mídia de `member_responses` — usa outra parte do contrato; fora do escopo do P0-06.

## Decisão

A. Rever C quando o chat passar pelo BFF (P2).

## D-P0-06-2 — barra invertida no fim de um delta (BUG-P0-06-1)

Contexto: o parser do stream (`src/hooks/useAIResponseStream.tsx`) trata `\"` como aspa escapada sem contar as barras antes dela. Um delta que termina em `\` deixa o parser "dentro de string" e o resto da resposta se perde. O bug já existia, mas os deltas do P0-06 o tornam frequente.

Opções: **A) corrigir no P0-06** (mudança pequena, teste vermelho já escrito pelo QA); B) item curto P0-07 antes da P1.

Decisão: **A**.
