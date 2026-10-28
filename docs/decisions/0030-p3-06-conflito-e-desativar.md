# 0030 — Recorte da P3-06 (conflito de edição e desativar)

Data: 2026-10-27 · Fase: P3 · Status: aceita

## D-P3-06-1 — Tela de conflito no 412

Contexto: salvar com a versão lida desatualizada dá 412 (`ConfigVersionConflict`); a resposta do orquestrador traz só a mensagem, sem o documento atual.

Opções: **A) o editor relê a versão atual pelo BFF e abre um diálogo com os campos que diferem (o seu valor × o atual) e duas saídas: "Recarregar a atual" (descarta as suas edições) ou "Salvar as minhas por cima" (PUT com o If-Match da versão atual); sem merge campo a campo**; B) comparar com só "Recarregar"; C) sem comparar, só recarregar ou salvar por cima.

Escolha: **A**.

## D-P3-06-2 — Desativar × switch "Ativo"

Contexto: o orquestrador desativa pelo `DELETE` sem `hard` (`active: false`, recusa com 409 `used_by` quando em uso); o switch "Ativo" do formulário grava pelo PUT, sem checar uso.

Opções: **A) botão "Desativar" ao lado de "Excluir" no editor, com confirmação e o mesmo diálogo de "em uso" no 409; com a entidade inativa vira "Reativar" (PUT com `active: true`); o switch "Ativo" sai do formulário (um caminho só, com a checagem de uso)**; B) botão e manter o switch; C) ação só na lista.

Escolha: **A**.

## D-P3-06-3 — Contrato do BFF para desativar

Contexto: `DELETE /api/{agents,teams,tools}/[id]` hoje é sempre a exclusão de vez (`?hard=true`, D-P2-06-3).

Opções: **A) `DELETE /api/<kind>/[id]?soft=true` chama o orquestrador sem `hard` e devolve o documento; sem a query segue a exclusão de vez**; B) rota própria `POST /api/<kind>/[id]/deactivate`.

Escolha: **A**.

## D-P3-06-4 — `soft` mal formado

Contexto: na revisão (R5), qualquer `soft` diferente de `true` (`?soft=1`, `?soft=yes`) caía na exclusão de vez, irreversível; o orquestrador recusa `hard` fora de `true`/`false` com 422.

Opções: **A) `soft` presente e diferente de `true` ⇒ 400, sem chamar o orquestrador**; B) manter (só `soft=true` desativa; o resto exclui de vez).

Escolha: **A** (2026-10-27).

## Modelos dos agentes

Os da 0028 D-P3-04-3 (designer, dev, QA e design QA em sonnet; revisor opus/xhigh). O usuário pediu para revisá-los depois deste item.

## Aprovação do design

Spec [docs/design/P3-06.md](../design/P3-06.md) aprovada na 1ª rodada (2026-10-27), com os pontos do §9 como propostos.
