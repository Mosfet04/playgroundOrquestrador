# 0005 — CI: actions por tag major e triggers

Data: 2026-10-14 · Decidido por: usuário (Mateus) · Item: P0-04 (D-P0-04-1, D-P0-04-2)

## Contexto

O workflow `.github/workflows/ci.yml` usa `actions/checkout`, `actions/setup-node`, `actions/cache` e `pnpm/action-setup`, roda com `permissions: contents: read` e sem secrets. Com `push` em qualquer branch mais `pull_request`, um PR de branch do próprio repositório roda a CI duas vezes (o `concurrency` não junta refs diferentes).

## Opções

D-P0-04-1 (fixação das actions):
- **A) Tag major** (`@v7`) — simples, recebe correções; risco de supply-chain baixo com token só leitura e sem secrets.
- B) SHA com comentário da versão — imutável, exige atualização manual ou Dependabot.

D-P0-04-2 (triggers):
- **A) `push` só na `main` + `pull_request`** — sem execução dupla; branch sem PR não roda CI.
- B) `push` em tudo + `pull_request` — toda branch roda, PR roda em dobro.

## Decisão

D-P0-04-1 = A; D-P0-04-2 = A. Rever a fixação por SHA se o workflow ganhar secrets ou permissão de escrita.
