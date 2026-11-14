# 0033 — P4-03: "Testar agora"

Data: 2026-11-14 · Fase: P4 · Status: aceita · Ajusta [0031](0031-p4-itens-p4-01-e-modelos.md) D-P4-2

## D-P4-03-1 — Modelos dos agentes por porte do item

Contexto: o P4-02 custou ~3,3M tokens equivalentes a sonnet (opus = 2×) com dev, revisor e QA em opus. O P4-03 é pequeno: um link no status "aplicada" do editor, sem rota nem BFF novo. O usuário pede entregas de qualidade sem consumir a janela de tokens.

Opções: **A) perfil enxuto: designer sonnet/medium, dev sonnet/high, revisor opus/high, QA sonnet/high enxuto, design QA sonnet/medium com poucas capturas**; B) intermediário (dev opus/high, revisor opus/high, o resto em sonnet); C) manter a 0031.

Alcance: **regra por porte**, não só este item. Item pequeno (sem rota nem BFF novo, 1–2 componentes de produto) usa o perfil A; item grande segue a 0031. O frontmatter dos agentes não muda: o `/dev-cycle` passa `model` e `effort` na chamada.

Escolha: **A, como regra por porte**. Tabela de `.claude/skills/dev-cycle/SKILL.md` atualizada; a reavaliação no fim da P4 (0031) continua valendo.

## D-P4-03-2 — Playground aberto sem sessão

Contexto: o estado do chat (zustand) sobrevive à navegação client-side, e "Testar agora" mostrava a conversa da visita anterior, contra o critério "sem histórico de sessão". Pelo item Playground da navegação, a conversa antiga reaparecia com a URL sem `session`, e a mensagem seguinte abria outra sessão.

Opções: **A) limpar as mensagens ao montar o playground sem `?session=`, por qualquer caminho (efeito em `ChatArea`)**; B) limpar só ao vir do "Testar agora" (sinal extra na URL ou no estado; a inconsistência do item Playground continua).

Escolha: **A**. A sessão anterior segue na lista lateral.

## R1 da revisão — Limpar também sem remontar

Contexto: o efeito rodava só ao montar. Clicar em "Playground" na navegação estando em `/playground?…&session=X` não remonta a página, e a conversa X ficava com a URL sem `session`.

Opções: **A) o efeito reage a `sessionId`: toda transição para "sem sessão" esvazia a conversa (a 1ª mensagem, de null para X, não limpa)**; B) registrar como limitação.

Escolha: **A**.

## BUG-P4-03-QA-1 — Voltar para uma sessão

Contexto: com o R1, Voltar de "sem sessão" para `?session=X` mostrava a conversa vazia, porque a sessão só era carregada ao abrir a página (ou quando o orquestrador voltava). O mesmo acontecia em Voltar/Avançar entre duas sessões.

Opções: **A) carregar a sessão quando `?session=` muda para outra sessão sem run em andamento; a 1ª mensagem de conversa nova não recarrega**; B) desfazer o R1 (limpar só ao abrir) e registrar o clique em "Playground" já na página como limitação; C) aceitar como limitação.

Escolha: **A**. A URL é a fonte do estado navegável (CLAUDE.md).

## Fechamento — BUG-P4-03-QA-2

Contexto: o item chegou ao limite de 3 rodadas com revisão, QA e design QA aprovados e o gate verde. Ficou aberto um bug menor anterior ao item: com o GET da sessão A lento, clicar em A e logo em B mostra a conversa B, mas a URL termina em `session=A` (`SessionItem` faz `await getSession(A)` e só depois `setSessionId(A)`).

Opções: A) commitar com a pendência e o teste de falha esperada; **B) corrigir antes, numa 4ª rodada (dev, revisão do delta, QA), passando do limite**.

Escolha: **B**.

## R12 da revisão — URL da sessão clicada

Contexto: a correção do BUG-P4-03-QA-2 mudava a URL depois do GET. Com o GET lento, sair antes da resposta (clicar em "Playground" ou ir ao editor) ainda gravava `?session=` na URL, inclusive em `/agents/<id>`. Já acontecia antes do item.

Opções: **A) `SessionItem` muda a URL antes de carregar; a resposta velha é descartada pela guarda de `getSession`**; B) `getSession` devolve se a carga ainda vale e `SessionItem` decide; C) commitar com a pendência.

Escolha: **A**.
