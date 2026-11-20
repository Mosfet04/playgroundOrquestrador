# AG3 — Playground com o orquestrador no agno 3.1.12

O levantamento está em [docs/contracts/orquestrador-agno-3.md](../contracts/orquestrador-agno-3.md) e as decisões em [0036](../decisions/0036-agno3-adaptacao.md). A F3 do orquestrador está concluída (`5507f0f`, F3-10). Todos os itens usam o perfil enxuto de modelos (D-AG3-0-2).

## AG3-01 — `expose_reasoning` no editor de agente
UI: sim            Depende (orq.): — (F3-10 concluído)
Objetivo: salvar um agente pelo editor não pode apagar `expose_reasoning`, e o campo passa a ser editável (D-AG3-01-1 A).
Escopo:
- [agents.ts](../../src/server/orchestrator/agents.ts): `agentSchema`, `AgentInput`, corpo do PUT/POST e `FORM_FIELDS`, para o 422 com `field: "expose_reasoning"` cair no campo.
- [schema.ts](../../src/server/orchestrator/schema.ts): ler `agent.expose_reasoning` (`{"type":"boolean","default":true}`) e usar o default do schema na criação.
- Formulário: switch "Expor raciocínio" em [ExecutionSection.tsx](../../src/components/management/common/ExecutionSection.tsx), logo abaixo de `reasoning`.
  - Com `reasoning` desligado, o switch fica desabilitado, mas o valor é mantido e enviado.
  - Ajuda: o campo vale para clientes AG-UI (os.agno.com); o chat do playground mostra o raciocínio de qualquer jeito.
- `agentFormValues.ts`, `agentDiff.ts` (o campo aparece no "Revisar antes de salvar" e no histórico) e i18n pt-BR/EN.
Fora de escopo: mudar o stream do chat conforme o campo (o REST manda tudo; F5 do orquestrador); os textos `reasoningHelp`/`reasoningWarning` (AG3-04).
Critérios de aceite:
- Agente lido com `expose_reasoning: false` e salvo sem tocar no campo ⇒ o PUT leva `false`.
- Ligar ou desligar o switch ⇒ o PUT leva o valor novo, e o diff mostra Antes × Depois.
- Criação sem tocar no campo ⇒ vai o default do `/admin/schema`.
- `reasoning` desligado ⇒ o switch fica desabilitado com o valor preservado.
- 422 com `field: "expose_reasoning"` ⇒ o erro aparece no campo.
- Copy em pt-BR e EN, tokens do design system.
Testes exigidos: unit do mapeamento de agents (ida e volta, documento sem o campo, 422); componente do ExecutionSection (habilitado e desabilitado, valor preservado); e2e salvando um agente com `false` contra o fake (o fake guarda e devolve o campo).
Riscos e dependências: documento antigo sem o campo ⇒ o schema zod aceita a ausência e o formulário usa o default do schema.
Resultado: `expose_reasoning` lido, editado e enviado (BFF, `agentSchema`, `FORM_FIELDS`, `/admin/schema` obrigatório como os demais flags: orquestrador anterior à F3-10 deixa a seção Execução indisponível). Com `reasoning` desligado, o switch fica `disabled` com dica e o valor segue no PUT; 422 nesse estado foca o switch do raciocínio. Fake guarda e devolve o campo.

## AG3-02 — Sessões do usuário logado e 404 de sessão alheia
UI: não            Depende (orq.): — (F3 concluída)
Objetivo: a barra lateral lista só as sessões do usuário logado, e o envio numa sessão de outro dono mostra uma mensagem própria (D-AG3-02-1 A + B).
Escopo:
- [chat.ts](../../src/server/orchestrator/chat.ts): `listSessions` manda o `user_id` da sessão do playground. O `getSessionHistory` continua sem `user_id`.
- O 404 do run (`Session not found`) vira um código próprio no BFF (ex.: `session_not_owned`), e não `not_found` genérico.
- O chat mostra a mensagem própria ("Esta conversa é de outro usuário. Comece uma nova.") com a ação de nova conversa. A mensagem usa o componente de erro do chat que já existe, sem layout novo. Copy em pt-BR e EN.
- Fake orchestrator: `GET /sessions` filtra por `user_id`, e o run numa sessão de outro dono responde 404 como o 3.1.12.
Fora de escopo: esconder o histórico de sessão alheia.
Critérios de aceite:
- A lista chama o orquestrador com o `user_id` do login.
- Sessões de outro dono não aparecem (e2e com duas sessões de donos diferentes no fake).
- Sessão alheia aberta por `?session=` mostra o histórico, e o envio mostra a mensagem própria, sem stack nem `detail` do orquestrador.
- 404 de outra causa continua `not_found`.
Testes exigidos: BFF (query `user_id`; 404 `Session not found` ⇒ código próprio; outro 404 ⇒ `not_found`); componente da mensagem; e2e no fake.
Riscos e dependências: o `user_id` vem da sessão do servidor, nunca do browser.

