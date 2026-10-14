# 0001 — Playground como gestor realtime do orquestrador

Data: 2026-10-13 · Decidido por: usuário (Mateus)

## Contexto

O playground grava a config direto no Mongo, sem auth nem validação, e o orquestrador só lê a config no startup (mudança exige restart). O objetivo é configurar qualquer detalhe de agents, teams e tools com efeito imediato e testar no chat. O Agno 2.5.8 resolve `os.agents` a cada request, então a troca a quente é viável no orquestrador.

## Decisões

| Tema | Escolha | Alternativas descartadas |
|---|---|---|
| Realtime | API Admin no orquestrador (CRUD `/admin/config/*` validado pelas entidades de domínio, `/admin/schema`, troca a quente do runtime); playground vira cliente via BFF | Mongo direto + change streams; Mongo direto + `POST /admin/reload` (validação duplicada em TS, YAML de fora) |
| Ordem no orquestrador | Fase FA entre F2 e F3 | Depois da F3 (bloquearia o playground) |
| Réplicas | Troca local + poll de `config_revision` (~2 s), pronto para várias réplicas | Só processo único; change streams (exigem replica set) |
| Escrita | `version` + ETag/If-Match (412); soft delete + hard explícito; YAML só leitura (409); camelCase legado regravado em snake_case; build → persist → swap (falha mantém o runtime); auditoria `config_audit` | Última escrita vence; YAML gravável |
| Segurança antecipada | Guarda SSRF em rota de tool e `base_url` gravadas pela API; headers de tool por referência (`env:`/`file:`), GET mascarado | Só SSRF; manter F4-01/F5-05 onde estão |
| Auth do playground | BFF com as chaves só no servidor + login de usuário único (senha via env), cookie com `jose` | Sem login; Auth.js/OIDC; `iron-session`; HMAC próprio |
| Contrato | `openapi-typescript` (dev) + zod na fronteira + snapshot `docs/contracts/orchestrator-openapi.json` | Tipos à mão |
| Testes | Vitest + Testing Library + MSW; Playwright com fake orchestrator em servidor Node próprio; só pnpm; CI no GitHub Actions | Jest/npm; só E2E; MSW dentro do Next |
| UI | Tema claro e escuro; pt-BR e EN (biblioteca de i18n decidida no P1-04, recomendação `next-intl`) | Só escuro; só pt-BR |
| Escopo | Paridade com o que o orquestrador suporta hoje; depois campos hoje fixos (FA-07/P5-01); MCP após F4-02 | Tudo de uma vez |
| Design | `ui-ux-designer` usa Claude Design: um artifact Design System do playground + um artifact Design por item, spec em `docs/design/` | Só mockups; só spec escrita |
| Cadeia | Agentes neste repo (`.claude/agents/`), `/dev-cycle` com design e aprovação do usuário; o orquestrador segue com a própria cadeia | Agentes globais; reusar os do orquestrador |

## Consequências

- As rotas atuais que gravam no Mongo recebem só hardening mínimo (P0-05) e saem na P3.
- A chave admin do orquestrador passa a permitir executar HTTP (tools) e reescrever prompts: SSRF, auditoria e login forte são pré-requisitos, não melhorias.
- Toda decisão técnica futura segue o bloco `DECISAO` do `CLAUDE.md` e vira um arquivo nesta pasta.
