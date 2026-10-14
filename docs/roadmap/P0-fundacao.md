# P0 — Fundação

Objetivo: base verificável para a cadeia de agentes: um só gerenciador de pacotes, typecheck verde, testes de unidade/componente e E2E rodando contra um orquestrador falso, CI, e as rotas atuais (que ainda escrevem no Mongo até a P2/P3) sem as falhas graves conhecidas.

Princípios (valem para todos os itens):

- Menor mudança suficiente; nada de reorganizar pastas antes da P1-03.
- Dependência nova só as listadas no item (aprovadas em [0001](../decisions/0001-gestao-realtime.md)), com versão fixada; qualquer outra é `needs_decision`.
- Nenhum teste toca rede externa, LLM real ou Mongo real.

## P0-01 — Só pnpm e typecheck verde
UI: não            Depende (orq.): —
Objetivo: `pnpm install --frozen-lockfile`, `pnpm lint` e `pnpm typecheck` verdes.
Escopo: remover `package-lock.json`; `packageManager: "pnpm@10.33.0"` e `engines.node` no `package.json`; remover código morto que quebra o typecheck ou não tem uso: `src/components/management/sessions/` (importa `getSessionByIdAPI`, inexistente), `src/app/api/proxy/[...path]/route.ts` (vazio), `src/components/playground/Sidebar/NewChatButton.tsx` (duplicado inline em `Sidebar.tsx`); remover as dependências sem uso `cors` e `@types/cors`; corrigir os erros de lint/typecheck restantes que aparecerem (sem mudar comportamento).
Fora de escopo: trocar versões de Next/React/Tailwind; refatorar componentes.
Critérios de aceite: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck` verdes num clone limpo; `git grep -n "SessionViewer\|getSessionByIdAPI" -- ':!docs/'` vazio; nenhum `package-lock.json`.
Testes exigidos: os próprios gates (ainda não há suíte).
Riscos e dependências: erro de typecheck que exija mudança de comportamento ⇒ `needs_decision`.

## P0-02 — Vitest + Testing Library + MSW
UI: não            Depende (orq.): —
Objetivo: `pnpm test` roda testes de unidade, componente e route handler.
Escopo: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `msw` (dev, versões fixas); `vitest.config.mts` com alias `@/` e ambiente jsdom; `tests/setup.ts`; handlers MSW dos endpoints do AgentOS usados hoje (`/status`, `/agents`, `/teams`, `/sessions`) em `tests/msw/`; scripts `test` e `test:watch`. Primeiros testes: `src/lib/utils.ts`, `src/lib/constructEndpointUrl.ts`, `src/api/playground.ts` (com MSW) e um componente simples (`ModeSelector`).
Fora de escopo: cobertura mínima obrigatória (entra quando houver base).
Critérios de aceite: `pnpm test` verde; um teste vermelho proposital falha com mensagem legível; nenhum teste faz requisição fora do MSW (`onUnhandledRequest: 'error'`).
Testes exigidos: os listados no escopo.
Riscos e dependências: JSX no Vitest com `tsconfig` `jsx: preserve` (conferir a opção de esbuild/plugin na versão instalada; plugin novo ⇒ `needs_decision`).

## P0-03 — Playwright + fake orchestrator
UI: não            Depende (orq.): —
Objetivo: `pnpm test:e2e` roda o app real contra um orquestrador falso.
Escopo: `@playwright/test` (dev, só Chromium); `e2e/fake-orchestrator/server.ts`: servidor HTTP Node sem dependência, estado em memória, com os endpoints do AgentOS usados pelo chat (`/status`, `/agents`, `/teams`, `POST /agents/{id}/runs` com stream scriptado de eventos `RunStarted`/`RunContent`/`RunCompleted`, `/sessions`); `playwright.config.ts` com `webServer` para o fake e para o app; smoke: abrir o app, apontar o endpoint para o fake, escolher o agente, enviar mensagem e ver a resposta em stream.
Fora de escopo: telas de gestão (ainda falam com o Mongo); screenshots de design (entram com o design QA da P1).
Critérios de aceite: `pnpm test:e2e` verde 3× seguidas; o fake responde só a rotas conhecidas (404 nas demais).
Testes exigidos: o smoke do chat.
Riscos e dependências: `src/lib/mongodb.ts` lança erro no import sem `MONGO_*`; as páginas de gestão não podem ser carregadas no smoke sem Mongo (o smoke fica no playground).

## P0-04 — CI
UI: não            Depende (orq.): —
Objetivo: todo push/PR roda os gates.
Escopo: `.github/workflows/ci.yml`: pnpm com cache, `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `build`; job separado para `test:e2e` com o browser do Playwright em cache. `MONGO_*` de mentira só no passo de build (sem conexão real), documentado no workflow.
Fora de escopo: deploy, análise do Codacy.
Critérios de aceite: workflow verde num PR de teste; falha de lint/teste reprova o PR.
Testes exigidos: —
Riscos e dependências: `next build` executando `src/lib/mongodb.ts` (se precisar mudar o código para o build passar ⇒ `needs_decision`).

