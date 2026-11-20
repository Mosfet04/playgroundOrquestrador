# Orquestrador no agno 3.1.12: o que muda no playground

O orquestrador (`../orquestradorIAPythonArgo`) trocou o agno 2.5.8 pelo 3.1.12 na fase F3, encerrada no commit `5507f0f` (F3-10). Este documento lista o que o playground precisa ajustar para funcionar com ele. As mudanças de contrato do lado do orquestrador estão no runbook dele: `../orquestradorIAPythonArgo/docs/runbooks/f3-agno-3.md`, seção "Mudanças de contrato".

Tudo aqui foi verificado em 2026-11-20 com o orquestrador real, de ponta a ponta:

1. Atlas Local descartável e Ollama `qwen3`.
2. Sessões criadas no 2.5.8 (`774683f`), em agente, team e agente com `reasoning`.
3. Migração `session_migration`, com `--check` → `up` → `--check` (saída 0).
4. Orquestrador 3.1.12 de pé, e o playground (build de produção) logado e chamando pelo BFF e pelo browser (Playwright).

Nenhuma decisão abaixo foi tomada: cada item que muda contrato, UX ou arquitetura passa pelo usuário (`DECISAO D-<item>-<n>`, como manda o CLAUDE.md).

## O que já funciona sem mudança

Isto foi testado com o 3.1.12 real e ficou ok:

- Login, `/health`, `/admin/health`, status de conexão e revisão do runtime.
- Listas de agentes e teams, `/admin/schema` e o CRUD de agents, teams e tools. O `/admin/schema` continua com os quatro modos de team que o `ModeSection` já conhece.
- Sessões migradas do 2.5.8: a lista, o histórico (`GET /sessions/{id}`) e a continuação do run guardam o contexto. O agente lembra da primeira mensagem, que foi gravada no 2.5.8.
- Stream do chat:
  - `RunContent` e `TeamRunContent` continuam vindo como delta.
  - `RunCompleted` e `TeamRunCompleted` continuam como estão.
  - Os eventos de membro de team continuam com `agent_id` e `parent_run_id`, como na decisão 0007.
- Dashboard (`/metrics`).
- `pnpm typecheck` e `pnpm test` passam com o snapshot do 3.1.12 regenerado (131 arquivos, 2330 testes; rodado numa cópia, o snapshot do repo não foi trocado).

## Precisa mudar

### 1. Editor de agente apaga `expose_reasoning` ao salvar (perda de configuração)

- **O campo:** o orquestrador ganhou o campo de agente `expose_reasoning` (boolean, default `true`, F3-10).
  - Com `reasoning: true` e `expose_reasoning: false`, o AG-UI esconde as tool calls de raciocínio (`think`/`analyze`).
  - O `PUT /admin/config/agents/{id}` **substitui o documento inteiro**.
- **O problema:** o playground não conhece o campo. Salvar qualquer agente pelo editor manda o documento sem ele, e o orquestrador volta o valor para `true`.
  - Reproduzido: criado com `false`, `PUT` sem o campo, e a leitura devolveu `true`.
  - Resultado: quem desligou a exibição do raciocínio volta a expô-la no AG-UI sem perceber.
- **Onde mexer:**
  - [src/server/orchestrator/agents.ts](../../src/server/orchestrator/agents.ts): `agentSchema`, `AgentInput`, montagem do corpo e `FORM_FIELDS` (o 422 pode vir com `field: "expose_reasoning"`).
  - [src/server/orchestrator/schema.ts](../../src/server/orchestrator/schema.ts): `agent.expose_reasoning` agora vem em `/admin/schema` (`{"type":"boolean","default":true}`).
  - Formulário: [ExecutionSection.tsx](../../src/components/management/common/ExecutionSection.tsx), `agentFormValues.ts`, `agentDiff.ts` e i18n.
- **Decisão:**
  - A) Expor o switch, só habilitado com `reasoning` ligado.
  - B) Só preservar o valor lido ao salvar, sem UI.
  - O mínimo para não perder configuração é B.

### 2. Snapshot do contrato desatualizado

[orchestrator-openapi.json](orchestrator-openapi.json) ainda é o do 2.5.8 (84 rotas; o 3.1.12 tem 110). Rode `ORCHESTRATOR_URL=... ORCHESTRATOR_API_KEY_RUN=... pnpm contract:update` contra o orquestrador 3.1.12 em `development` e confira o `contract:check`.

O que sai do contrato:

- `GET /models`: removido no agno 3.
- `/eval-runs*`: respondem 404 até a F8 do orquestrador.
- `GET /`

O playground não usa nenhuma dessas rotas. As rotas novas (`/learnings*`, `/queue*`, `/service-accounts*`, `/filesystem*`, `checkpoints`, `resume`, `fork`, `compact`...) são administrativas ou opcionais.

### 3. Sessão de outro `user_id`: o run passa a dar 404

- **Mudança no orquestrador (F3):** um run numa sessão cujo dono é outro `user_id` responde `404 {"detail":"Session not found"}` antes de rodar. No 2.5.8, ele rodava numa conversa à parte.
- **Por que acontece no playground:**
  - O playground manda como `user_id` o usuário logado ([runs.ts](../../src/app/api/playground/runs.ts)).
  - A lista de sessões ([chat.ts](../../src/server/orchestrator/chat.ts), `listSessions`) não filtra por usuário.
  - Por isso a barra lateral mostra sessões de outros clientes (os.agno.com, curl, outro login), e enviar mensagem numa delas falha.
