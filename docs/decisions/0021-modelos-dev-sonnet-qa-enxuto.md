# 0021 — Dev em sonnet nos itens pequenos sem UI e QA enxuto

Data: 2026-10-24 · Fase: P2 · Status: aceita · Ajusta [0016](0016-p2-itens-modelos-crud-mongo.md) D-P2-2

## D-P2-4 — Modelos dos agentes, revisão após P2-01..03

Contexto: nos três primeiros itens da P2 o dev (opus/high) consumiu 146k–461k tokens por item, e o QA escreveu testes demais: a revisão curta cortou cerca de 80% deles (104 → 24 na P2-03), custando 130–200k por item. O revisor (opus/xhigh) achou bug real de segurança ou estado em todos os itens.

Opções: **A) dev em sonnet/high em item pequeno sem UI (revisor segue opus/xhigh); QA com regras de enxugamento em todo item**; B) só QA enxuto; C) dev sonnet sempre + QA enxuto; D) manter.

Escolha: **A**. Item com UI, ou com BFF/segurança de porte (vários módulos de `src/server` ou rotas novas), segue com dev opus. Regras do QA enxuto: não duplicar teste do dev; só critério descoberto; um caso por classe de payload; e2e só para o que o teste de componente/BFF não alcança. Regra em `.claude/skills/dev-cycle/SKILL.md`.
