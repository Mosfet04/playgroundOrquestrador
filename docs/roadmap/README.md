# Roadmap — playground como gestor do orquestrador

Ordem de execução = numeração. Cada item passa por `/dev-cycle <item> --commit` (design → aprovação → dev → code review → QA → design QA → gate final) e cabe em ~600 linhas de diff. Decisões que originaram este roadmap: [docs/decisions/0001-gestao-realtime.md](../decisions/0001-gestao-realtime.md).

O playground deixa de escrever no Mongo e passa a usar a **API Admin** do orquestrador (fase FA em `../orquestradorIAPythonArgo/docs/roadmap/FA-admin-config.md`), que valida, persiste e aplica a config a quente. Item com `Depende (orq.)` só começa com o FA correspondente concluído.

| Fase | Entrega | Depende de | Arquivo |
|---|---|---|---|
| P0 Fundação | só pnpm, typecheck verde, Vitest/MSW, Playwright + fake orchestrator, CI, hardening mínimo das rotas atuais | — | [P0-fundacao.md](P0-fundacao.md) |
| P1 Design system e navegação | Design System no Claude Design, tokens claro/escuro, rotas por URL, i18n pt-BR/EN, estados de erro | P0 | [P1-design-navegacao.md](P1-design-navegacao.md) |
| P2 BFF e auth | login, cliente do orquestrador no servidor, chat via BFF, markdown seguro, fim do Mongo | P1, FA-02 | [P2-bff-auth.md](P2-bff-auth.md) |
| P3 Editores com paridade | formulários dirigidos por `/admin/schema`: agent, tool, team, RAG, segredos, concorrência | P2, FA-02/03/05/06 | [P3-editores.md](P3-editores.md) |
| P4 UX realtime | status de aplicação, diff, "testar agora", histórico, configurações da plataforma | P3, FA-04/05 | [P4-realtime.md](P4-realtime.md) |
| AG3 Agno 3.1.12 | `expose_reasoning`, sessões por usuário, snapshot e fake 3.x, raciocínio no chat | P4, F3 | [AG3-agno3.md](AG3-agno3.md) |
| QA1 Correções do QA de 23/11 | shell fixo, sessões e status, erro do modelo, truncamento, padrão de erro de campo, validação e rascunho, headers, dashboard, consistência | AG3 (QA1-09: FA-08) | [QA1-correcoes.md](QA1-correcoes.md) |
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
| P3-03 | concluído (editor de tool HTTP: rota `{param}` ligada a parâmetro obrigatório com ação de criar, `default_value` por tipo, headers texto/referência/`***` com nome sensível recusado no browser, preview da requisição como o orquestrador monta; decisão 0027) |
| P3-04 | concluído (teams pela API Admin: BFF `/api/teams`, lista, editor com o documento inteiro — membros, modo em cartões, modelo do líder, prompt e execução —, Teams na navegação, excluir agent membro mostra os teams do 409 `used_by`; lista comum de agents/teams/tools como follow-up; decisão 0028) |
| P3-05 | concluído (seletor de segredo único — formato `env:`/`file:` + alvo com a regra do orquestrador — no modelo do agent, do líder, no embedder e nos headers com modo Texto \| Segredo e "Usar segredo"; RAG com o documento inteiro — estratégia, parâmetros, URL base e referência do embedder —, desligado guarda os valores com `active: false`; decisão 0029) |
| P3-06 | concluído (conflito no 412 em agent, team e tool com a comparação "o seu valor × atual" — Recarregar a atual ou Salvar as minhas por cima, segredo nunca exibido —; Desativar/Reativar ao lado de Excluir com selo de estado, switch "Ativo" removido; BFF `DELETE ?soft=true` e `soft` inválido ⇒ 400; colunas fixas, margem do Dialog, busca em 390 px, altura das Instruções; decisão 0030) |
| P4-01 | concluído (status de aplicação no editor — aplicada na revisão N, não aplicada com o tipo do erro e a versão anterior no ar, não confirmada com Recarregar —; edição salva fica no editor; `runtimeRevision` nas escritas, `not_applied`/`not_confirmed` no BFF; indicador "runtime · rev. N" na navegação e no Sheet por `GET /api/orchestrator/runtime` + contexto; decisão 0031) |
| P4-02 | concluído (diálogo "Revisar antes de salvar" em agent, team e tool: Antes × Depois sem segredo, cancelar sem request, o `data` listado é o enviado; Salvar `aria-disabled` com dica sem mudança; ids como conjunto; janela do texto longo também no conflito; criação sem diálogo) |
| P4-03 | concluído ("Testar agora" no status aplicada de agent e team, para o playground com a entidade e conversa vazia; playground sem `?session=` vazio, Voltar/Avançar carrega a sessão, resposta de sessão atrasada descartada; decisão 0033) |
| P4-04 | concluído (histórico de versões em painel lateral nos editores de agent, team e tool, com diff mascarado e paginação; restaurar com confirmação e o status aplicado da P4-01, 412 abre o conflito em modo restaurar; badge vN no editor; decisão 0034) |
| P4-05 | concluído (página `/settings` com a saúde do orquestrador — badge geral, revisão, tempo de resposta e os checks —, config store gravável ou só leitura e providers de chat e embedder; "Recarregar runtime" com confirmação; indicador da navegação vira status de conexão online/degradado/fora do ar com link para `/settings`, uma leitura por carga, sem polling; sem versão do orquestrador; decisão 0035) |
| AG3-01 | concluído (switch "Expor raciocínio" em Execução, desabilitado com o valor preservado sem `reasoning`; PUT preserva `expose_reasoning`; default do `/admin/schema`; 422 no campo; linha no diff e no histórico; decisão 0036) |
| AG3-02 | concluído (lista de sessões com o `user_id` do login; 404 "Session not found" do run vira `session_not_owned` no BFF e a mensagem "Esta conversa é de outro usuário. Comece uma nova." no chat; fake com dono de sessão; decisão 0036) |
| AG3-03 | concluído (snapshot 3.1.12; fake e fixtures com `nested_depth`; team `route` com delegação e membro; cenário de reasoning no fake para o AG3-04) |
| AG3-04 | concluído (painel de raciocínio com os passos do agno 3 — `ReasoningStep`, `ReasoningCompleted`, `RunCompleted` — por título + ordem, `<details>` por passo; chip de `think`/`analyze` some quando chega o passo dele; ajuda e aviso do raciocínio reescritos; decisão 0036) |
| QA1-01 | concluído (só o `main` rola: `relative` no main + `overflow-clip` na casca do AppShell; header mobile opaco; `loading.tsx` por seção; foco no h1 pós-exclusão com `focusHeadingWhenReady`) |
| QA1-02 | concluído (lista de sessões relida do servidor no fim do run, sem tirar a sessão no erro, chave estável por `session_id`; BFF da lista com `updated_at` (D-QA1-02-3); indicador fora do ar/degradado relê com backoff 5/15/30/60 s e no foco; mensagens ancoradas perto do composer; aba Agente/Team pelo `?agent=`/`?team=` gravado no clique) |
| QA1-03 | concluído (BFF reescreve o RunError do stream em código próprio — overloaded/invalidParam/other — com `detail` saneado e teto de 8k; erro no chat com frase por código, "Detalhes técnicos" e Reenviar; pergunta sem resposta marcada ao reabrir, com o assistant só de tool call descartado no BFF; troca de sessão esvazia a conversa e o histórico atrasado não sobrescreve envio novo; markdown seguro na bolha do usuário; decisão 0037 D-QA1-03-0..6) |
| QA1-04 | concluído (nome longo truncado com `min-w-0`/`truncate`/`title` no seletor e dropdown do playground, composer ("Mensagem para {nome}", nome cortado em 24), tabela de agents `table-fixed` com `min-w-[860px]`, cabeçalho, cards de membros com altura igual, estado vazio e chip `{param}`; `title` visível no hover; placeholder da Rota curto; e2e mede bounding boxes em 1367/1024/390; decisão 0037 D-QA1-04-0..1) |
| QA1-05 | concluído (padrão único de campo: `FieldError` com slot sempre montado, ícone e `aria-live`, helper `errorA11y` para `aria-invalid`/`aria-describedby` nos três formulários; borda e anel de erro por `aria-[invalid=true]:` em Input, TextArea, Select e `OptionCard`; altura `h-10 md:h-9` em Input e Select; fundo `bg-background`; badge `h-6`; Switch desabilitado distinguível nos dois temas; e2e mede y, alturas, cores e contraste em 1367/390 nos dois temas; decisão 0037 D-QA1-05-0..2) |
| QA1-06 | pendente |
| QA1-07 | pendente |
| QA1-08 | pendente |
| QA1-09 | pendente (espera o FA-08 no orquestrador) |
| QA1-10 | pendente |
| QA1-11 | pendente |

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
