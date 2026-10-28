# 0026 — Recorte da P3-02 (editor de agent)

Data: 2026-10-25 · Fase: P3 · Status: aceita

## D-P3-02-1 — Memória e resumo da sessão

Contexto: o documento do agent tem `user_memory_active` e `summary_active` (usados na montagem do agno: memória do usuário e resumo da sessão), fora da seção `agent` do `/admin/schema`.

Opções: **A) incluir na P3-02, dois switches com o default da entidade (`false`)**; B) deixar fora (preservados pela mesclagem do PUT).

Escolha: **A**. O objetivo é cobrir o documento inteiro; os nomes ficam fixos no playground, como `nome` e `prompt`.

## D-P3-02-2 — Valor de `model_params`

Contexto: o schema traz só os nomes aceitos por provider (`providers.chat[].model_params`), sem tipo; o orquestrador aceita texto, número ou booleano (`temperature`, `stop`, `reasoning_effort`).

Opções: **A) linhas nome + valor, nome das opções do provider e valor em texto inferido (número finito ⇒ número, `true`/`false` ⇒ booleano, o resto ⇒ texto)**; B) tipo explícito por linha; C) só números.

Escolha: **A**. O orquestrador valida.

## D-P3-02-3 — Modelos dos agentes na P3-02

Opções: **A) designer opus/high (frontmatter), dev sonnet/high; revisor opus/xhigh; QA e design QA em sonnet**; B) designer e dev em sonnet; C) designer e dev em opus.

Escolha: **A**.

## Design aprovado

Spec [docs/design/P3-02.md](../design/P3-02.md) e artifact https://claude.ai/artifact/AaNgc6KUrcaYhA8T1g5VME aprovados pelo usuário na 1ª rodada (2026-10-25), inclusive a recusa no browser de `api_key_ref` sem prefixo `env:`/`file:` (um segredo colado não sai em requisição).

## D-P3-02-4 — Erro de `model_params` por linha

Contexto: a spec aprovada previa o 422 em `model_params.<nome>` na linha do parâmetro, mas o orquestrador sempre recusa como `model_params` (`model_config.py::_validated_params` omite a chave de propósito); o revisor apontou o caminho como código sem uso real.

Opções: **A) cortar o caminho por linha: o 422 de `model_params` aparece no grupo**; B) manter para quando o orquestrador detalhar o parâmetro.

Escolha: **A** (2026-10-25). Anula a parte por linha do V-P3-02-9; o erro local de validação da linha (nome ou valor vazio) continua.
