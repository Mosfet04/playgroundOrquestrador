# 0016 — P2: itens em sequência, modelos por estágio e CRUD fora do Mongo

Data: 2026-10-21 · Fase: P2 · Status: aceita

## D-P2-1 — Como rodar a P2

Contexto: a P2 estava só em nível de fase (cinco itens num parágrafo).

Opções: **A) detalhar no molde de item e rodar um ciclo e um commit por item**; B) um ciclo e um commit para a fase inteira (diff grande, revisão menos confiável).

Escolha: **A**. Itens em [P2-bff-auth.md](../roadmap/P2-bff-auth.md), branch `feat/p2-bff-auth`.

## D-P2-2 — Modelos dos agentes da cadeia

Contexto: reduzir consumo de tokens sem perder qualidade. Hoje: designer opus/high, dev opus/high, revisor opus/xhigh, QA sonnet/high.

Opções: **A) ajuste por estágio**: opus onde a qualidade decide (desenho, implementação, 1ª revisão em xhigh); sonnet no design QA e na revisão curta dos testes do QA; revisões de delta (rodada 2+) em opus/high; QA segue sonnet; B) rebaixar no frontmatter (designer sonnet, revisor opus/high em tudo); C) manter.

Escolha: **A**. Regra em `.claude/skills/dev-cycle/SKILL.md` (seção "Modelos por estágio"); o frontmatter dos agentes não muda.

## D-P2-3 — CRUD de agents e tools ainda no Mongo

Contexto: `src/app/api/agents|tools` gravam no Mongo; a P2-05 removia o pacote `mongodb` e o `CLAUDE.md` diz que a partir da P2 nada acessa o Mongo, mas os editores pela API Admin só chegavam na P3.

Opções: **A) item novo P2-06: as rotas atuais passam a chamar `/admin/config` pelo cliente do servidor (P2-02), mesma UI; o pacote `mongodb` sai nele**; B) o Mongo fica até a P3 (P2-05 remove só o dashboard).

Escolha: **A**. A P3 segue com o formulário dirigido por schema, teams e a UX de conflito (ETag/412).