- **O que a UI mostra hoje:** só "Algo deu errado durante a resposta. Erro durante a execução.", porque o BFF responde `404 not_found`. Reproduzido com uma sessão do 2.5.8 de `user_id: u1` e o login `e2e`. Ler o histórico dela continua funcionando (`GET /sessions/{id}` sem `user_id` responde 200).
- **Decisão:**
  - A) Passar `user_id` (o usuário logado) em `listSessions`. O `GET /sessions?user_id=` do 3.1.12 filtra; conferido, só voltam as sessões do dono.
  - B) Manter a lista e tratar o 404 do run com uma mensagem própria ("conversa de outro usuário; comece uma nova").
  - A e B não se excluem.
  - Atenção: passar `user_id` também no `getSessionHistory` faz o detalhe de sessão alheia virar 404.

## Deveria mudar (UX e consistência)

### 4. Raciocínio: as tools `think`/`analyze` aparecem como chamadas de tool

- **Mudança no orquestrador:** no 3.x, `reasoning: true` vira `ReasoningTools`. Não existe mais fase de raciocínio separada nem `reasoning_max_steps`. O modelo chama `think`/`analyze` durante o próprio run.
- **Stream REST do 3.1.12:**
  - `ToolCallStarted`/`ToolCallCompleted` com `tool.tool_name` `think` ou `analyze`, e o texto do raciocínio em `tool.tool_args`.
  - Além disso, `ReasoningStarted`, `ReasoningStep` e `ReasoningCompleted`.
  - O `expose_reasoning: false` vale só para o AG-UI. O REST que o playground usa continua mandando tudo; isso é escopo da F5 do orquestrador.
- **Efeito no playground:**
  - O chat mostra um chip de tool `think` com status "concluída".
  - O painel de passos de raciocínio fica vazio.
  - No histórico de uma sessão recarregada, os chips não aparecem. O `chat_history` traz a chamada como uma mensagem `assistant` sem `content`, e o filtro atual não a mostra, o que está correto.
- **Defeito anterior ao 3.x (o 2.5.8 já mandava assim):**
  - O [useAIStreamHandler.tsx](../../src/hooks/useAIStreamHandler.tsx) lê os passos em `chunk.extra_data.reasoning_steps`, mas nenhum dos dois agno manda `extra_data`.
  - Onde os passos estão de fato:
    - `ReasoningStep`: o passo vem em `content` (`title`, `action`, `result`, `reasoning`, `next_action`, `confidence`) e o texto acumulado em `reasoning_content`, campo novo no 3.x.
    - `ReasoningCompleted`: a lista vem em `content.reasoning_steps`.
    - `RunCompleted`: vem em `reasoning_steps` no topo, junto com `reasoning_content` e `reasoning_messages`.
  - Comece com um teste vermelho com esses payloads.
- **Decisão:** mostrar `think`/`analyze` como raciocínio (painel de passos) em vez de chip de tool, ou manter o chip.
- **Textos:** `agents.form.reasoningHelp` ("pensa em etapas antes de responder") e `agents.form.reasoningWarning` ("nessa fase") em [pt-BR.json](../../messages/pt-BR.json) e [en.json](../../messages/en.json) descrevem a fase separada do 2.5.8.
  - O comportamento agora: o modelo chama as tools de raciocínio durante o run, com mais chamadas ao modelo por resposta.
  - O aviso sobre tools que alteram dados continua valendo, porque as tools do agente são chamadas no mesmo run.

### 5. Fake orchestrator e fixtures no formato do 3.x

O [e2e/fake-orchestrator](../../e2e/fake-orchestrator/server.ts) e os handlers MSW simulam o 2.5.8. Para os testes refletirem o 3.1.12:

- **`nested_depth`:** todo evento SSE traz esse campo novo, `0` no run principal.
- **Team em modo `route`:** a delegação aparece como `TeamToolCallStarted`/`TeamToolCallCompleted`, seguida dos eventos do membro (`RunStarted`, `ModelRequest*`, `RunContentCompleted`, `RunCompleted`) com `parent_run_id`. `TeamRunCompleted` ganha `member_responses`. `TeamModelRequestCompleted` perdeu `time_to_first_token`.
- **Agente com `reasoning`:** emite `ToolCallStarted`/`ToolCallCompleted` de `think`/`analyze` e `ReasoningStep` com `reasoning_content`. O `RunContent` não traz mais `reasoning_messages`.
- **`RunPaused`:** continua sem tratamento, como no P2-03.

Os comentários `agno 2.5` em [src/types/playground.ts](../../src/types/playground.ts) passam a ser `agno 3`. Os nomes dos eventos que o playground consome não mudaram.

## Sem ação no playground

- **Migração dos dados:** é do orquestrador (runbook, antes de liberar tráfego). O playground não acessa o Mongo desde a P2.
- **AG-UI:** o playground não usa (o chat é REST/SSE). As mudanças do AG-UI no runbook valem para os.agno.com e outros clientes AG-UI.
- **`background=true`, `/knowledge/content`, `/schedules`, `/approvals`:** o playground não usa.
- **Cancelamento:** o playground aborta o fetch e não chama `/runs/{id}/cancel`, então nada muda.
