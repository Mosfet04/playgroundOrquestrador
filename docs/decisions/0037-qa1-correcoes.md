# 0037 — Correções do QA visual e de UX de 23/11/2026

Data: 2026-11-23 · Fase: QA1 · Status: aceita

Origem: relatório de QA manual no deploy do Vercel, com 32 achados (5 P1, 12 P2, 15 P3) e 3 pontos "a confirmar". Itens em [docs/roadmap/QA1-correcoes.md](../roadmap/QA1-correcoes.md).

## D-QA1-0-1 — Como tocar os achados

Opções: **A) fase QA1 com itens agrupados por causa, cada um no `/dev-cycle`**; B) P1 no ciclo e P2/P3 direto em lotes, sem designer nem revisor; C) só escrever os itens.

Escolha: **A**. 11 itens, P1 primeiro. Perfil enxuto, com o intermediário no QA1-05 (mexe nos três formulários).

## D-QA1-02-1 — Status de conexão depois do cold start (#5)

Contexto: a [0035](0035-p4-05-configuracoes.md) D-P4-05 fixou uma leitura por carga, sem polling. Depois de um cold start o indicador fica "fora do ar" com o orquestrador respondendo.

Opções: **A) reler só fora do ar ou degradado, com backoff (5 s, 15 s, 30 s, depois 60 s) e na volta do foco**; B) reler quando outra chamada ao BFF dá 2xx; C) os dois.

Escolha: **A**. Revoga em parte a D-P4-05: online continua sem leitura extra.

## D-QA1-02-2 — Ancoragem do chat com poucas mensagens (#7)

Escolha: **embaixo, perto do composer** (padrão de chat), e não no topo.

## D-QA1-03-1 — Erro do modelo no chat (#6)

Contexto: o orquestrador não grava o run que falhou, então o erro some ao reabrir a sessão.

Opções: **A) só no playground: mensagem amigável por código, detalhes num colapsável, Reenviar, e a pergunta sem resposta marcada ao reabrir**; B) esperar um item FA que grave o erro no histórico.

Escolha: **A**. Gravar o erro no orquestrador fica para um item FA futuro.

## D-QA1-09-1 — Coluna "Atualizado" (#13)

Contexto: a API Admin devolve só o documento + `version` (`_body` em `src/presentation/routes/admin_config.py`); o `updated_at` existe no Mongo e não sai na resposta.

Opções: **A) item FA-08 no orquestrador põe `updated_at` na lista e no GET; até lá a coluna sai**; B) remover a coluna.

Escolha: **A**. O QA1-09 tem `Depende (orq.): FA-08`.

## D-QA1-06-1 — Vírgula decimal nos parâmetros do modelo (#3)

Opções: **A) a inferência converte `0,7` no número `0.7`; nome numérico conhecido com valor não numérico dá erro inline**; B) recusar a vírgula com erro inline.

Escolha: **A**.

## D-QA1-06-2 — Formato do ID (#14)

Contexto: o orquestrador aceita qualquer id.

Opções: **A) só no playground, na criação: `^[a-z0-9_-]+$` com erro inline; id existente fora do padrão continua editável**; B) A + item FA para o orquestrador recusar com 422.

Escolha: **A**.

## D-QA1-06-3 — Memória do usuário por padrão

Contexto: a criação de team começa com a memória ligada ([teamFormValues.ts](../../src/components/management/teams/teamFormValues.ts)) e a de agente, desligada.

Escolha: **desligada nos dois**.

## D-QA1-0-4 — Pontos "a confirmar"

- Markdown na mensagem do usuário: **entra** (QA1-03), com o mesmo renderer seguro do agente.
- Lembrar a aba Agente/Team no reload: **entra** (QA1-02), na URL pelo nuqs.

## D-QA1-0-5 — Modelos dos subagentes por risco

Contexto: a regra por tamanho ([0033](0033-p4-03-testar-agora.md)) punha item com vários módulos no perfil cheio (QA opus, revisor xhigh), mesmo sem risco, e item pequeno com corrida assíncrona no dev sonnet.

Opções: **A) classificar por risco: estado assíncrono, auth/segurança, rota/BFF ou `src/server` novo ⇒ dev opus/high; senão dev sonnet/high. Revisor fixo em opus/high, QA em sonnet/high (QA enxuto), revisão dos testes do QA sonnet/medium; xhigh sai do revisor**; B) manter a regra por tamanho.

Escolha: **A** (2026-11-23). Vale do QA1-02 em diante; tabela em `.claude/skills/dev-cycle/SKILL.md`. Frontmatter: revisor `effort: high`, QA `model: sonnet`.

## D-QA1-02-3 — Horário da sessão na resposta do BFF (#4)

Contexto: para a lista mostrar o horário novo de uma sessão existente, o BFF precisa devolver o `updated_at` do orquestrador. A 1ª versão do QA1-02 mandava esse valor no campo `created_at`.

Opções: **A) renomear o campo da resposta do BFF para `updated_at` (com fallback para o `created_at` do orquestrador) e o cliente ler esse nome**; B) manter `created_at` com o valor de `updated_at`.

Escolha: **A** (2026-11-24). Contrato só browser↔BFF; nada muda no orquestrador.

## D-QA1-03-0 — Designer em item de risco

Contexto: na revisão dos modelos ao abrir o QA1-03, a tabela da D-QA1-0-5 subia o designer para `sonnet/high` em item de risco, mas o risco (stream, estado do chat, segurança) está no código, não no visual.

Opções: **A) designer e design QA sempre `sonnet/medium`, reaproveitando mockups; o resto da tabela fica**; B) manter a tabela; C) perfil enxuto do roadmap (dev sonnet) no QA1-03.

