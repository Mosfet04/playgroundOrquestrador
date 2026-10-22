# 0018 — Fake orchestrator passa a exigir a chave só na P2-03

Data: 2026-10-22 · Item: P2-02 · Status: aceita

## D-P2-02-1 — Quando o fake orchestrator exige a chave

Contexto: o P2-02 pedia que o fake exigisse a chave como o real (401/403). Até a P2-03 o chat chama o fake direto do browser, sem chave (inclusive `DELETE /sessions`, rota admin); exigir já quebra os e2e de chat, sessões, estados e i18n.

Opções: **A) levar para a P2-03, quando o chat passa pelo BFF e o fake vira só servidor a servidor; até lá 401/403/chave errada ficam cobertos pelos testes do cliente com MSW**; B) exigir já, com exceção temporária pelo `Origin` do app do e2e; C) exigir só em `/admin*`, `/metrics*` e `/health`.

Escolha: **A**.
