# 0013 — E2E contra o build de produção (P1-07)

Data: 2026-10-17 · Item: P1-07 · Status: aceita

## D-P1-07-1 — Como validar "5× verde na CI" e o tempo antes/depois

Contexto: push e PR não acontecem dentro do `/dev-cycle`, então a CI real não roda durante o item.

Opções:
- **A) Validar localmente simulando a CI**: `CI=true` num clone limpo, suíte e2e 5× seguidas, tempo antes/depois medido localmente e registrado em `docs/qa/P1-07.md`. A confirmação no GitHub Actions fica para o push do usuário, anotada no roadmap.
- B) Fechar só depois da CI real: o item sai do ciclo sem status concluído até o usuário fazer push e rodar a CI 5×.

Escolha: **A**.

## D-P1-07-2 — Onde acontece o build de produção do e2e na CI

Opções:
- **A) O `webServer` do Playwright faz `next build && next start` com `CI=true`**: `CI=true pnpm test:e2e` fica autocontido localmente e na CI. O job e2e builda de novo (cerca de 1 min a mais), e o workflow muda pouco (env do Mongo fake no job e2e).
- B) Um step `pnpm build` no workflow e o `webServer` só com `next start`: rodar localmente com `CI=true` exige buildar antes.
- C) Reaproveitar o `.next` do job `checks` via artifact (`needs: checks`): evita o build duplicado, mas serializa os jobs e acrescenta upload e download.

Escolha: **A**. Localmente, sem `CI`, o e2e continua no `next dev`.

## D-P1-07-3 — Cobertura do `suppressHydrationWarning` no `<html>`

Contexto: no build de produção o React não compara atributos ao hidratar. Com o e2e da CI rodando em produção, a remoção do `suppressHydrationWarning` do `<html>` (que evita o aviso do `class` do next-themes) deixa de ser pega na CI e só aparece no e2e local (dev). O filtro de `e2e/theme.spec.ts` passou a capturar também `pageerror` e `Minified React error #418`, de modo que texto divergente é pego nos dois modos (antes não era pego nem no dev).

Opções:
- **A) Aceitar e documentar**: a explicação fica em comentário no `theme.spec.ts`, e a limitação é registrada em `docs/qa/P1-07.md` e no roadmap. Não acrescenta nada novo.
- B) Teste unitário do `RootLayout` conferindo o atributo: dá cobertura na CI, mas testa detalhe de implementação, e o layout é um server component async, o que exige mocks.
- C) Um projeto extra do Playwright rodando o `theme.spec` no `next dev` dentro da CI: é fiel ao comportamento, mas põe dois servidores Next no job e aumenta o tempo da CI.

Escolha: **A**.
