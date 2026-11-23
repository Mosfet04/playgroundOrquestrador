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
