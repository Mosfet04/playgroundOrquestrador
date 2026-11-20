# 0036 — Adaptação do playground ao orquestrador no agno 3.1.12

Data: 2026-11-20 · Fase: AG3 · Status: aceita

Origem: [docs/contracts/orquestrador-agno-3.md](../contracts/orquestrador-agno-3.md), levantamento feito com o orquestrador real depois da F3 (`5507f0f`).

## D-AG3-0-1 — Divisão em itens

Contexto: o levantamento tem 5 frentes: `expose_reasoning`, snapshot do contrato, sessões por `user_id`, raciocínio no chat e fake/fixtures 3.x.

Opções:
- **A) 4 itens AG3:** 01 `expose_reasoning`, 02 sessões, 03 snapshot + fake/fixtures 3.x, 04 raciocínio no chat (usa os fixtures do 03).
- B) 5 itens, um por frente.
- C) Só os dois urgentes (01 e 02) agora.

Escolha: **A**, em [docs/roadmap/AG3-agno3.md](../roadmap/AG3-agno3.md). Compactar o contexto ao fim de cada item.

## D-AG3-0-2 — Modelos dos agentes

Contexto: o usuário delegou a escolha, com o objetivo de não gastar à toa. Os quatro itens são pequenos pela regra da [0033](0033-p4-03-testar-agora.md) D-P4-03-1: nenhum tem rota ou BFF novo, e cada um mexe em 1 ou 2 componentes de produto.

Escolha: o **perfil enxuto** do `/dev-cycle` para todos os itens:

| Agente | Modelo e esforço |
|---|---|
| Designer, design e DESIGN_QA (só no AG3-01 e no AG3-04) | sonnet/medium, reaproveitando os mockups |
| Dev | sonnet/high |
| Revisor | opus/high |
| QA | sonnet/high, no modo QA enxuto |

Se algum item crescer além do previsto, a escolha volta ao usuário.

## D-AG3-01-1 — `expose_reasoning` no editor de agente

Contexto: o `PUT /admin/config/agents/{id}` substitui o documento inteiro. Como o playground não conhece o campo, salvar volta o valor para `true`, o default.

Opções:
- **A) Mostrar um switch em Execução, habilitado só com `reasoning` ligado.**
- B) Só preservar o valor lido ao salvar, sem UI.

Escolha: **A**. Segue a [0026](0026-p3-02-editor-de-agent.md): o editor cobre o documento inteiro.

## D-AG3-02-1 — Sessões de outro `user_id`

Contexto: no 3.1.12, um run numa sessão de outro dono responde 404. A lista de sessões não filtra por usuário.

Opções:
- A) `listSessions` com o `user_id` do usuário logado.
- B) Mensagem própria para o 404 do run.
- **A + B.**

Escolha: **A + B**. O `getSessionHistory` continua sem `user_id`, então uma sessão alheia aberta por link `?session=` mostra o histórico, e o envio mostra a mensagem própria.

## D-AG3-04-1 — Raciocínio no chat

Contexto: no agno 3, `reasoning: true` vira as tools `think`/`analyze`, que aparecem como chip de tool. O painel de passos fica vazio por um defeito anterior ao 3.x: o painel lê `extra_data.reasoning_steps`, que o agno nunca manda.

Opções:
- **A) Painel sem chip:** os passos vêm de `ReasoningStep`, `ReasoningCompleted` e `RunCompleted.reasoning_steps`, e o chip de `think`/`analyze` some quando o agente tem `reasoning` ligado. Os textos de ajuda e aviso também mudam.
- B) Painel e chip.
- C) Só corrigir o defeito.

Escolha: **A**.