## P0-05 — Hardening mínimo das rotas atuais
UI: não            Depende (orq.): —
Objetivo: fechar as falhas graves das rotas que gravam no Mongo enquanto a API Admin não chega (são removidas na P3).
Escopo: em `src/app/api/{agents,tools}/**`: validar o corpo com zod (tipos e allowlist de campos; objeto onde se espera texto ⇒ 400, fecha injeção de operador); escapar o texto de busca antes do `$regex` (`agents/route.ts:29-31`, `tools/route.ts:24-25`); tipo de parâmetro de tool alinhado ao orquestrador (`string|integer|float|boolean|object|array`; o `number` atual derruba o carregamento da tool lá) no form e no schema; `description` da tool obrigatória (o orquestrador recusa vazia); `AgentForm` lista todas as tools (hoje só as 10 primeiras, `AgentForm.tsx:75`); `GET /api/tools/[id]` não quebra com `route` inválida (`tools/[id]/route.ts:40-42`). BUG-P0-02-1 (decisão 0002): `isValidUrl` (`src/lib/utils.ts`) sem regex de backtracking exponencial (`new URL()` + protocolo http(s)); o `it.fails` em `tests/lib/utils.test.ts` vira teste normal. `constructEndpointUrl` não lança `URIError` com entrada malformada (`%E0%A4%A`; achado do QA do P0-02).
Fora de escopo: auth (P2-01), mascarar headers (P3-03), migrar documentos com `number` já gravados (registrar a contagem no HANDOFF; migração ⇒ `needs_decision`).
Critérios de aceite: corpo `{"id": {"$ne": null}}` ⇒ 400 sem tocar o banco; busca `.*(a+)+$` não é interpretada como regex; tool com parâmetro `float` gravada e lida; agente enxerga a 11ª tool; `isValidUrl` com 10 mil caracteres inválidos responde em menos de 50 ms.
Testes exigidos: testes de route handler com `@/lib/mongodb` substituído (`vi.mock`) por coleções falsas em memória, sem `mongodb-memory-server`, um por critério.
Riscos e dependências: os forms atuais mudam pouco; a reescrita fica para a P3.

## P0-06 — Chat com stream do agno 2.5
UI: não            Depende (orq.): —
Objetivo: o chat mostra a resposta em stream com o orquestrador real (BUG-P0-03-1, decisão [0004](../decisions/0004-stream-runcontent-e-fontes.md)).
Escopo: em `src/types/playground.ts` (`RunEvent`) e `src/hooks/useAIStreamHandler.tsx`: tratar `RunContent`/`TeamRunContent` (eventos do agno 2.5, `agno/run/agent.py` e `agno/run/team.py`) como delta, anexando o `content` de cada evento ao texto da mensagem; não usar `replace(lastContent, '')` com delta (um delta igual ao anterior, ex. `"a"` seguido de `"a"`, some, e um delta que contém o anterior perde o trecho); `RunCompleted`/`TeamRunCompleted` seguem fixando o texto final; o `test.fail` de BUG-P0-03-1 em `e2e/chat.spec.ts` vira teste normal.
Fora de escopo: o resto do handler (tool calls, reasoning, mídia), o chat via BFF (P2).
Critérios de aceite: texto parcial visível antes do `RunCompleted` no e2e (o fake segura o `RunCompleted` por 3 s para a mensagem `segure o RunCompleted`); deltas repetidos (`"a"`, `"a"`) aparecem como `"aa"`; o mesmo para team (`TeamRunContent`); `pnpm test:e2e` verde 3× seguidas.
Testes exigidos: o e2e de BUG-P0-03-1 sem `test.fail`; teste de unidade/hook com MSW para deltas repetidos (agent e team).
Riscos e dependências: os eventos legados `RunResponseContent`/`TeamRunResponseContent` (conteúdo acumulado) continuam aceitos ou saem — se sair, `needs_decision`.