## AG3-03 — Snapshot do contrato 3.1.12 e fake orchestrator no formato 3.x
UI: não            Depende (orq.): — (F3 concluída)
Objetivo: o contrato e os testes refletem o 3.1.12.
Escopo:
- `pnpm contract:update` contra o 3.1.12 em `development`. A chave de run fica só no ambiente do usuário, que roda o comando. O dev ajusta o que o `typecheck` acusar.
- Fake e fixtures MSW:
  - `nested_depth` em todo evento SSE (`0` no run principal).
  - Team em modo `route`: `TeamToolCallStarted`/`TeamToolCallCompleted`, depois os eventos do membro com `parent_run_id`; `member_responses` no `TeamRunCompleted`; sem `time_to_first_token` no `TeamModelRequestCompleted`.
  - Agente com `reasoning`: `ToolCallStarted`/`ToolCallCompleted` de `think`/`analyze`, `ReasoningStarted`, `ReasoningStep` (com `content` e `reasoning_content`) e `ReasoningCompleted` (`content.reasoning_steps`); `RunCompleted` com `reasoning_steps`/`reasoning_content`; sem `reasoning_messages` no `RunContent`.
- Os comentários `agno 2.5` em [playground.ts](../../src/types/playground.ts) passam a `agno 3`.
Fora de escopo: mudar o consumo dos eventos de raciocínio (AG3-04); `RunPaused`.
Critérios de aceite:
- `contract:check` verde com o snapshot novo (110 rotas, sem `GET /models` nem `GET /`).
- Suíte e e2e verdes com o fake 3.x.
- Um cenário de agente com `reasoning` disponível no fake para o AG3-04.
Testes exigidos: os existentes contra o fake novo; um teste de stream de team `route` 3.x (delegação e membro).
Riscos e dependências: depende de o usuário rodar o `contract:update` com o orquestrador 3.1.12 de pé.

## AG3-04 — Raciocínio do agno 3 no chat
UI: sim            Depende (orq.): — · Depende: AG3-03 (fixtures)
Objetivo: o painel de passos de raciocínio mostra o raciocínio do agno 3, sem chip de tool duplicado (D-AG3-04-1 A).
Escopo:
- [useAIStreamHandler.tsx](../../src/hooks/useAIStreamHandler.tsx): é um defeito, então começa com um teste vermelho com os payloads reais.
  - Os passos vêm de `ReasoningStep.content` (`title`, `action`, `result`, `reasoning`, `next_action`, `confidence`), de `ReasoningCompleted.content.reasoning_steps` e de `RunCompleted.reasoning_steps`, e não de `extra_data.reasoning_steps`.
- O chip de `think`/`analyze` não aparece quando o agente (ou o membro de team) tem `reasoning` ligado. Uma tool do usuário com esse nome, num agente sem `reasoning`, continua com chip.
  - Como o chat sabe disso fica com o dev, desde que se apoie no payload real: a config do agente ou os eventos `Reasoning*` do mesmo run. Se a escolha mudar o contrato do BFF, vira DECISAO.
- Textos `agents.form.reasoningHelp` e `agents.form.reasoningWarning` (pt-BR/EN) passam a descrever o comportamento do agno 3: o modelo chama as tools de raciocínio durante o próprio run, com mais chamadas ao modelo por resposta. O aviso sobre tools que alteram dados continua.
Fora de escopo: `expose_reasoning` no stream REST (F5 do orquestrador); o raciocínio no histórico recarregado, já que o `chat_history` não traz os passos.
Critérios de aceite:
- Stream de agente com `reasoning` ⇒ o painel lista os passos em ordem, sem duplicar quando chegam `ReasoningCompleted` e `RunCompleted`.
- Sem chip de `think`/`analyze`.
- Um agente sem `reasoning` com uma tool chamada `think` mostra o chip.
- Textos novos nos dois idiomas.
Testes exigidos: unit do handler com os payloads do 3.1.12 (vermelho primeiro); componente do painel; e2e com o cenário de reasoning do fake.
Riscos e dependências: a deduplicação dos passos depende da identidade de cada um (título + ordem). O critério tem que estar no teste.
