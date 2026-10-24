# 0019 — Sem indicador de conexão no lugar do Endpoint até o P4-05

Data: 2026-10-22 · Item: P2-03 · Status: aceita

## D-P2-03-1 — O que substitui o bloco Endpoint do painel

Contexto: o bloco Endpoint sai (D-P1-06-1, decisão 0015). O V1 do P1-01 previa o status da conexão no rodapé da navegação, adiado pela D-P1-03-3 até o BFF expor a saúde; o `GET /api/orchestrator/health` existe desde o P2-02.

Opções: **A) nada no lugar: o painel termina na lista; "fora do ar" aparece no bloco da conversa, na caixa de sessões e no composer; status global no P4-05**; B) "orquestrador online/offline" no rodapé da navegação, acima de Sair, alimentado pelo health (polling na casca, estado novo).

Escolha: **A**. O indicador global entra no P4-05 (configurações da plataforma: saúde e versão do orquestrador).
