# Roadmap — playground como gestor do orquestrador

Ordem de execução = numeração. Cada item passa por `/dev-cycle <item> --commit` (design → aprovação → dev → code review → QA → design QA → gate final) e cabe em ~600 linhas de diff. Decisões que originaram este roadmap: [docs/decisions/0001-gestao-realtime.md](../decisions/0001-gestao-realtime.md).

O playground deixa de escrever no Mongo e passa a usar a **API Admin** do orquestrador (fase FA em `../orquestradorIAPythonArgo/docs/roadmap/FA-admin-config.md`), que valida, persiste e aplica a config a quente. Item com `Depende (orq.)` só começa com o FA correspondente concluído.

| Fase | Entrega | Depende de | Arquivo |
|---|---|---|---|
| P0 Fundação | só pnpm, typecheck verde, Vitest/MSW, Playwright + fake orchestrator, CI, hardening mínimo das rotas atuais | — | [P0-fundacao.md](P0-fundacao.md) |
| P1 Design system e navegação | Design System no Claude Design, tokens claro/escuro, rotas por URL, i18n pt-BR/EN, estados de erro | P0 | [P1-design-navegacao.md](P1-design-navegacao.md) |
| P2 BFF e auth | login, cliente do orquestrador no servidor, chat via BFF, markdown seguro, fim do Mongo | P1, FA-02 | [P2-bff-auth.md](P2-bff-auth.md) |
| P3 Editores com paridade | formulários dirigidos por `/admin/schema`: agent, tool, team, RAG, segredos, concorrência | P2, FA-02/03/05/06 | [P3-editores.md](P3-editores.md) |
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
| P1-01 | concluído |
| P1-02 | concluído |
| P1-03 | concluído |
| P1-04 | concluído |
| P1-04b | concluído |
| P1-05 | concluído (estados, error.tsx, 404 na casca, docs; tabela e contadores no P1-05b) |
| P1-05b | concluído (tabela/linhas, chips com limit=100, excluir no editor, ajustes do P1-05) |
| P1-06 | concluído (painel, bolhas, chip de tool, stream, composer, métricas do stream, LIM-P1-03-1 corrigida, ajustes do P1-05) |
| P1-07 | concluído (5× verde e tempos medidos localmente com `CI=true`; confirmar no GitHub Actions após o push, ver docs/qa/P1-07.md) |
| P2-01 | concluído (login usuário+senha, sessão jose 12 h, middleware, Origin em mutações, Sair; rate limit em memória exige réplica única e proxy que grave XFF) |
| P2-02 | concluído (cliente `src/server/orchestrator`, snapshot OpenAPI + tipos, `contract:update/check` na CI, health pelo BFF; chave no fake na P2-03, decisão 0018) |
| P2-03 | concluído (chat pelo BFF `/api/playground/*`, stream sem buffer com abort, `user_id` da sessão, fake exige a chave, Endpoint/FingerprintJS/ipify/crypto-js removidos; limitações no item) |
| P2-04 | concluído (markdown do agente sem HTML: `rehype-raw` removido, HTML cru vira texto, links só http(s)/mailto com `rel` seguro, imagem vira link sem carregar; decisões 0021 e 0022) |
| P2-05 | concluído (dashboard pelo `/metrics` do AgentOS e `/admin/config/agents` com chave admin, refresh 1x/min pelo BFF, filtro por dia UTC, pico diário de usuários, card de tokens por agente fora até a F8; decisão 0023) |
| P2-06 | concluído (CRUD de agents e tools pela `/admin/config` com chave admin, If-Match e 422 no campo, exclusão hard, pacote `mongodb` e scripts de seed fora; decisão 0024) |
| P3-01 | concluído (opções de provider, embedder, método HTTP e tipo de parâmetro vindas do `/admin/schema` pelo BFF; valor gravado fora das opções preservado; store só leitura trava o formulário; decisão 0025) |
| P3-02 | concluído (editor de agent com o documento inteiro: `model_params` por provider com tipo inferido, `base_url` quando o provider exige, `api_key_ref` só como referência, campos de execução com default e faixa do schema, memória e resumo; PUT sem mesclagem dos campos cobertos; decisão 0026) |

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