Escolha: **A** (2026-11-24). O QA1-03 roda como item de risco: dev opus/high, revisor opus/high, QA sonnet/high enxuto, revisão dos testes do QA sonnet/medium (ou o orquestrador, se o delta for pequeno), designer/DQA sonnet/medium.

## D-QA1-03-2 — Quando o Reenviar aparece

Contexto: o roadmap só pede o botão; quais erros o mostram é escolha de produto. Reenviar uma pergunta órfã de sessão reaberta grava a mensagem de novo no orquestrador.

Opções: **A) todo erro com mensagem enviada, exceto cancelado pela pessoa, sem entidade e sessão de outro usuário; `aria-disabled` com motivo durante um stream; o Reenviar substitui a bolha de erro sem duplicar a pergunta**; B) todo erro, inclusive cancelado; C) só os transitórios (`overloaded`, `network`, `unavailable`, `interrupted`).

Escolha: **A** (2026-11-24), aceitando a mensagem repetida no histórico do orquestrador ao reenviar uma pergunta órfã. Design do QA1-03 aprovado na 1ª rodada ([docs/design/QA1-03.md](../design/QA1-03.md)).

## D-QA1-03-3 — Evento de erro do run no contrato BFF→browser

Contexto: para o texto cru do provedor não chegar ao browser, o BFF reescreve o evento SSE `RunError`/`TeamRunError` no stream do run.

Opções: **A) o evento vira só `{event, session_id, error: {kind: overloaded|invalidParam|other, param?, detail?}}`, com `detail` saneado; `content`, `error_type` e `additional_data` saem; os outros eventos passam byte a byte; classificação em `src/server/orchestrator/runError.ts`**; B) A mantendo também o `content` saneado.

Escolha: **A** (2026-11-24). Contrato só browser↔BFF; nada muda no orquestrador. Também aceito o desvio: o Reenviar pela marca "sem resposta" leva a pergunta para o fim da conversa, onde a resposta chega (a ordem que o orquestrador grava).

## D-QA1-03-4 — Corrida da troca de sessão e falso "sem resposta" (revisão do QA1-03)

Contexto: corrida anterior ao item, que o Reenviar piora. Clicar outra sessão deixa as mensagens da anterior na tela até o GET do histórico voltar; um envio nessa janela vai para a sessão nova, e o histórico atrasado sobrescreve o stream ao vivo. À parte, o loader descarta resposta com `content` vazio (só mídia ou tool) e a marca "sem resposta" acusa um falso órfão.

Opções: **A) corrigir no QA1-03: `getSession` não grava durante um stream e a troca de sessão esvazia a conversa ou mostra carregamento antes do GET; a marca considera a resposta gravada, não só a exibida**; B) registrar como limitação ou item novo.

Escolha: **A** nos dois (2026-11-24).

## D-QA1-03-5 — Resposta só de tool call no histórico

Contexto: com a D-QA1-03-4, um assistant sem texto conta como resposta. O agno 3 grava a mensagem de tool call (`content` vazio) do run que falha depois de uma tool, e a pergunta desse run perdia a marca "sem resposta" ao reabrir (critério 3).

Opções: **A) o BFF descarta o assistant sem texto que só tem `tool_calls`; com mídia ou sem nada continua contando; o formato da resposta do BFF não muda**; B) voltar ao filtro antigo (sem texto não conta); C) manter e aceitar a falta da marca.

Escolha: **A** (2026-11-24).

## D-QA1-03-6 — 4ª rodada para os bugs do QA (B1, B2)

Contexto: o QA do QA1-03 deu PASS com dois MINOR em `it.fails`. B1: o histórico pedido antes de um envio que chega depois do fim do run apaga a rodada nova da tela. B2: `x-goog-api-key: AIza…` e `Authorization: Basic …` não são redigidos no `detail`. O ciclo estava no limite de 3 rodadas.

Opções: **A) 4ª rodada para corrigir os dois**; B) corrigir só o B2 e registrar o B1; C) registrar os dois.

Escolha: **A** (2026-11-24).

## D-QA1-04-0 — Revisão dos modelos ao abrir o QA1-04

Contexto: pedido de revisar custo × benefício dos subagentes. Nos itens simples anteriores (QA1-01, P4-04, P4-05) a revisão aprovou na 1ª rodada só com MINOR; o custo que sobra está em chamadas que não mudam o resultado.

Opções: A) revisão dos testes do QA pelo orquestrador quando o delta for pequeno (≤ ~150 linhas), senão `sonnet/medium`; B) designer em item simples sem tela ou fluxo novo só com spec em texto e critérios mensuráveis, reaproveitando o artifact existente, sem mockup novo, e DQA só com as capturas dos critérios; C) revisor `opus/medium` em item simples; D) QA `sonnet/medium` em item simples.

Escolha: **A e B** (2026-11-24). O revisor fica em `opus/high` e o QA em `sonnet/high` (C e D recusados: perderiam achado sutil). O QA1-04 roda como item simples: designer/DQA sonnet/medium só spec, dev sonnet/high, revisor opus/high, QA sonnet/high enxuto. Tabela em `.claude/skills/dev-cycle/SKILL.md`.

## D-QA1-04-1 — Placeholder da Rota/URL (#32)

Contexto: o texto da spec (`https://api.exemplo.com/clima`, 29 caracteres) não cabe em 390 px: o input mono usa 16 px no celular (~10 px/caractere), 290 px de texto para 266 px úteis.

Opções: **A) `https://exemplo.com/api` / `https://example.com/api` (23 caracteres), cabe nas duas larguras**; B) outro texto curto; C) manter o da spec mudando fonte ou layout do campo.

Escolha: **A** (2026-11-24).
