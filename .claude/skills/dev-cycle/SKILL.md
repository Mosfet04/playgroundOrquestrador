---
name: dev-cycle
description: "Executa um item do roadmap do playground pela cadeia design → aprovação do usuário → dev → code review → QA → design QA, com loop de correção limitado, decisões técnicas levadas ao usuário e gate final. Uso: /dev-cycle P1-03 [--commit]"
disable-model-invocation: true
argument-hint: "<item-id> [--commit]"
---

Execute o item `$ARGUMENTS` de `docs/roadmap/` pela cadeia de desenvolvimento. Você (thread principal) **orquestra**: não edita código de produto e não pula estágio. Subagentes não herdam a conversa: cada prompt precisa ser autocontido (id do item, arquivo do item, spec de design, comandos de gate da fase, achados e decisões pendentes).

## Regra transversal: decisão técnica

Qualquer saída com `needs_decision`, `NEEDS_DECISION`, `blocked` ou `BLOCK` **pausa o ciclo**. Leve cada bloco `DECISAO` ao usuário com `AskUserQuestion` (opções do agente, recomendada primeiro). Registre a resposta em `docs/decisions/NNNN-<slug>.md` (contexto, opções, escolha, data) e em `decisions[]` do estado, e só então retome o estágio, passando a decisão no prompt. Você também não decide sozinho: se notar uma decisão técnica que nenhum agente levantou, pergunte.

## 1. Pré-voo

- `git status --porcelain` limpo (exceto retomada declarada). Branch atual = branch de trabalho do item (`Branch:` do item, se houver).
- Leia `CLAUDE.md` e o item. Anote `BASE=$(git rev-parse HEAD)`.
- Item com `Depende (orq.): FA-xx`: confira o status do FA em `../orquestradorIAPythonArgo/docs/roadmap/README.md`. Não concluído ⇒ pare e diga ao usuário que o FA roda antes, no `/dev-cycle` daquele repositório.
- Crie `.claude/dev-cycle/<item>.json` (ignorado pelo git) com `{"item","base","stage","round","design_round","trees":[],"decisions":[]}` e atualize a cada estágio: a compactação de contexto não pode perder o contador.

## 2. Design (só com `UI: sim`)

- Chame `ui-ux-designer` com o item, a spec anterior (se houver) e as decisões já tomadas. Espere o `DESIGN`.
- Depois: `git status --porcelain` só pode mostrar mudança em `docs/design/`; o resto invalida o estágio (reverta só esses arquivos e conte como violação).
- `artifacts: pendente de publicação` ⇒ publique você os mockups de `docs/design/<item>/` com o tool `Artifact` (tipo Design) e grave os links na spec.

## 3. Aprovação do design (gate do usuário)

Mostre ao usuário os links dos artifacts, o resumo do fluxo e os critérios visuais, e pergunte com `AskUserQuestion` (aprovar / ajustar com comentário). Ajuste ⇒ volta ao designer com o comentário. No máximo **2 rodadas** de design; estourou ⇒ escale. Sem aprovação, o dev não começa.

## 4. Dev

Chame `frontend-dev-specialist` com: id e arquivo do item, spec aprovada, gates da fase, decisões, regra de não commitar. Espere o `HANDOFF`.

## 5. Code review

- `git add -A && TREE=$(git write-tree)`; guarde o tree no estado.
- Diff para o revisor: `git diff --cached $BASE` (inclui arquivos novos). Rodadas seguintes: também `git diff <tree anterior> <tree atual>` (delta) e a tabela de achados anterior.
- Chame `frontend-reviewer`. Antes e depois confira `git status --porcelain`: a árvore não pode mudar durante a revisão.
- `REQUEST_CHANGES` ⇒ volte ao dev com os achados BLOCKER/MAJOR (MINOR a critério do dev, justificando). Cada achado é corrigido ou refutado com evidência. Depois, nova revisão sobre o delta.

## 6. QA

- Snapshot `git status --porcelain` antes. Chame `qa-engineer` com o item, a spec, o diff e os gates.
- Depois: qualquer mudança fora de `tests/`, `e2e/` e `docs/qa/` invalida o QA (reverta só esses arquivos e conte como violação).
- Os testes novos do QA passam por uma revisão curta do revisor (só o delta de testes).
- `FAIL` por bug de produção ⇒ volta ao dev com a repro; depois revisão do delta e QA de novo.

## 7. Design QA (só com `UI: sim`)

Chame `ui-ux-designer` em modo **DESIGN_QA** com a spec e os critérios visuais. `FAIL` ⇒ volta ao dev com as divergências, depois revisão do delta e novo design QA. A mesma verificação de `git status` do estágio 2 vale aqui.

## Modelos por estágio (decisão [0016](../../../docs/decisions/0016-p2-itens-modelos-crud-mongo.md) D-P2-2)

O frontmatter dos agentes vale para desenhar, implementar, a 1ª revisão do item e o QA. Nas chamadas abaixo, passe os parâmetros do tool `Agent`:

| Chamada | Parâmetros |
|---|---|
| `ui-ux-designer` em DESIGN_QA | `model: "sonnet"` |
| `frontend-reviewer` na revisão curta dos testes do QA | `model: "sonnet"` |
| `frontend-reviewer` em revisão de delta (rodada 2+) | `effort: "high"` |
| `frontend-dev-specialist` em item pequeno com `UI: não` (sem rotas novas nem vários módulos de `src/server`) | `model: "sonnet"` ([0021](../../../docs/decisions/0021-modelos-dev-sonnet-qa-enxuto.md)) |

QA enxuto (0021), sempre no prompt do `qa-engineer`: não duplicar teste do dev; só critério descoberto; um caso por classe de payload; e2e só para o que componente/BFF não alcança.

Retomar um subagente com `SendMessage` mantém o modelo da chamada original. Prefira retomar quando o contexto que ele já tem poupa reler o diff.

## 8. Limite

No máximo **3 rodadas** somando voltas de revisão, QA e design QA (as de aprovação de design contam à parte). Estourou ⇒ pare e escale ao usuário com um resumo (achados em aberto, o que foi tentado).

## 9. Gate final (você mesmo roda; não confie em relato)

Os comandos de gate da fase atual, listados em `CLAUDE.md`. Tudo verde ou o item não fecha.

## 10. Fechamento

- Com `--commit`: commit local com mensagem convencional (`feat|fix|chore(<escopo>): ... [<item>]`), corpo com resumo e a linha de co-autoria exigida pelo ambiente. **Nunca** push nem PR.
- Sem `--commit`: deixe a árvore alterada e mostre a mensagem de commit pronta.
- Atualize o status do item no `docs/roadmap/README.md` e resuma ao usuário: o que mudou, links de design, rodadas, decisões tomadas, achados relevantes, gates.
