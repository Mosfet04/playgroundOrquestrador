# 0029 — Recorte da P3-05 (RAG e seletor de segredo)

Data: 2026-10-26 · Fase: P3 · Status: aceita

## D-P3-05-1 — Seletor de segredo

Contexto: o `api_key_ref` (modelo e embedder) e os headers da tool são texto livre com os formatos como dica. O orquestrador só aceita `env:<PROVEDOR>_API_KEY` (`[A-Z][A-Z0-9_]{0,119}_API_KEY`) ou `file:/caminho/absoluto` (`parse_secret_ref`).

Opções: **A) componente único: formato (`env:`/`file:`, dos `api_key_ref.formats` do schema) + alvo digitado, com a regra do orquestrador validada no cliente (duplicada, como D-P3-03-3) e a referência montada visível; sem listar segredos existentes**; B) listar variáveis/arquivos disponíveis (endpoint novo no orquestrador, expõe o inventário de segredos); C) texto livre com dica, só unificado.

Escolha: **A**.

## D-P3-05-2 — Campos do embedder

Contexto: o schema já traz `model_params` e `requires_base_url` por provider de embedder; o formulário só tem `doc_name`, provider e modelo.

Opções: **A) documento inteiro: `doc_name`, provider, modelo, `search_strategy` (do schema), `model_params` do embedder por provider, `base_url` quando exigido e `api_key_ref` pelo seletor, reaproveitando as seções de `common/`**; B) só `doc_name`, provider, modelo, `search_strategy` e `api_key_ref`, o resto preservado invisível.

Escolha: **A**.

## D-P3-05-3 — RAG desligado

Contexto: desligar o RAG grava `rag_config: null` e apaga a configuração.

Opções: **A) desligar grava o `rag_config` com `active: false` e os valores; religar volta como estava**; B) manter `null`.

Escolha: **A**.

## D-P3-05-4 — Seletor nos headers da tool

Contexto: a P3-03 tem os estados texto, referência e oculto (`***`) por linha.

Opções: **A) cada linha ganha o modo Texto | Segredo; Segredo usa o seletor; header sensível com texto segue recusado, com a ação "Usar segredo"; `***` como hoje**; B) o valor segue texto, com um botão que abre o seletor e escreve a referência no campo.

Escolha: **A**.

## Modelos dos agentes

Os da 0028 D-P3-04-3 (designer, dev, QA e design QA em sonnet; revisor opus/xhigh). O usuário pediu para revisá-los depois deste item.

## Aprovação do design

Spec [docs/design/P3-05.md](../design/P3-05.md) aprovada na 1ª rodada (2026-10-26), com os pontos do §10 como propostos.

## D-P3-05-5 — Referência gravada fora da regra

Contexto: `api_key_ref` ou header gravado fora da regra (`env:openai_key`, `vault:x`, texto sem prefixo) ao abrir o formulário.

Opções: **A) visível e editável com aviso; inalterada não bloqueia (o orquestrador decide, 422 no campo); alterada, a regra bloqueia. Texto sem prefixo aparece em claro, como na P3-02**; B) sem prefixo abre oculto (`***` + "Substituir"), com máscara no BFF (muda o contrato); C) bloquear sempre.

Escolha: **A**.

## D-P3-05-6 — Timeout global dos testes

Contexto: o dev pôs `testTimeout: 15_000` global no `vitest.config.mts` (fora do item) porque 3 testes passavam de 5 s; o revisor mediu a causa: o `AgentForm` ~40% mais pesado, com a subárvore do RAG montada (`hidden`) mesmo sem RAG.

Opções: **A) reverter o global, montar os campos do RAG desligado só quando há valores e, se ainda precisar, `{ timeout }` por teste**; B) manter o global de 15 s.

Escolha: **A** (2026-10-27).
