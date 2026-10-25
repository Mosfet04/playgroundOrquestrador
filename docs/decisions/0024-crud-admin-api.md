# 0024 — P2-06: CRUD de agents e tools pela API Admin

Data: 2026-10-24 · Fase: P2 · Status: aceita

## D-P2-06-1 — Modelo do dev

Contexto: o item reescreve as quatro rotas de CRUD, cria módulo novo em `src/server`, trata segredo mascarado e If-Match e remove o Mongo. Pela [0021](0021-modelos-dev-sonnet-qa-enxuto.md) é BFF/segurança de porte.

Opções: **A) dev opus/high**; B) dev sonnet/high, com o revisor opus/xhigh como rede.

Escolha: **A**. Erro sutil de contrato ou de segredo custaria rodadas extras de revisão em opus/xhigh, o que anularia a economia.

## D-P2-06-2 — Um ciclo ou dois

Contexto: o item avisa que o diff pode passar de 600 linhas (dividir agents e tools se preciso).

Opções: **A) um ciclo e um commit**; B) P2-06a (agents) e P2-06b (tools).

Escolha: **A**. Agents e tools seguem o mesmo padrão; dois ciclos dobrariam revisão e QA.

## D-P2-06-3 — Excluir: soft ou hard

Contexto: o DELETE do orquestrador é lógico por padrão (`active: false`, o item continua na lista); com `?hard=true` apaga. O "Excluir" de hoje apaga e avisa que não pode ser desfeito.

Opções: **A) `?hard=true`**: UI e textos iguais, e a escolha com UX fica para a P3-06; B) soft: reversível, mas os textos ficam errados e o item continua na lista como inativo.

Escolha: **A**.

## D-P2-06-4 — Coluna "Atualizado" sem dado

Contexto: a entidade do orquestrador não tem `created_at`/`updated_at`.

Opções: **A) a coluna fica e mostra "—", na ordem do store**; B) remover a coluna (mudança visual); C) uma chamada de histórico por item.

Escolha: **A**. A P3 refaz as listas.

## D-P2-06-5 — Textos que citam Mongo e restart

Contexto: o GettingStarted (`sync`, pt-BR e EN) e o README dizem que a config fica no MongoDB e só vale depois de reiniciar o orquestrador. Com a API Admin ela vale a quente (FA-04).

Opções: **A) atualizar para "fica na config do orquestrador e vale no chat logo depois de salvar" e ajustar o teste de docs**; B) só tirar "MongoDB"; C) deixar para a P4-01.

Escolha: **A**.

## D-P2-06-6 — Scripts `sample-data.js` e `cleanup-sample-data.js`

Contexto: os scripts gravam com mongosh direto no Mongo do orquestrador, por fora da API Admin.

Opções: **A) remover os dois e apontar o README para o seed do orquestrador**; B) manter, com aviso de rodar o reload.

Escolha: **A**.

## D-P2-06-7 — 422 no campo do formulário

Contexto: o critério pede o 422 no campo certo, mas hoje só alguns campos mostram erro.

Opções: **A) texto fixo novo ("Valor recusado pelo orquestrador" / "Rejected by the orchestrator") via `setError`, no padrão visual atual, em todos os campos do formulário. Um `field` fora do formulário, ou um 422 sem `field`, mostra o toast de erro de hoje com o código. O valor nunca é ecoado**; B) só toast.

Escolha: **A**.

## D-P2-06-8 — Versão otimista entre browser e BFF

Contexto: o GET do BFF passa a devolver `version`, que precisa voltar no PUT e no DELETE.

Opções: **A) header `If-Match: "<version>"`, sem ele 400**; B) `version` no corpo.

Escolha: **A**. É a mesma semântica do orquestrador e serve ao DELETE, que não tem corpo.

## D-P2-06-9 — `prompt` gravado como lista

Contexto: o seed do orquestrador (Mongo e YAML) grava `prompt` como lista, a leitura não estrita a mantém e o GET da API Admin a devolve. O BFF exigia string, então a lista de agents caía em 502. A escrita estrita só aceita string.

Opções: **A) ler `string | string[]`, mostrar unido por "\n" no formulário e salvar como string**; B) editor com aviso ou só leitura (UI nova); C) tirar o item da lista e logar; D) corrigir só no orquestrador.

Escolha: **A**. O primeiro salvar normaliza o documento. Normalizar no orquestrador pode virar um item FA depois.

## D-P2-06-10 — Item da lista em formato desconhecido

Contexto: a leitura não estrita do orquestrador pode devolver um campo com tipo inesperado (ex.: `required` de parâmetro).

Opções: **A) a lista inteira falha (502 `invalid_response`), como no resto do BFF; formatos legados conhecidos são tratados explicitamente**; B) pular o item e logar.

Escolha: **A**.
