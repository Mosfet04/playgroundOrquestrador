# Roadmap — playground como gestor do orquestrador

Ordem de execução = numeração. Cada item passa por `/dev-cycle <item> --commit` (design → aprovação → dev → code review → QA → design QA → gate final) e cabe em ~600 linhas de diff. Decisões que originaram este roadmap: [docs/decisions/0001-gestao-realtime.md](../decisions/0001-gestao-realtime.md).

O playground deixa de escrever no Mongo e passa a usar a **API Admin** do orquestrador (fase FA em `../orquestradorIAPythonArgo/docs/roadmap/FA-admin-config.md`), que valida, persiste e aplica a config a quente. Item com `Depende (orq.)` só começa com o FA correspondente concluído.

| Fase | Entrega | Depende de | Arquivo |
|---|---|---|---|
| P0 Fundação | só pnpm, typecheck verde, Vitest/MSW, Playwright + fake orchestrator, CI, hardening mínimo das rotas atuais | — | [P0-fundacao.md](P0-fundacao.md) |
| P1 Design system e navegação | Design System no Claude Design, tokens claro/escuro, rotas por URL, i18n pt-BR/EN, estados de erro | P0 | [P1-design-navegacao.md](P1-design-navegacao.md) |
| P2 BFF e auth | login, cliente do orquestrador no servidor, chat via BFF, markdown seguro, fim do Mongo | P1, FA-02 | [P2-P5.md](P2-P5.md) |
| P3 Editores com paridade | formulários dirigidos por `/admin/schema`: agent, tool, team, RAG, segredos, concorrência | P2, FA-02/03/05/06 | [P2-P5.md](P2-P5.md) |
| P4 UX realtime | status de aplicação, diff, "testar agora", histórico, configurações da plataforma | P3, FA-04/05 | [P2-P5.md](P2-P5.md) |
| P5 Fase B | campos hoje fixos no orquestrador, tools MCP | P4, FA-07, F4-02 | [P2-P5.md](P2-P5.md) |

## Status dos itens

| Item | Status |
|---|---|
| P0-01 | concluído |
| P0-02 | concluído |
| P0-03 | concluído |
| P0-04 | concluído (falta verificar o 1º PR no GitHub, ver docs/qa/P0-04.md) |
| P0-05 | concluído (contagem de tools legadas com `number` no Mongo real pendente, ver docs/qa/P0-05.md) |
| P0-06 | concluído |
| P1-01 | pendente |
| P1-02 | pendente |
| P1-03 | pendente |
| P1-04 | pendente |
| P1-05 | pendente |

## Molde de item (lido pelo `/dev-cycle`)

```
## <id> — <título>
UI: sim | não            Depende (orq.): FA-xx | —
Base: <branch/commit> (opcional)   Branch: <branch> (opcional)
Objetivo: ...
Escopo: ...
Fora de escopo: ...
Critérios de aceite: (verificáveis localmente)
Testes exigidos: ...
Riscos e dependências: ...
```
