# P3 — Editores com paridade

Os editores passam a oferecer o que o orquestrador aceita, lido do `GET /admin/schema` (FA-03), e cobrem os campos que hoje não aparecem (modelo, segredos, execução, teams). Contrato: `../orquestradorIAPythonArgo/docs/roadmap/FA-admin-config.md` (FA-01 a FA-07 concluídos). Decisões da fase: [0016](../decisions/0016-p2-itens-modelos-crud-mongo.md) e [0025](../decisions/0025-p3-itens-e-p3-01.md).

A P2-06 já antecipou parte do que era da fase: escrita só pela API Admin, `If-Match` com a versão lida, 422 mostrado no campo, exclusão hard e o fim do Mongo ([0024](../decisions/0024-crud-admin-api.md)).

Gates: os da P2 (lint, typecheck, test, contract:check, build, test:e2e, testes de segurança do BFF, nenhum segredo em `.next/static`).

Forma do `/admin/schema` (não tipada no OpenAPI; zod no BFF): `providers.{chat,embedder}[]` (`name`, `model_params[]`, `requires_base_url`); `agent.<campo>` e `team.<campo>` (`type`, `default`, `minimum`/`maximum` no inteiro); `team.mode[]`; `tool.http_method[]`; `tool.parameter_type[]`; `rag_config.search_strategy[]`; `api_key_ref.formats[]`; `config_store.writable`.

## P3-01 — Opções dos formulários pelo `/admin/schema`
UI: não            Depende (orq.): FA-03
Objetivo: os formulários de agent e tool oferecem as opções que o orquestrador em vigor aceita, sem lista fixa no playground.
Escopo: `src/server/orchestrator/schema.ts` (chave admin, zod só das seções usadas, chave extra ignorada) e `GET /api/config/schema` (`runtime = 'nodejs'`, erro mapeado como nas outras rotas). AgentForm e ToolForm leem o schema e trocam as listas fixas: providers de chat (`factoryIaModel`) e de embedder (RAG) por `providers.chat|embedder[].name`, métodos HTTP por `tool.http_method`, tipos de parâmetro por `tool.parameter_type`. O provider aparece pelo `name` do schema. Valor gravado que não está nas opções (provider retirado do orquestrador) continua selecionado e visível; quem decide no salvar é o orquestrador (422 no campo, como na P2-06). As listas `modelProviders`, `ragProviders`, `httpMethods` e `PARAMETER_TYPES` saem do código; o BFF deixa de validar esses enums (só texto não vazio) e o orquestrador valida. Schema carregando ⇒ selects desabilitados; falha ao carregar ⇒ mensagem no formulário com "tentar de novo" e salvar desabilitado. `config_store.writable = false` ⇒ aviso de configuração só leitura, campos e botões de salvar/excluir desabilitados. Fake orchestrator ganha `GET /admin/schema` (chave admin) com ao menos um provider fora da lista antiga.
Fora de escopo: `model_params` por provider, `base_url`/`requires_base_url`, `api_key_ref` e campos de execução (P3-02, P3-05); `team.mode` (P3-04); `search_strategy` (P3-05); motor genérico de campos (P5-01).
Critérios de aceite: as opções dos selects são as do schema (e2e com o provider do fake que não existia na lista antiga); chave admin e URL do orquestrador fora da resposta e de `.next/static`; schema inválido ou orquestrador fora ⇒ erro mapeado, formulário com a mensagem e sem salvar; store só leitura ⇒ nada editável; valor fora das opções preservado ao abrir e salvar.
Testes exigidos: BFF da rota (chave admin, 401 sem sessão, schema inválido ⇒ 502, orquestrador fora ⇒ 503/504); componente dos dois formulários (opções do schema, carregando, falha com tentar de novo, só leitura, valor fora das opções); e2e da opção vinda do fake.
Riscos e dependências: o schema é por processo do orquestrador (plugin novo aparece no restart dele); sem cache no BFF (uma leitura por abertura do formulário).
Resultado: `GET /api/config/schema` (módulo `src/server/orchestrator/schema.ts`) e o hook `useConfigSchema` alimentam provider de chat e de embedder, método HTTP e tipo de parâmetro; listas fixas e `PARAMETER_TYPES` removidos, BFF só exige texto não vazio (leitura da tool também aceita tipo fora da lista). Carregando, falha (com "Tentar de novo") e só leitura (`fieldset disabled`) com copy i18n. Padrão de agent/tool novo ausente das opções vira a 1ª opção. Limitação: o e2e de store só leitura não existe (o fake sempre responde `writable: true`); coberto por teste de componente.

## P3-02 — Editor de agent
UI: sim            Depende (orq.): FA-03, FA-07
Objetivo: o editor de agent cobre o documento inteiro que o orquestrador aceita.
Escopo: identidade, modelo (provider, `model_params` aceitos pelo provider no schema, `base_url` quando `requires_base_url`, `api_key_ref`), instruções, campos de execução da seção `agent` do schema (`markdown`, `add_history_to_context`, `num_history_runs` com mínimo e máximo, `add_datetime_to_context`, `reasoning`, com o default do schema), tools. O PUT passa a enviar o documento do formulário (sem a mesclagem da P2-06 para os campos agora cobertos).
Fora de escopo: RAG e seletor de segredo (P3-05); conflito 412 e desativar (P3-06).

## P3-03 — Editor de tool HTTP
UI: sim            Depende (orq.): FA-06
Objetivo: a tool HTTP é editada com a rota parametrizada e a requisição visível antes de salvar.
Escopo: rota com `{param}` ligada aos parâmetros tipados (`default_value`), headers por referência e mascarados (o fluxo `***` da P2-06), preview da requisição montada (sem chamar a rota).
Fora de escopo: seletor de segredo reutilizável (P3-05); tools MCP (P5-02).

## P3-04 — Teams
UI: sim            Depende (orq.): FA-02, FA-03
Objetivo: teams são listados, criados, editados e excluídos no playground.
Escopo: BFF `src/app/api/teams` sobre `/admin/config/teams` (mesmo padrão de agents); lista e editor: membros (agents existentes), modo (`team.mode` do schema), modelo líder, `markdown` e `add_history_to_context` da seção `team`. Fake orchestrator com teams em memória no `/admin/config`.
Fora de escopo: conflito 412 e desativar (P3-06).

## P3-05 — RAG e seletor de segredo
UI: sim            Depende (orq.): FA-03, FA-06
Objetivo: RAG completo e um seletor de segredo único para modelo, embedder e header.
Escopo: `doc_name`, embedder (provider do schema), `search_strategy` (do schema) e parâmetros do RAG; seletor de referência `env:`/`file:` pelos `api_key_ref.formats` do schema, usado no `api_key_ref` do modelo, no do embedder e nos headers da tool. Nunca o valor do segredo.

## P3-06 — Concorrência e exclusão
UI: sim            Depende (orq.): FA-02, FA-05
Objetivo: conflito de edição e exclusão com UX própria.
Escopo: tela de conflito no 412 (recarregar ou comparar com a versão atual), desativar (soft delete, `active: false`) ao lado de excluir (hard, já existente, com confirmação). Observações do design QA do P1-05b: larguras fixas nas colunas curtas da tabela (Tools, Status, Atualizado); Dialog de excluir com margem de 16 px abaixo de `sm`; busca de `/agents` e `/tools` no mesmo padrão em 390 px.
